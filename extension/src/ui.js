// Suggestion panel rendered in a shadow root so Chat's styles can't touch it.
(function (root) {
  const STYLE = `
    :host { all: initial; }
    .panel {
      position: fixed; z-index: 2147483647;
      display: flex; flex-direction: column; gap: 6px;
      padding: 8px; border-radius: 12px;
      background: #fff; color: #1f1f1f;
      box-shadow: 0 4px 16px rgba(0,0,0,.18);
      font: 12px/1.3 "Google Sans", Roboto, Arial, sans-serif;
      max-width: 420px;
      animation: pop .14s ease-out;
    }
    @media (prefers-color-scheme: dark) {
      .panel { background: #2d2e30; color: #e3e3e3; }
    }
    @keyframes pop { from { opacity: 0; transform: translateY(6px); } }
    .head { display: flex; align-items: center; gap: 6px; }
    .reason { flex: 1; opacity: .75; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row { display: flex; gap: 6px; }
    button.gif {
      padding: 0; border: 2px solid transparent; border-radius: 8px; overflow: hidden;
      background: #0001; cursor: pointer; height: 96px;
    }
    button.gif:hover, button.gif:focus-visible { border-color: #0b57d0; outline: none; }
    button.gif img { height: 100%; display: block; }
    button.icon {
      border: 0; background: transparent; color: inherit; cursor: pointer;
      font-size: 14px; padding: 2px 6px; border-radius: 6px; opacity: .7;
    }
    button.icon:hover { opacity: 1; background: #0001; }
    .foot { font-size: 10px; opacity: .55; text-align: right; }
  `;

  let host = null;

  function hide() {
    if (host) host.remove();
    host = null;
  }

  /**
   * @param {Element} anchor the composer; the panel sits just above it
   * @param {{reason?: string, gifs: {id: string, title: string, url: string, preview: string}[]}} suggestion
   * @param {{onPick: (gif) => void, onDismiss: () => void, onSnooze: () => void}} handlers
   */
  function show(anchor, suggestion, handlers) {
    hide();
    host = document.createElement("div");
    host.id = "gif-suggester-root";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "GIF suggestion");

    const head = document.createElement("div");
    head.className = "head";
    const reason = document.createElement("span");
    reason.className = "reason";
    reason.textContent = suggestion.reason ? `✨ ${suggestion.reason}` : "✨ GIF moment?";
    reason.title = reason.textContent;
    const snooze = document.createElement("button");
    snooze.className = "icon";
    snooze.textContent = "😴";
    snooze.title = "Pause suggestions for 15 minutes";
    snooze.onclick = () => {
      hide();
      handlers.onSnooze();
    };
    const close = document.createElement("button");
    close.className = "icon";
    close.textContent = "✕";
    close.title = "Dismiss (Esc)";
    close.onclick = () => {
      hide();
      handlers.onDismiss();
    };
    head.append(reason, snooze, close);

    const row = document.createElement("div");
    row.className = "row";
    suggestion.gifs.forEach((gif, i) => {
      const btn = document.createElement("button");
      btn.className = "gif";
      btn.title = `${gif.title || "GIF"} (Alt+${i + 1})`;
      const img = document.createElement("img");
      img.src = gif.preview;
      img.alt = gif.title || "GIF";
      btn.append(img);
      btn.onclick = () => {
        hide();
        handlers.onPick(gif);
      };
      row.append(btn);
    });

    const foot = document.createElement("div");
    foot.className = "foot";
    foot.textContent = "Powered by GIPHY";

    panel.append(head, row, foot);
    shadow.append(style, panel);
    document.body.append(host);

    const rect = anchor.getBoundingClientRect();
    panel.style.left = `${Math.max(8, rect.left)}px`;
    panel.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 8)}px`;
  }

  function isOpen() {
    return host !== null;
  }

  /** Click the nth GIF (0-based). Returns true if one was picked. */
  function pick(index) {
    const btn = host && host.shadowRoot.querySelectorAll("button.gif")[index];
    if (!btn) return false;
    btn.click();
    return true;
  }

  root.GifUi = { show, hide, isOpen, pick };
})(self);
