import { createHash } from "node:crypto";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const client = resolve(root, "dist", "client");

await rm(client, { recursive: true, force: true });
execFileSync(process.execPath, [resolve(root, "node_modules", "vite", "bin", "vite.js"), "build"], {
  cwd: root,
  stdio: "inherit",
});

const assets = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(absolute);
    else assets.push({ relative: relative(client, absolute).split(sep).join("/"), absolute });
  }
}
await collect(client);
assets.sort((a, b) => a.relative.localeCompare(b.relative));

const template = await readFile(resolve(client, "sw.js"), "utf8");
const digest = createHash("sha256").update(template);
for (const asset of assets.filter((asset) => asset.relative !== "sw.js")) {
  digest.update(asset.relative);
  digest.update(await readFile(asset.absolute));
}
const cacheName = `steadycut-v2-${digest.digest("hex").slice(0, 12)}`;
const core = [...new Set(["./", "./index.html", ...assets.filter((asset) => asset.relative !== "sw.js").map((asset) => `./${asset.relative}`)])];
const serviceWorker = template
  .replace("__STEADYCUT_CACHE_VERSION__", cacheName)
  .replace("__STEADYCUT_CORE_ASSETS__", JSON.stringify(core));
await writeFile(resolve(client, "sw.js"), serviceWorker, "utf8");

console.log(`Built web client (${assets.length} assets, cache ${cacheName})`);
