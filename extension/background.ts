// Relays messages from content scripts to the Announcements panel(s) open for
// the tab that sent them.

const PORT_PREFIX = "announcements-panel:";

const panelsByTab = new Map<number, Set<chrome.runtime.Port>>();

chrome.runtime.onConnect.addListener((port) => {
  if (!port.name.startsWith(PORT_PREFIX)) return;
  const tabId = Number(port.name.slice(PORT_PREFIX.length));

  let ports = panelsByTab.get(tabId);
  if (!ports) {
    ports = new Set();
    panelsByTab.set(tabId, ports);
  }
  ports.add(port);

  port.onDisconnect.addListener(() => {
    ports.delete(port);
    if (ports.size === 0) panelsByTab.delete(tabId);
  });
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender) => {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return;
  const ports = panelsByTab.get(tabId);
  if (!ports) return;

  const isTopFrame = sender.frameId === 0;
  // Navigation only matters for the top-level frame.
  if (message.type === "navigated" && !isTopFrame) return;

  for (const port of ports) {
    port.postMessage({ ...message, frameUrl: isTopFrame ? null : sender.url });
  }
});
