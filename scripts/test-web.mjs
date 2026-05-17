#!/usr/bin/env node
// Playwright test for promweek web UI.
// Serves the repo over HTTP, opens the demo in headless Chromium,
// drives the new target+intent+commit flow, and asserts each turn
// produces a log entry.
//
// Usage:
//   node scripts/test-web.mjs                              # 6 random turns
//   node scripts/test-web.mjs jordan:SPICY sam:WARM ...    # specific sequence

import { chromium } from "playwright";
import { createServer } from "http";
import { readFile } from "fs/promises";
import { extname, resolve, join } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const PORT = 7432;
const TURN_TIMEOUT_MS = 8000;

const MIME = {
  ".html": "text/html",
  ".js":   "application/javascript",
  ".mjs":  "application/javascript",
  ".json": "application/json",
  ".css":  "text/css",
  ".map":  "application/json",
};

function serve() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      let path = req.url.split("?")[0];
      if (path === "/" || path === "") path = "/index.html";
      const abs = join(ROOT, path);
      try {
        const data = await readFile(abs);
        res.writeHead(200, { "Content-Type": MIME[extname(abs)] ?? "text/plain" });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end("not found");
      }
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

async function waitForTurnComplete(page, prevTurnCount, timeout = TURN_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const entries = await page.locator(".log-entry").count();
    const error   = await page.locator(".status.error").isVisible().catch(() => false);
    if (entries > prevTurnCount || error) return { entries, error };
    await page.waitForTimeout(100);
  }
  return null;
}

async function getLastLogEntry(page) {
  const entries = await page.locator(".log-entry").all();
  if (!entries.length) return null;
  const last = entries[entries.length - 1];
  const triggerEls = await last.locator(".log-trigger").all();
  const triggers = [];
  for (const t of triggerEls) triggers.push((await t.textContent()).trim());
  return {
    turn:     await last.locator(".log-turn").textContent().catch(() => ""),
    player:   await last.locator(".log-player").textContent().catch(() => ""),
    exchange: await last.locator(".log-exchange").textContent().catch(() => null),
    response: await last.locator(".log-response").textContent().catch(() => null),
    triggers,
  };
}

const TARGETS = ["jordan", "riley", "sam", "casey"];
const INTENTS = ["WARM", "SPICY", "BOLD", "MEND"];

function parseTurn(arg) {
  const [target, intent] = arg.split(":");
  return { target, intent };
}

const requestedActions = process.argv.slice(2);

const server = await serve();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage();

const consoleLogs = [];
page.on("console", msg => {
  const type = msg.type();
  const text = msg.text();
  consoleLogs.push({ type, text });
  if (type === "error" || type === "warn") {
    console.error(`  [browser ${type}] ${text}`);
  }
});
page.on("pageerror", err => {
  console.error(`  [page error] ${err.message}`);
});

console.log(`Serving ${ROOT} on http://127.0.0.1:${PORT}`);
console.log("Opening http://127.0.0.1:7432/demos/promweek/index.html\n");

await page.goto(`http://127.0.0.1:${PORT}/demos/promweek/index.html`);

try {
  await page.waitForSelector(".target-btn", { timeout: 10000 });
  await page.waitForSelector(".intent-btn", { timeout: 5000 });
} catch {
  console.error("FAIL: target/intent buttons never appeared — game did not load");
  const status = await page.locator("#status").textContent().catch(() => "");
  if (status) console.error("  status:", status);
  await browser.close();
  server.close();
  process.exit(1);
}
console.log("Game loaded.\n");

const turns = requestedActions.length
  ? requestedActions.map(parseTurn)
  : Array.from({ length: 6 }, (_, i) => ({
      target: TARGETS[i % TARGETS.length],
      intent: INTENTS[i % INTENTS.length],
    }));

for (let i = 0; i < turns.length; i++) {
  const { target, intent } = turns[i];

  const targetBtn = page.locator(".target-btn", { hasText: new RegExp(target, "i") }).first();
  const intentBtn = page.locator(`.intent-btn.intent-${intent}`).first();

  if (!(await targetBtn.isVisible().catch(() => false))) {
    console.error(`  ✗ Target "${target}" not found`);
    break;
  }
  if (!(await intentBtn.isVisible().catch(() => false))) {
    console.error(`  ✗ Intent "${intent}" not found`);
    break;
  }

  await targetBtn.click();
  await intentBtn.click();

  const prevCount = await page.locator(".log-entry").count();

  console.log(`Turn ${i + 1}: ${target} / ${intent}`);
  await page.locator("#commit-btn").click();

  const result = await waitForTurnComplete(page, prevCount);

  if (!result) {
    console.error(`  ✗ TIMEOUT — no log entry after ${TURN_TIMEOUT_MS}ms`);
    const statusText = await page.locator("#status").textContent().catch(() => "");
    if (statusText) console.error(`  status: "${statusText}"`);
    break;
  }
  if (result.error) {
    const statusText = await page.locator("#status").textContent().catch(() => "");
    console.error(`  ✗ ERROR — status: "${statusText}"`);
    break;
  }

  const entry = await getLastLogEntry(page);
  console.log(`  player:   ${entry.player?.trim()}`);
  if (entry.exchange) console.log(`  exchange: ${entry.exchange.trim()}`);
  if (entry.response) console.log(`  response: ${entry.response.trim()}`);
  for (const t of entry.triggers ?? []) console.log(`  trigger:  ${t}`);

  const outcomeVisible = await page.locator("#outcome").isVisible().catch(() => false);
  if (outcomeVisible) {
    const outcomeText = await page.locator(".outcome-title").textContent().catch(() => "");
    console.log(`\nGame over: ${outcomeText}`);
    break;
  }
  console.log();
}

await browser.close();
server.close();
