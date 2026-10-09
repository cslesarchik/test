// Cheap, local "is this a GIF moment?" pre-filter. Runs on every change in the
// chat so the backend (and Claude) only sees conversations that look promising.
// Loaded as a classic content script (global GifHeuristics) and by Node tests.
(function (root) {
  const SIGNALS = [
    { name: "laughter", weight: 0.35, re: /\b(lol+|lmf?ao+|rofl|haha+|hehe+|i'?m dead|dying|i can'?t even)\b|😂|🤣|💀/i },
    { name: "celebration", weight: 0.35, re: /\b(shipped|launched|we did it|nailed it|congrats|congratulations|woo+h?o+|let'?s go+|finally|crushed it|promoted|milestone)\b|🎉|🥳|🚀|🍾/i },
    { name: "frustration", weight: 0.25, re: /\b(ugh+|facepalm|why (is|does|won'?t)|of course it|broke again|not again|kill me|send help|this is fine)\b|🤦|😩|🙃/i },
    { name: "surprise", weight: 0.25, re: /\b(wait what|no way|omg|wtf|whoa+|wow+|plot twist|mind ?blown)\b|🤯|😱|😮/i },
    { name: "agreement", weight: 0.2, re: /^(this|same|exactly|100%|mood|big mood|so true|facts|yes+|preach)[.!]*$/i },
    { name: "banter", weight: 0.2, re: /\b(happy friday|tgif|monday|weekend|coffee|good morning|gm|lunch|pizza|bye all|signing off)\b/i },
    { name: "gratitude", weight: 0.15, re: /\b(thanks|thank you|thx|ty|you rock|lifesaver|legend|hero)\b|🙏/i },
  ];

  // Topics where a GIF is never appropriate. Any hit vetoes the moment.
  const BLOCKERS = /\b(passed away|condolences|funeral|sorry for your loss|hospital|diagnos\w*|layoffs?|laid off|fired|termination|resign\w*|harass\w*|lawsuit|legal|confidential|incident|outage|sev ?[0-2]|p[0-1]\b|security breach|escalation|performance review|pip\b)/i;

  const GIF_URL = /\.(gif)(\?|$)|giphy\.com|tenor\.com/i;
  const CODE = /```|\bfunction\b|=>|\{\s*\}|;\s*$/m;

  function emojiCount(text) {
    const m = text.match(/\p{Extended_Pictographic}/gu);
    return m ? m.length : 0;
  }

  function capsRatio(text) {
    const letters = text.replace(/[^A-Za-z]/g, "");
    if (letters.length < 4) return 0;
    return letters.replace(/[^A-Z]/g, "").length / letters.length;
  }

  /**
   * @param {{author?: string, text: string, self?: boolean}[]} messages oldest first
   * @param {string} [draft] the user's unsent text
   * @returns {{score: number, signals: string[], blocked: boolean}}
   */
  function scoreMoment(messages, draft) {
    const recent = messages.slice(-4);
    const texts = recent.map((m) => m.text || "");
    if (draft && draft.trim()) texts.push(draft);
    if (!texts.length) return { score: 0, signals: [], blocked: false };

    const all = messages.slice(-8).map((m) => m.text || "").concat(draft || "").join("\n");
    if (BLOCKERS.test(all)) return { score: 0, signals: ["blocked"], blocked: true };
    // Someone just posted a GIF: let it breathe.
    if (texts.slice(-2).some((t) => GIF_URL.test(t))) return { score: 0, signals: ["recent-gif"], blocked: false };

    const signals = new Set();
    let score = 0;
    // The latest text counts the most; older messages add context.
    texts.forEach((text, i) => {
      const recency = (i + 1) / texts.length;
      for (const s of SIGNALS) {
        if (s.re.test(text)) {
          signals.add(s.name);
          score += s.weight * recency;
        }
      }
      if (/!{2,}/.test(text)) score += 0.1 * recency;
      if (capsRatio(text) > 0.7) {
        signals.add("caps");
        score += 0.15 * recency;
      }
      score += Math.min(emojiCount(text), 3) * 0.05 * recency;
    });

    const last = texts[texts.length - 1];
    // Long or technical messages read as work, not banter.
    if (last.length > 280) score -= 0.25;
    if (CODE.test(last)) score -= 0.3;
    if (/\?\s*$/.test(last) && signals.size === 0) score -= 0.15;
    // Rapid short back-and-forth is where reactions live.
    if (texts.length >= 3 && texts.every((t) => t.length < 80)) {
      signals.add("rapid-banter");
      score += 0.1;
    }

    return { score: Math.max(0, Math.min(1, score)), signals: [...signals], blocked: false };
  }

  const api = { scoreMoment };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GifHeuristics = api;
})(typeof self !== "undefined" ? self : this);
