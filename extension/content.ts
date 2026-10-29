// Runs in the isolated world. Observes ARIA live regions, receives ariaNotify
// calls from content-main.ts, and forwards everything to the background worker.
(() => {
  const ARIA_NOTIFY_EVENT = "announcements-devtools:ariaNotify";

  // Roles with an implicit live region politeness.
  const LIVE_ROLES: Readonly<Record<string, Politeness | undefined>> = {
    alert: "assertive",
    status: "polite",
    log: "polite",
    marquee: "off",
    timer: "off",
  };

  const send = (message: ExtensionMessage) => {
    try {
      chrome.runtime.sendMessage(message).catch(() => {});
    } catch {
      // Extension context invalidated (eg, extension reloaded); ignore.
    }
  };

  const report = (announcement: Omit<Announcement, "timestamp">) =>
    send({
      type: "announcement",
      announcement: { ...announcement, timestamp: Date.now() },
    });

  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

  const describe = (element: Element) => {
    let description = element.localName;
    if (element.id) description += `#${element.id}`;
    for (const className of Array.from(element.classList).slice(0, 3)) {
      description += `.${className}`;
    }
    const role = element.getAttribute("role");
    if (role) description += `[role="${role}"]`;
    return description;
  };

  const getRole = (element: Element) =>
    element.getAttribute("role")?.trim().split(/\s+/)[0].toLowerCase() ||
    (element.localName === "output" ? "status" : null);

  /** Returns the politeness of `element` if it defines a live region (including `"off"`). */
  const getPoliteness = (element: Element): Politeness | null => {
    const live = element.getAttribute("aria-live")?.trim().toLowerCase();
    if (live === "polite" || live === "assertive" || live === "off") return live;
    const role = getRole(element);
    return role ? LIVE_ROLES[role] ?? null : null;
  };

  /** Finds the nearest live region containing `node`. */
  const getLiveRegion = (node: Node) => {
    for (
      let element = node instanceof Element ? node : node.parentElement;
      element;
      element = element.parentElement
    ) {
      const politeness = getPoliteness(element);
      if (politeness === "off") return null;
      if (politeness) return { region: element, politeness };
    }
    return null;
  };

  const isHidden = (element: Element) =>
    element.closest("[aria-hidden='true'], [hidden]") !== null;

  const getText = (node: Node): string => {
    if (node instanceof Text) {
      return node.parentElement && isHidden(node.parentElement) ? "" : normalize(node.data);
    }
    if (!(node instanceof Element) || isHidden(node)) return "";
    if (node.localName === "script" || node.localName === "style") return "";
    // innerText excludes CSS-hidden content, but only for rendered elements.
    return normalize((node instanceof HTMLElement ? node.innerText : null) ?? node.textContent ?? "");
  };

  const getRelevant = (region: Element) => {
    const value = region.closest("[aria-relevant]")?.getAttribute("aria-relevant");
    const tokens = new Set((value || "additions text").trim().toLowerCase().split(/\s+/));
    const all = tokens.has("all");
    return {
      additions: all || tokens.has("additions"),
      removals: all || tokens.has("removals"),
      text: all || tokens.has("text"),
    };
  };

  type LiveRegion = NonNullable<ReturnType<typeof getLiveRegion>>;

  const handleMutations = (mutations: MutationRecord[]) => {
    const changes = new Map<Element, { politeness: Politeness; parts: string[] }>();

    const markChanged = (live: LiveRegion) => {
      let change = changes.get(live.region);
      if (!change) {
        change = { politeness: live.politeness, parts: [] };
        changes.set(live.region, change);
      }
      return change;
    };

    const addPart = (live: LiveRegion, text: string) => {
      if (text) markChanged(live).parts.push(text);
    };

    for (const mutation of mutations) {
      const live = getLiveRegion(mutation.target);

      if (!live) {
        // Alerts are announced when inserted, even outside an existing live region.
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          for (const element of [node, ...node.querySelectorAll("[role]")]) {
            const elementLive = getLiveRegion(element);
            if (getRole(element) === "alert" && elementLive?.region === element) {
              addPart(elementLive, getText(element));
            }
          }
        }
        continue;
      }

      const relevant = getRelevant(live.region);
      const atomic = live.region.getAttribute("aria-atomic") === "true";

      // Atomic regions are announced in full, so only record that they changed.
      const record = (text: string) => (atomic ? markChanged(live) : addPart(live, text));

      if (mutation.type === "characterData") {
        if (relevant.text) record(getText(mutation.target));
      } else if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          const isText = node instanceof Text;
          if ((isText && relevant.text) || (!isText && relevant.additions)) {
            record(getText(node));
          }
        }
        if (relevant.removals) {
          for (const node of mutation.removedNodes) {
            const text = getText(node);
            if (text) record(`(removed) ${text}`);
          }
        }
      }
    }

    for (const [region, { politeness, parts }] of changes) {
      const atomic = region.getAttribute("aria-atomic") === "true";
      const text = atomic ? getText(region) : normalize(parts.join(" "));
      if (!text) continue;
      report({
        kind: "live-region",
        text,
        politeness,
        source: describe(region),
      });
    }
  };

  document.addEventListener(ARIA_NOTIFY_EVENT, (event) => {
    if (!(event instanceof CustomEvent) || typeof event.detail !== "string") return;
    try {
      report({ kind: "ariaNotify", ...JSON.parse(event.detail) });
    } catch {
      // Malformed event; ignore.
    }
  });

  if (window === window.top) send({ type: "navigated", url: location.href });

  // Content inserted while the page is still parsing is not announced, so only
  // start observing once the initial document has loaded.
  const startObserving = () =>
    new MutationObserver(handleMutations).observe(document, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserving, { once: true });
  } else {
    startObserving();
  }
})();
