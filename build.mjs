import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = resolve(root, "dist");
const client = resolve(dist, "client");

await rm(dist, { recursive: true, force: true });
execFileSync(process.execPath, [resolve(root, "scripts", "build-web.mjs")], {
  cwd: root,
  stdio: "inherit",
});

const files = new Map();
async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const absolute = resolve(dir, entry.name);
    if (entry.isDirectory()) await collect(absolute);
    else files.set("/" + relative(client, absolute).split(sep).join("/"), await readFile(absolute));
  }
}
await collect(client);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
const entries = [...files].map(([path, data]) => [path, data.toString("base64")]);
const worker = `const FILES = new Map(${JSON.stringify(entries)});
const MIME = ${JSON.stringify(mime)};
const SECURITY = {
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups"
};
function decode(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const url = new URL(request.url);
    let path = decodeURIComponent(url.pathname);
    if (path === "/" || !FILES.has(path)) path = "/index.html";
    const encoded = FILES.get(path);
    if (!encoded) return new Response("Not Found", { status: 404 });
    const extension = path.slice(path.lastIndexOf("."));
    const headers = new Headers(SECURITY);
    headers.set("Content-Type", MIME[extension] || "application/octet-stream");
    headers.set("Cache-Control", path === "/index.html" ? "no-cache" : "public, max-age=31536000, immutable");
    return new Response(request.method === "HEAD" ? null : decode(encoded), { status: 200, headers });
  }
};\n`;

await mkdir(resolve(dist, "server"), { recursive: true });
await mkdir(resolve(dist, ".openai"), { recursive: true });
await writeFile(resolve(dist, "server", "index.js"), worker, "utf8");
await cp(resolve(root, ".openai", "hosting.json"), resolve(dist, ".openai", "hosting.json"));
console.log(`Built SteadyCut 2.1 (${files.size} static assets, ${Buffer.byteLength(worker)} byte worker)`);
