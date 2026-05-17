#!/usr/bin/env node
// Playwright test for promweek web UI.
// Serves the repo over HTTP, opens the demo in headless Chromium,
// simulates clicking action buttons, and reports what Jordan says
// (or whether the game hangs/errors).
//
// Usage:
//   node scripts/test-web.mjs [actions...]
//
// Examples:
//   node scripts/test-web.mjs                          # 5 random turns
//   node scripts/test-web.mjs small-talk flirt confide # specific sequence

import { chromium } from "playwright";
import { createServer } from "http";
import { readFile } from "fs/promises";
import { extname, resolve, join } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const PORT = 7432;
const TURN_TIMEOUT_MS = 8000;

// ── Static file server ───────────────────────────────────────────────────────

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

// ── Playwright helpers ───────────────────────────────────────────────────────

async function waitForTurnComplete(page, prevTurnCount, timeout = TURN_TIMEOUT_MS) {
  // A turn is complete when a new log-entry appears OR an error status appears
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const entries = await page.locator(".log-entry").count();
    const error   = await page.locator(".status.error").isVisible().catch(() => false);
    if (entries > prevTurnCount || error) return { entries, error };
    await page.waitForTimeout(100);
  }
  return null; // timed out
}

async function getLastLogEntry(page) {
  const entries = await page.locator(".log-entry").all();
  if (!entries.length) return null;
  const last = entries[entries.length - 1];
  return {
    turn:     await last.locator(".log-turn").textContent().catch(() => ""),
    player:   await last.locator(".log-player").textContent().catch(() => ""),
    outcome:  await last.locator(".log-outcome").textContent().catch(() => null),
    jordan:   await last.locator(".log-jordan").textContent().catch(() => "(missing)"),
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

const requestedActions = process.argv.slice(2);

const server = await serve();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage();

// Capture all console messages and uncaught errors
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

// Wait for buttons to appear
try {
  await page.waitForSelector(".action-btn:not([disabled])", { timeout: 10000 });
} catch {
  console.error("FAIL: action buttons never appeared — game did not load");
  const status = await page.locator("#status").textContent().catch(() => "");
  if (status) console.error("  status:", status);
  await browser.close();
  server.close();
  process.exit(1);
}
console.log("Game loaded. Action buttons visible.\n");

// Play turns
const FALLBACKS = ["small-talk", "ask-opinion", "compliment", "flirt", "debate", "confide", "invite-out"];
const actions = requestedActions.length ? requestedActions : FALLBACKS.slice(0, 5);

for (let i = 0; i < actions.length; i++) {
  const actionName = actions[i];

  // Find the button
  const btn = page.locator(`.action-btn:not(.locked)`).filter({ hasText: new RegExp(actionName.replace(/-/g, "."), "i") }).first();
  const btnVisible = await btn.isVisible().catch(() => false);

  let actualAction = actionName;
  let clickTarget = btn;

  if (!btnVisible) {
    // Fallback: click first available button
    const first = page.locator(".action-btn:not(.locked):not([disabled])").first();
    const label = await first.locator(".action-label").textContent().catch(() => "?");
    actualAction = `(fallback: ${label.trim()})`;
    clickTarget = first;
  }

  const prevCount = await page.locator(".log-entry").count();

  console.log(`Turn ${i + 1}: clicking "${actualAction}"...`);
  await clickTarget.click();

  const result = await waitForTurnComplete(page, prevCount);

  if (!result) {
    console.error(`  ✗ TIMEOUT — game hung after ${TURN_TIMEOUT_MS}ms, no log entry appeared`);
    // Check if buttons are disabled (busy=true means game is stuck)
    const buttonsDisabled = await page.locator(".action-btn").first().isDisabled().catch(() => null);
    console.error(`  buttons disabled (busy=true): ${buttonsDisabled}`);
    const statusText = await page.locator("#status").textContent().catch(() => "");
    if (statusText) console.error(`  status bar: "${statusText}"`);
    break;
  }

  if (result.error) {
    const statusText = await page.locator("#status").textContent().catch(() => "");
    console.error(`  ✗ ERROR — status: "${statusText}"`);
    break;
  }

  const entry = await getLastLogEntry(page);
  console.log(`  player:  ${entry.player}`);
  if (entry.outcome) console.log(`  outcome: ${entry.outcome}`);
  if (entry.jordan && entry.jordan !== "(missing)") {
    console.log(`  jordan:  ${entry.jordan}`);
  } else {
    console.error(`  jordan:  (MISSING — no .log-jordan element)`);
  }

  // Check if game ended
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
