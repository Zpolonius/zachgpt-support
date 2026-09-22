/* Lille server uden afhængigheder: serverer siden og et JSON-API.
 *
 *   node server/server.mjs            # http://localhost:8787
 *   PORT=3000 node server/server.mjs
 *
 * Data gemmes i server/data.json. Det er ikke en rigtig database — det er en fil.
 * Til en joke-side med tyve kolleger er det rigeligt.
 *
 * Husk at sætte backend: "rest" i js/config.js, ellers bruger siden localStorage.
 */
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA = join(ROOT, "data.json");
const PORT = Number(process.env.PORT) || 8787;
const COLLECTIONS = new Set(["invoices", "tickets", "tips", "settings"]);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

async function load() {
  if (!existsSync(DATA)) return { invoices: {}, tickets: {}, tips: {}, settings: {} };
  try {
    return JSON.parse(await readFile(DATA, "utf8"));
  } catch {
    return { invoices: {}, tickets: {}, tips: {}, settings: {} };
  }
}

// Skrivninger serialiseres, så to samtidige kald ikke overskriver hinanden.
let queue = Promise.resolve();
function change(fn) {
  queue = queue.then(async () => {
    const all = await load();
    const result = fn(all);
    await writeFile(DATA, JSON.stringify(all, null, 2));
    return result;
  });
  return queue;
}

function send(res, code, body) {
  const payload = body === null ? "" : JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1e6) reject(new Error("for stor"));
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

async function api(req, res, parts) {
  const [collection, id] = parts;
  if (!COLLECTIONS.has(collection)) return send(res, 404, { error: "ukendt samling" });

  if (req.method === "GET" && !id) {
    const all = await load();
    const bucket = all[collection] || {};
    return send(res, 200, Object.entries(bucket).map(([key, v]) => ({ ...v, id: key })));
  }

  if (req.method === "POST" && !id) {
    const body = await readBody(req);
    const newId = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await change((all) => { (all[collection] ??= {})[newId] = body; });
    return send(res, 201, { id: newId });
  }

  if (req.method === "PUT" && id) {
    const body = await readBody(req);
    await change((all) => { (all[collection] ??= {})[id] = body; });
    return send(res, 200, { ok: true });
  }

  if (req.method === "PATCH" && id) {
    const body = await readBody(req);
    let found = true;
    await change((all) => {
      const bucket = (all[collection] ??= {});
      if (!bucket[id]) { found = false; return; }
      bucket[id] = { ...bucket[id], ...body };
    });
    return found ? send(res, 200, { ok: true }) : send(res, 404, { error: "findes ikke" });
  }

  if (req.method === "DELETE" && id) {
    await change((all) => { if (all[collection]) delete all[collection][id]; });
    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: "metode ikke tilladt" });
}

async function statics(req, res, pathname) {
  const rel = normalize(pathname === "/" ? "/index.html" : pathname).replace(/^(\.\.[/\\])+/, "");
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT) || !existsSync(file)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Ikke fundet");
  }
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
  res.end(await readFile(file));
}

createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, "http://localhost");
    if (pathname.startsWith("/api/")) {
      const parts = pathname.slice(5).split("/").filter(Boolean).map(decodeURIComponent);
      return await api(req, res, parts);
    }
    await statics(req, res, pathname);
  } catch (err) {
    send(res, 500, { error: String(err && err.message || err) });
  }
}).listen(PORT, () => {
  console.log(`ZachGPT Support kører på http://localhost:${PORT}`);
  console.log(`Data: ${DATA}`);
  console.log('Husk backend: "rest" i js/config.js');
});
