// End-to-end check of the content scripts against dev/fake-chat.html.
//
//   node dev/harness.mjs            # mocked backend, headless, asserts the flow
//   node dev/harness.mjs --live     # real backend at http://localhost:8787, opens a window
//
// Requires Playwright (`npm i -g playwright` or an existing install).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const live = process.argv.includes("--live");
const serverUrl = process.env.SERVER_URL ?? "http://localhost:8787";
const token = process.env.SUGGESTER_TOKEN ?? "";

const scripts = ["heuristics.js", "chat-dom.js", "ui.js", "content.js"].map((f) =>
  readFileSync(join(here, "../extension/src", f), "utf8"),
);

const MOCK_RESPONSE = {
  suggest: true,
  confidence: 0.86,
  moment: "celebration",
  reason: "The team just confirmed the launch is live",
  gifs: ["a", "b", "c"].map((id) => ({
    id,
    title: `celebration ${id}`,
    url: `https://media.giphy.com/media/${id}/giphy.gif`,
    preview: `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="96"><rect width="120" height="96" fill="#fbbc04"/><text x="60" y="55" text-anchor="middle" font-size="28">${id}</text></svg>`,
    )}`,
    width: 120,
    height: 96,
    query: "celebration",
  })),
};

const browser = await chromium.launch({ headless: !live });
const page = await browser.newPage();
const requests = [];

// Stand-in for chrome.storage / chrome.runtime. The background worker's fetch
// goes through exposeFunction so it runs in Node, like a service worker would.
await page.exposeFunction("__suggest", async (payload) => {
  requests.push(payload);
  if (!live) return { ok: true, data: MOCK_RESPONSE };
  const res = await fetch(`${serverUrl}/suggest`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-suggester-token": token },
    body: JSON.stringify(payload),
  });
  return res.ok ? { ok: true, data: await res.json() } : { ok: false, status: res.status };
});
await page.addInitScript(() => {
  window.chrome = {
    storage: {
      sync: { get: (defaults, cb) => cb({ ...defaults, cooldownSec: 0 }) },
      onChanged: { addListener() {} },
    },
    runtime: { sendMessage: (msg) => window.__suggest(msg.payload) },
  };
});

await page.goto(`file://${join(here, "fake-chat.html")}`);
for (const s of scripts) await page.addScriptTag({ content: s });

const composer = page.locator('[role="textbox"]');
await composer.click();
await page.keyboard.type("YES it's live!!! we shipped it 🎉");

if (live) {
  console.log("Live mode: chat in the window; close it to exit.");
  await page.waitForEvent("close", { timeout: 0 });
  await browser.close();
  process.exit(0);
}

const panel = page.locator("#gif-suggester-root");
await panel.waitFor({ state: "attached", timeout: 5000 });
const payload = requests.at(-1);
console.log("backend saw:", JSON.stringify(payload));
if (payload.messages.length !== 2 || !payload.draft.includes("shipped")) throw new Error("bad payload");
await page.screenshot({ path: join(here, "harness-panel.png") });

// Alt+2 picks the second GIF and inserts its URL into the draft.
await page.keyboard.press("Alt+2");
const draft = await composer.innerText();
console.log("draft after pick:", draft);
if (!draft.includes("https://media.giphy.com/media/b/giphy.gif")) throw new Error("GIF not inserted");
if (await panel.count()) throw new Error("panel should close after picking");

// A serious message must not reach the backend.
const before = requests.length;
await page.keyboard.press("Enter");
await page.evaluate(() => window.postFromOther("Lee", "Heads up: SEV1 outage, all hands please 🚨🚨"));
await page.waitForTimeout(1800);
if (requests.length !== before) throw new Error("blocked topic was sent to the backend");

console.log("harness: all checks passed");
await browser.close();
