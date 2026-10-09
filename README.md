# Chat GIF Suggester

A Chrome extension for Google Chat that notices when a reaction GIF would fit the conversation, picks one, and suggests it above the message box as you chat.

```
 Google Chat tab                         Backend (Node)                  APIs
┌───────────────────────────┐   only   ┌──────────────────────────┐
│ content script            │ promising│ POST /suggest            │
│  • reads recent messages  │ moments  │  1. Claude: is this a    │──► Claude API
│    + your draft           │ ───────► │     GIF moment? queries  │
│  • local heuristic score  │          │  2. GIPHY search (×1-3)  │──► GIPHY API
│  • sensitive-topic veto   │ ◄─────── │  3. Claude: rank results │──► Claude API
│  • suggestion panel       │  top 3   │  cache, auth, validation │
└───────────────────────────┘   GIFs   └──────────────────────────┘
```

## Why a browser extension and not a Google Chat app

Google Chat apps (the official bot platform) only receive a message when they are @mentioned or in a DM, and they cannot see or change what you are typing. Watching the whole conversation and suggesting something next to the message box needs to run in the page, so this is a Chrome extension for `chat.google.com` and Chat inside Gmail.

## How it decides

There are two stages, so the cost stays low and suggestions stay tasteful:

1. **Local pre-filter** (`extension/src/heuristics.js`, free, runs on every change). It scores laughter, celebration, light frustration, surprise, agreement, banter, gratitude, ALL CAPS, `!!!` and emoji. Recent text counts more. Code, long messages and plain questions lower the score. Sensitive topics (grief, layoffs, HR, legal, outages and incidents, escalations) **veto** the moment outright, and so does a GIF posted in the last two messages. Only when the score passes the sensitivity threshold is anything sent to the backend.
2. **Claude** (`server/src/claude.ts`) reads the last few messages and your draft. It decides whether a GIF would actually land, gives a confidence and writes 1 to 3 GIPHY search queries. It is told to skip when unsure. The server searches GIPHY for each query, then a second Claude pass ranks the candidates and drops anything off-tone. The top 3 come back to the panel.

Picking a GIF (click, or **Alt+1/2/3**) inserts its URL into your draft. Chat previews it inline. **Esc** dismisses the panel, 😴 pauses suggestions for 15 minutes, and a cooldown (90 s by default) stops it from nagging.

## Setup

### 1. Backend

Requires Node 22.9 or newer.

```bash
cd server
cp .env.example .env     # fill in ANTHROPIC_API_KEY, GIPHY_API_KEY, SUGGESTER_TOKEN
npm install
npm start                # http://localhost:8787
```

- Get a GIPHY key at https://developers.giphy.com/dashboard/ (an "API" app).
- `SUGGESTER_TOKEN` is any long random string, e.g. `openssl rand -hex 24`. The extension sends it in a header.
- The model defaults to `claude-haiku-5-5` at `low` effort: fast and very cheap (well under a tenth of a cent per suggestion). `CLAUDE_MODEL`, `CLAUDE_EFFORT`, `MIN_CONFIDENCE` and `RERANK` are all in `.env`. For sharper judgment at higher cost, try `CLAUDE_MODEL=claude-sonnet-5-5` or `claude-opus-5-5`. On those models, requests also opt into server-side refusal fallbacks (`fallbacks: "default"`). Haiku has no fallback, so a declined request simply means no suggestion.

### 2. Extension

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the `extension/` folder.
2. The options page opens. Enter the backend URL and the token, then click **Save**.
3. Open Google Chat and chat. Suggestions appear above the message box when a moment fits.

To roll it out to a team, publish it as a private Chrome Web Store item, or force-install it from the Google Admin console (Devices → Chrome → Apps & extensions). Deploy the backend anywhere that serves HTTPS, and set that URL in the options.

## Development

```bash
cd server && npm test && npm run typecheck   # pipeline, GIPHY mapping, caching
cd extension && npm test                     # heuristic scoring and vetoes
node dev/harness.mjs                         # end-to-end in Chromium against dev/fake-chat.html (mocked backend)
node dev/harness.mjs --live                  # same page, real backend on :8787, in a visible window
```

The harness needs Playwright installed (`npm i -g playwright`).

## Good to know

- **Chat's markup changes.** Google Chat uses obfuscated, frequently changing markup. Every selector lives in `extension/src/chat-dom.js`, with fallbacks. If suggestions stop appearing, inspect the message list in DevTools and update `MESSAGE_SELECTORS` first. The selectors were exercised against `dev/fake-chat.html`, **not yet against live Google Chat**, so expect to tune them on first run.
- **Privacy.** Recent messages and your draft (unless you turn that off in the options) go to your backend and from there to the Claude API, but only for moments that pass the local filter and the veto list. Get your Workspace admin's approval before rolling this out, and keep the backend under your organization's control.
- **Cost.** Every backend call is one or two Claude requests. The local filter, the cooldown and the server's response cache keep that to a small fraction of messages. Tune it with the **Sensitivity** option.
