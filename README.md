# announcements-devtools-extension

Devtools extension for observing ARIA announcements.

![screenshot of announcements devtools panel](./screenshot.png)

Adds an **Announcements** tab to browser DevTools that logs, as they happen:

- Calls to [`ariaNotify`](https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/Accessibility/AriaNotify/explainer.md) on elements and the document (when supported by the browser).
- Changes to ARIA live regions: elements with `aria-live="polite"` / `aria-live="assertive"`, live roles (`alert`, `status`, `log`), and `<output>` elements. `aria-atomic` and `aria-relevant` are respected, and inserted `role="alert"` elements are logged too.

Assertive announcements (`aria-live="assertive"`, `role="alert"`, and `ariaNotify` with `priority: "high"`) are shown in **bold**. Use **Clear** to empty the log, and **Preserve log** to keep entries across page navigations.

## Installing (unpacked)

The extension targets Chromium-based browsers (Chrome, Edge) version 111 or newer.

1. Open the [latest release](https://github.com/iansan5653/announcements-devtools-extension/releases/latest) and download `announcements-devtools-extension.zip` from **Assets**.
2. Extract the ZIP to a directory you will keep on your computer.
3. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
4. Click **Load unpacked** and select the extracted directory containing `manifest.json`.
5. Open DevTools on any page and select the **Announcements** tab. Pages that were already open before you installed the extension need to be reloaded.

After changing the extension's TypeScript or static files, run `npm run build`,
click the reload button on the extension's card in `chrome://extensions`, then
reload the inspected page and reopen DevTools.

## Building and releasing

To build from source instead, clone this repository and, with Node.js 22 or newer,
run `npm ci` and `npm run build`. Load the generated `dist/extension` directory
as an unpacked extension.

- `npm run typecheck` checks the extension's TypeScript without emitting files.
- `npm test` checks the build and ZIP contents.
- `npm run build` transpiles the scripts and copies static files to `dist/extension`,
  then packages its contents as `dist/announcements-devtools-extension.zip`.
- `npm run build -- --version 1.2.3` overrides the packaged manifest version without
  changing the source manifest. Versions must follow Chrome's numeric version format
  (one to four components, each 0–65535, no leading zeros, not all zero).

Publish a GitHub release with a tag such as `v1.2.3` or `1.2.3`.
The [release workflow](./.github/workflows/release.yml) builds from that tag,
sets the packaged manifest version from the tag (removing an optional `v`),
and uploads the ZIP as a downloadable release asset. Prerelease suffixes such as
`-beta` are not valid Chrome extension versions and will fail the build.
To install a release, download and extract its ZIP, then load the extracted
directory as an unpacked extension.

## Demo

Open [demo/index.html](./demo/index.html) in a browser to try all three `aria-live` values,
the live roles (`alert`, `status`, `log`, `marquee`, and `timer`), native `<output>`,
and document/element `ariaNotify` calls (when supported).
Each bordered region has add, update, remove, and clear controls, plus `aria-atomic`,
`aria-relevant`, and `aria-busy` settings. Use a screen reader or the Announcements tab
to observe the results; `off`, `marquee`, and `timer` are intentionally not live by default.
When using a local file, enable **Allow access to file URLs** in the extension's details
to let the Announcements tab observe it.

## Limitations

- This logs what the page _asks_ to be announced. It doesn't use a screen reader, so actual speech output may differ depending on the assistive technology.
- Live regions inside shadow roots aren't observed.
- Content added while the page is still loading isn't logged, because screen readers don't announce it either.
