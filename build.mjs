import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const output = new URL("./dist/server/", import.meta.url);

await rm(new URL("./dist/", import.meta.url), { recursive: true, force: true });
await mkdir(output, { recursive: true });

const worker = `const HTML = ${JSON.stringify(html)};

const securityHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "public, max-age=60",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN"
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    if (url.pathname !== "/" && url.pathname !== "/index.html") {
      return new Response("Not Found", { status: 404 });
    }
    return new Response(request.method === "HEAD" ? null : HTML, { status: 200, headers: securityHeaders });
  }
};
`;

await writeFile(new URL("./index.js", output), worker, "utf8");
console.log(`Built dist/server/index.js (${Buffer.byteLength(worker)} bytes)`);
