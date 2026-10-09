const DEFAULTS = {
  enabled: true,
  serverUrl: "http://localhost:8787",
  token: "",
  threshold: 0.35,
  cooldownSec: 90,
  sendDraft: true,
};

const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(DEFAULTS, (s) => {
  for (const [k, v] of Object.entries(s)) {
    const el = $(k);
    if (!el) continue;
    if (el.type === "checkbox") el.checked = v;
    else el.value = v;
  }
});

$("save").addEventListener("click", async () => {
  const serverUrl = $("serverUrl").value.trim().replace(/\/$/, "") || DEFAULTS.serverUrl;
  const status = $("status");

  // Non-default backends need a host permission so the service worker can reach them.
  const origin = new URL(serverUrl).origin + "/*";
  const granted = await chrome.permissions.request({ origins: [origin] }).catch(() => false);
  if (!granted && !serverUrl.startsWith(DEFAULTS.serverUrl)) {
    status.textContent = "Permission to reach the backend was denied.";
    return;
  }

  await chrome.storage.sync.set({
    enabled: $("enabled").checked,
    serverUrl,
    token: $("token").value,
    threshold: Number($("threshold").value) || DEFAULTS.threshold,
    cooldownSec: Number($("cooldownSec").value) || 0,
    sendDraft: $("sendDraft").checked,
  });
  status.textContent = "Saved.";
  setTimeout(() => (status.textContent = ""), 1500);
});
