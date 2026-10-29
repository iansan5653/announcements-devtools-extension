import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "dist/extension");
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--version")) {
  throw new Error("Usage: npm run build -- [--version <Chrome extension version>]");
}

const manifest = JSON.parse(await readFile(join(root, "extension/manifest.json"), "utf8"));
const version = args[1] ?? manifest.version;
if (
  typeof version !== "string" ||
  !/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/.test(version) ||
  version.split(".").some((part) => Number(part) > 65535) ||
  version.split(".").every((part) => Number(part) === 0)
) {
  throw new Error(`Invalid Chrome extension version: ${version}`);
}

await rm(output, { recursive: true, force: true });
execFileSync(process.execPath, [
  join(root, "node_modules/typescript/bin/tsc"),
  "--project", join(root, "tsconfig.json"),
], { cwd: root, stdio: "inherit" });
await cp(join(root, "extension"), output, {
  recursive: true,
  filter: (source) => !source.endsWith(".ts"),
});
manifest.version = version;
await writeFile(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const files = {};
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else files[relative(output, path).split("\\").join("/")] = await readFile(path);
  }
}
await collect(output);
const archive = join(root, "dist/announcements-devtools-extension.zip");
await mkdir(dirname(archive), { recursive: true });
await writeFile(archive, zipSync(files));
console.log(`Built extension version ${version}: ${relative(root, archive)}`);
