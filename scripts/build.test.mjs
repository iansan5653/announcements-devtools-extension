import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import vm from "node:vm";
import { strFromU8, unzipSync } from "fflate";

const root = fileURLToPath(new URL("../", import.meta.url));
const build = (...args) => spawnSync(process.execPath, ["scripts/build.mjs", ...args], {
  cwd: root,
  encoding: "utf8",
});

test("build packages runnable scripts and static assets at the ZIP root", async () => {
  const sourceManifest = await readFile(new URL("../extension/manifest.json", import.meta.url), "utf8");
  for (const version of [JSON.parse(sourceManifest).version, "1.2.3", "65535.0.1.0"]) {
    const result = build("--version", version);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const files = unzipSync(await readFile(new URL("../dist/announcements-devtools-extension.zip", import.meta.url)));
    assert.deepEqual(Object.keys(files).sort(), [
      "background.js", "content-main.js", "content.js", "devtools.html",
      "devtools.js", "manifest.json", "panel.css", "panel.html", "panel.js",
    ]);
    const manifest = JSON.parse(strFromU8(files["manifest.json"]));
    assert.equal(manifest.version, version);
    for (const [name, content] of Object.entries(files)) {
      assert.deepEqual(content, new Uint8Array(await readFile(new URL(`../dist/extension/${name}`, import.meta.url))));
      if (name.endsWith(".js")) new vm.Script(strFromU8(content), { filename: name });
    }
    const scripts = [
      manifest.background.service_worker,
      ...manifest.content_scripts.flatMap((entry) => entry.js),
    ];
    for (const page of [manifest.devtools_page, "panel.html"]) {
      const html = strFromU8(files[page]);
      for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
        assert.ok(files[match[1]], `Missing asset ${match[1]} referenced by ${page}`);
      }
    }
    for (const script of scripts) assert.ok(files[script], `Missing manifest script ${script}`);
  }
  assert.equal(await readFile(new URL("../extension/manifest.json", import.meta.url), "utf8"), sourceManifest);
});

test("build rejects invalid versions and arguments", () => {
  for (const version of ["", "v1.2.3", "1.2.3-beta", "01.2", "65536", "0.0.0", "1.2.3.4.5", "-1"]) {
    const result = build("--version", version);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid Chrome extension version/);
  }
  assert.match(build("--unknown").stderr, /Usage:/);
});

test("compiled ariaNotify interception preserves calls and forwards JSON events", async () => {
  const calls = [];
  const events = [];
  class Element {
    localName = "div";
    id = "target";
    classList = ["example"];
    getAttribute() { return null; }
    ariaNotify(...args) {
      calls.push({ target: this, args });
      return "original result";
    }
  }
  class Document extends Element {
    dispatchEvent(event) { events.push(event); }
  }
  class CustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options.detail;
    }
  }
  const document = new Document();
  const context = vm.createContext({ Element, Document, CustomEvent, document });
  vm.runInContext(
    await readFile(new URL("../dist/extension/content-main.js", import.meta.url), "utf8"),
    context,
  );
  const target = new Element();
  assert.equal(target.ariaNotify("Saved", { priority: "high" }), "original result");
  assert.equal(document.ariaNotify("Ready"), "original result");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].target, target);
  assert.deepEqual(calls[0].args, ["Saved", { priority: "high" }]);
  assert.equal(events[0].type, "announcements-devtools:ariaNotify");
  assert.equal(typeof events[0].detail, "string");
  assert.deepEqual(JSON.parse(events[0].detail), {
    text: "Saved", priority: "high", politeness: "assertive", source: "div#target.example",
  });
  assert.deepEqual(JSON.parse(events[1].detail), {
    text: "Ready", priority: "normal", politeness: "polite", source: "document",
  });
});
