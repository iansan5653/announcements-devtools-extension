const tabId = chrome.devtools.inspectedWindow.tabId;

const scroller = document.getElementById("scroller");
const log = document.getElementById("log");
const clearButton = document.getElementById("clear");
const preserveLog = document.getElementById("preserve-log");

if (chrome.devtools.panels.themeName === "dark") {
  document.documentElement.classList.add("dark");
}

const isScrolledToBottom = () =>
  scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 2;

/** Appends `item` to the log, keeping the view pinned to the bottom if it already was. */
const append = (item) => {
  const shouldScroll = isScrolledToBottom();
  log.append(item);
  if (shouldScroll) scroller.scrollTop = scroller.scrollHeight;
};

const createElement = (tagName, className, text) => {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  const pad = (value, length = 2) => String(value).padStart(length, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};

const addAnnouncement = ({ kind, text, politeness, priority, source, timestamp }, frameUrl) => {
  const entry = createElement("li", `entry ${politeness}`);

  const time = createElement("time", "", formatTime(timestamp));
  time.dateTime = new Date(timestamp).toISOString();

  const meta =
    kind === "ariaNotify"
      ? `ariaNotify (${priority})`
      : `live region (${politeness})`;

  const sourceText = frameUrl ? `${source} in ${frameUrl}` : source;
  const sourceElement = createElement("span", "source", sourceText);
  sourceElement.title = sourceText;

  entry.append(
    time,
    createElement("span", "meta", meta),
    createElement("span", "text", text),
    sourceElement,
  );
  append(entry);
};

const addNavigation = (url) => {
  if (!preserveLog.checked) {
    log.replaceChildren();
    return;
  }
  append(createElement("li", "divider", `Navigated to ${url}`));
};

clearButton.addEventListener("click", () => log.replaceChildren());

const connect = () => {
  const port = chrome.runtime.connect({ name: `announcements-panel:${tabId}` });
  port.onMessage.addListener((message) => {
    if (message.type === "announcement") addAnnouncement(message.announcement, message.frameUrl);
    else if (message.type === "navigated") addNavigation(message.url);
  });
  // The background service worker may be restarted; reconnect when that happens.
  port.onDisconnect.addListener(() => setTimeout(connect, 100));
};

connect();
