#!/usr/bin/env node
// Playwright test for promweek web UI.
// Serves the repo over HTTP, opens the demo in headless Chromium,
// clicks a target then the top-volition action each turn, and asserts
// each turn produces a log entry.
//
// Usage:
//   node scripts/test-web.mjs                          # 6 turns picking top action toward jordan
//   node scripts/test-web.mjs jordan riley sam casey   # cycle targets, top action each turn

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
    exchange: await last.locator(".log-exchange").textContent().catch(() => null),
    response: await last.locator(".log-response").textContent().catch(() => null),
    triggers,
  };
}

const TARGETS = ["jordan", "riley", "sam", "casey"];
const requestedTargets = process.argv.slice(2);

const server = await serve();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage();

page.on("console", msg => {
  if (msg.type() === "error" || msg.type() === "warn") {
    console.error(`  [browser ${msg.type()}] ${msg.text()}`);
  }
});
page.on("pageerror", err => console.error(`  [page error] ${err.message}`));

console.log(`Serving ${ROOT} on http://127.0.0.1:${PORT}`);
console.log("Opening http://127.0.0.1:7432/demos/promweek/index.html\n");

await page.goto(`http://127.0.0.1:${PORT}/demos/promweek/index.html`);

try {
  await page.waitForSelector(".cast-card", { timeout: 10000 });
} catch {
  console.error("FAIL: cast cards never appeared — game did not load");
  await browser.close();
  server.close();
  process.exit(1);
}
console.log("Game loaded.\n");

const targets = requestedTargets.length
  ? requestedTargets
  : Array(10).fill("jordan");

for (let i = 0; i < targets.length; i++) {
  const target = targets[i];

  const targetCard = page.locator(".cast-card", { hasText: new RegExp(target, "i") }).first();
  if (!(await targetCard.isVisible().catch(() => false))) {
    console.error(`  ✗ Target "${target}" not visible`);
    break;
  }
  await targetCard.click();

  // Wait for the action list to populate.
  await page.waitForTimeout(50);
  const actions = await page.locator(".action-btn").all();
  if (actions.length === 0) {
    console.log(`Turn ${i + 1}: (no available actions toward ${target})\n`);
    continue;
  }
  // Top-volition action is the first one in the first non-empty group.
  const topAction = actions[0];
  const topLabel = (await topAction.locator(".action-label").textContent()).trim();
  const topScore = (await topAction.locator(".action-score").textContent()).trim();

  const prevCount = await page.locator(".log-entry").count();
  console.log(`Turn ${i + 1}: → ${target} · "${topLabel}" (volition ${topScore})`);
  await topAction.click();

  const result = await waitForTurnComplete(page, prevCount);
  if (!result) {
    console.error(`  ✗ TIMEOUT — no log entry after ${TURN_TIMEOUT_MS}ms`);
    break;
  }
  if (result.error) {
    const statusText = await page.locator("#status").textContent().catch(() => "");
    console.error(`  ✗ ERROR — status: "${statusText}"`);
    break;
  }
  const entry = await getLastLogEntry(page);
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
