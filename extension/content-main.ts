// Runs in the page's MAIN world so it can intercept calls to `ariaNotify`.
// Calls are reported to the isolated-world content script (content.js) via a
// DOM event, since the two worlds share the DOM but not JavaScript objects.
(() => {
  const EVENT_NAME = "announcements-devtools:ariaNotify";

  const describe = (target: unknown) => {
    if (target instanceof Document) return "document";
    if (!(target instanceof Element)) return String(target);
    let description = target.localName;
    if (target.id) description += `#${target.id}`;
    for (const className of Array.from(target.classList).slice(0, 3)) {
      description += `.${className}`;
    }
    const role = target.getAttribute("role");
    if (role) description += `[role="${role}"]`;
    return description;
  };

  for (const proto of [Element.prototype, Document.prototype]) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, "ariaNotify");
    const original = descriptor?.value;
    if (typeof original !== "function") continue;

    const wrapped = {
      ariaNotify(this: Element | Document, announcement: string, options?: { priority?: string }) {
        const result = original.apply(this, arguments);
        try {
          const priority = options?.priority ?? "normal";
          document.dispatchEvent(
            new CustomEvent(EVENT_NAME, {
              // Pass a string: object `detail` values do not cross worlds.
              detail: JSON.stringify({
                text: String(announcement),
                priority: String(priority),
                politeness: priority === "high" ? "assertive" : "polite",
                source: describe(this),
              }),
            }),
          );
        } catch {
          // Never break the page because of the devtools extension.
        }
        return result;
      },
    }.ariaNotify;

    Object.defineProperty(proto, "ariaNotify", { ...descriptor, value: wrapped });
  }
})();
