// Watches the open Google Chat conversation, pre-filters locally, asks the
// backend when a moment looks promising, and shows the suggestion panel.
(function () {
  const { scoreMoment } = self.GifHeuristics;
  const { findComposer, readMessages, readDraft, insertIntoComposer } = self.ChatDom;
  const ui = self.GifUi;

  const DEFAULTS = {
    enabled: true,
    threshold: 0.35, // local heuristic score needed before calling the backend
    contextSize: 8, // messages sent to the backend
    cooldownSec: 90, // quiet time after a suggestion is shown or dismissed
    sendDraft: true,
  };
  let settings = { ...DEFAULTS };
  chrome.storage.sync.get(DEFAULTS, (s) => (settings = { ...DEFAULTS, ...s }));
  chrome.storage.onChanged.addListener((changes) => {
    for (const [k, { newValue }] of Object.entries(changes)) settings[k] = newValue;
  });

  let cooldownUntil = 0;
  let lastKey = "";
  let inFlight = 0;
  let timer = null;

  function contextKey(messages, draft) {
    return JSON.stringify([messages.map((m) => m.text), draft]);
  }

  async function evaluate() {
    if (!settings.enabled || Date.now() < cooldownUntil || ui.isOpen()) return;
    const composer = findComposer();
    if (!composer) return;

    const messages = readMessages(composer, settings.contextSize);
    const draft = settings.sendDraft ? readDraft(composer) : "";
    if (!messages.length && !draft) return;

    const key = contextKey(messages, draft);
    if (key === lastKey) return;
    lastKey = key;

    const { score, blocked } = scoreMoment(messages, draft);
    if (blocked || score < settings.threshold) return;

    const requestId = ++inFlight;
    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: "suggest", payload: { messages, draft } });
    } catch {
      return; // extension reloaded or background unavailable
    }
    // A newer evaluation started while this one was waiting: drop the stale result.
    if (requestId !== inFlight || !response || !response.ok) return;
    const suggestion = response.data;
    if (!suggestion.suggest || !suggestion.gifs.length) return;
    // Conversation moved on (message sent, draft changed a lot)?
    if (contextKey(readMessages(composer, settings.contextSize), settings.sendDraft ? readDraft(composer) : "") !== key) return;

    cooldownUntil = Date.now() + settings.cooldownSec * 1000;
    ui.show(composer, suggestion, {
      onPick: (gif) => insertIntoComposer(composer, gif.url),
      onDismiss: () => {},
      onSnooze: () => (cooldownUntil = Date.now() + 15 * 60 * 1000),
    });
  }

  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(evaluate, delay);
  }

  // Typing in the composer: wait for a pause so we react to what was written.
  document.addEventListener(
    "input",
    (e) => {
      if (e.target && e.target.isContentEditable) {
        if (ui.isOpen() && !readDraft(e.target)) ui.hide();
        schedule(700);
      }
    },
    true,
  );

  // New messages arriving (from anyone): debounce bursts of DOM changes.
  // Changes inside the composer are covered by the input listener, and our own
  // panel is not a new message.
  new MutationObserver((records) => {
    const relevant = records.some((r) => {
      const el = r.target.nodeType === Node.ELEMENT_NODE ? r.target : r.target.parentElement;
      return el && !el.closest('[contenteditable="true"], #gif-suggester-root');
    });
    if (relevant) schedule(1200);
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener(
    "keydown",
    (e) => {
      if (!ui.isOpen()) return;
      if (e.key === "Escape") {
        ui.hide();
        e.stopPropagation();
      } else if (e.altKey && /^[1-3]$/.test(e.key)) {
        if (ui.pick(Number(e.key) - 1)) {
          e.preventDefault();
          e.stopPropagation();
        }
      } else if (e.key === "Enter" && !e.shiftKey) {
        ui.hide(); // message is being sent
      }
    },
    true,
  );
})();
