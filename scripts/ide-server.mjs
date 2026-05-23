#!/usr/bin/env node
// Dev server for the Viv IDE demo (demos/ide/).
//
// Serves the repo statically (like `python3 -m http.server`) AND exposes a
// POST /compile endpoint that shells out to the `vivc` compiler. The browser
// can't run the Python compiler itself, so the IDE posts its source here and
// gets back a compiled bundle (or a compile error to show inline).
//
// Usage:
//   node scripts/ide-server.mjs            # serves on http://localhost:8080
//   PORT=9000 node scripts/ide-server.mjs
//
// Then open http://localhost:8080/demos/ide/

import { createServer } from "http";
import { readFile, writeFile, mkdtemp, rm } from "fs/promises";
import { extname, resolve, join, normalize } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { execFile } from "child_process";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const PORT = parseInt(process.env.PORT ?? "8080", 10);
const MAX_SOURCE_BYTES = 1_000_000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".map": "application/json",
  ".ico": "image/x-icon",
};

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_SOURCE_BYTES) { reject(new Error("source too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// Compile a .viv source string by writing it to a temp file and invoking vivc.
// Returns { ok: true, bundle } or { ok: false, error }.
async function compile(source) {
  const dir = await mkdtemp(join(tmpdir(), "vivc-"));
  const inPath = join(dir, "sim.viv");
  const outPath = join(dir, "bundle.json");
  try {
    await writeFile(inPath, source, "utf8");
    const result = await new Promise((res) => {
      execFile("vivc", ["-i", inPath, "-o", outPath, "-q"], { timeout: 30_000 }, (err, stdout, stderr) => {
        res({ err, stdout, stderr });
      });
    });
    if (result.err) {
      // vivc writes the human-readable error to stderr; strip the temp path so
      // the message references the user's source, not /tmp/vivc-xxxx/sim.viv.
      const raw = (result.stderr || result.stdout || result.err.message || "compilation failed").trim();
      const cleaned = raw.split(inPath).join("sim.viv").split(dir).join("");
      return { ok: false, error: cleaned || "compilation failed" };
    }
    const bundle = JSON.parse(await readFile(outPath, "utf8"));
    return { ok: true, bundle };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    sendJSON(res, 200, { ok: true, service: "viv-ide-compile" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/compile") {
    try {
      const source = await readBody(req);
      const out = await compile(source);
      sendJSON(res, out.ok ? 200 : 422, out);
    } catch (e) {
      sendJSON(res, 400, { ok: false, error: String(e?.message ?? e) });
    }
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJSON(res, 405, { ok: false, error: "method not allowed" });
    return;
  }

  // Static file serving, scoped to the repo root.
  let path = decodeURIComponent(url.pathname);
  if (path === "/" || path === "") path = "/index.html";
  if (path.endsWith("/")) path += "index.html";
  const abs = normalize(join(ROOT, path));
  if (!abs.startsWith(ROOT)) { res.writeHead(403); res.end("forbidden"); return; }
  try {
    const data = await readFile(abs);
    res.writeHead(200, { "Content-Type": MIME[extname(abs)] ?? "text/plain; charset=utf-8" });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
  }
});

server.listen(PORT, () => {
  console.log(`Viv IDE server on http://localhost:${PORT}/demos/ide/`);
  console.log(`  POST /compile  → compiles .viv source with vivc`);
});
