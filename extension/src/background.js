// Service worker: the only part that talks to the backend, so the server URL
// and token never touch the Chat page.
const DEFAULTS = { serverUrl: "http://localhost:8787", token: "" };

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "suggest") return false;
  (async () => {
    const { serverUrl, token } = await chrome.storage.sync.get(DEFAULTS);
    try {
      const res = await fetch(`${serverUrl.replace(/\/$/, "")}/suggest`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-suggester-token": token },
        body: JSON.stringify(msg.payload),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        console.warn("GIF suggester backend returned", res.status);
        return sendResponse({ ok: false, status: res.status });
      }
      sendResponse({ ok: true, data: await res.json() });
    } catch (err) {
      console.warn("GIF suggester backend unreachable:", err);
      sendResponse({ ok: false });
    }
  })();
  return true; // keep the channel open for the async response
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") chrome.runtime.openOptionsPage();
});
