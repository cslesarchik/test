// Everything that depends on Google Chat's markup lives here. Google ships
// obfuscated, frequently changing class names, so we lean on stable-ish
// attributes (roles, aria labels, data attributes) and try several fallbacks.
// If suggestions stop appearing after a Chat update, start debugging here.
(function (root) {
  const COMPOSER_SELECTORS = [
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"][aria-label]',
    'div[contenteditable="true"]',
  ];

  // Candidate selectors for individual messages, most specific first.
  const MESSAGE_SELECTORS = [
    "[data-message-id]",
    '[jsname][data-id][role="row"]',
    '[role="main"] [role="listitem"]',
    '[role="main"] [role="row"]',
  ];

  const MESSAGE_TEXT_SELECTORS = ["[data-message-text]", '[jsname="bgckF"]', '[dir="auto"]'];
  const AUTHOR_SELECTORS = ["[data-name]", "[data-hovercard-id]", '[data-member-id] [aria-hidden="true"]'];

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  /** The composer the user is typing into: the focused one, else the last visible one. */
  function findComposer() {
    const active = document.activeElement;
    if (active && active.isContentEditable) return active;
    for (const sel of COMPOSER_SELECTORS) {
      const all = [...document.querySelectorAll(sel)].filter(isVisible);
      if (all.length) return all[all.length - 1];
    }
    return null;
  }

  function textOf(node) {
    for (const sel of MESSAGE_TEXT_SELECTORS) {
      const el = node.querySelector(sel);
      if (el && el.innerText.trim()) return el.innerText.trim();
    }
    return (node.innerText || "").trim();
  }

  function authorOf(node) {
    for (const sel of AUTHOR_SELECTORS) {
      const el = node.querySelector(sel);
      if (!el) continue;
      const name = el.getAttribute("data-name") || el.textContent;
      if (name && name.trim()) return name.trim().slice(0, 60);
    }
    return undefined;
  }

  /**
   * Visible messages near the composer, oldest first.
   * @param {Element|null} composer used to scope to the right conversation pane
   * @param {number} limit
   */
  function readMessages(composer, limit) {
    // Scope to the conversation containing the composer (thread panes and the
    // main stream can be open side by side).
    let scope = document;
    if (composer) {
      let el = composer.parentElement;
      while (el && el !== document.body) {
        if (MESSAGE_SELECTORS.some((sel) => el.querySelector(sel))) {
          scope = el;
          break;
        }
        el = el.parentElement;
      }
    }

    for (const sel of MESSAGE_SELECTORS) {
      const nodes = [...scope.querySelectorAll(sel)].filter(
        (n) => isVisible(n) && !(composer && n.contains(composer)),
      );
      if (!nodes.length) continue;
      // Drop wrappers that contain other matches so a message is not counted twice.
      const leaves = nodes.filter((n) => !nodes.some((o) => o !== n && n.contains(o)));
      return leaves
        .slice(-limit)
        .map((n) => ({
          author: authorOf(n),
          text: textOf(n).slice(0, 500),
          self: n.matches('[data-is-self="true"], [data-self="true"]') || undefined,
        }))
        .filter((m) => m.text);
    }
    return [];
  }

  function readDraft(composer) {
    return composer ? (composer.innerText || "").trim() : "";
  }

  /** Insert text at the caret using the editor's own input path so Chat notices it. */
  function insertIntoComposer(composer, text) {
    composer.focus();
    const sel = window.getSelection();
    if (sel && !composer.contains(sel.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(composer);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    const prefix = readDraft(composer) ? " " : "";
    if (!document.execCommand("insertText", false, prefix + text)) {
      composer.textContent += prefix + text;
      composer.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
  }

  root.ChatDom = { findComposer, readMessages, readDraft, insertIntoComposer };
})(self);
