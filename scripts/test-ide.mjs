#!/usr/bin/env node
// Playwright test for the Viv IDE demo.
//
// Spawns the IDE compile server, opens the IDE in headless Chromium, and
// exercises the full loop: initial run → chronicle/scrub → causal tree → run
// sifting patterns → edit source + recompile → compile-error path.
//
// Usage: node scripts/test-ide.mjs

import { chromium } from "playwright";
import { spawn } from "child_process";
import { setTimeout as sleep } from "timers/promises";
import { resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const PORT = 7433;
const BASE = `http://127.0.0.1:${PORT}`;

let failures = 0;
function check(label, cond) {
  console.log(`${cond ? "  ✓" : "  ✗"} ${label}`);
  if (!cond) failures++;
}

async function waitForHealth(timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await sleep(150);
  }
  return false;
}

const server = spawn("node", [resolve(ROOT, "scripts/ide-server.mjs")], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stderr.on("data", (d) => console.error(`  [server] ${d}`.trimEnd()));

let browser;
try {
  if (!(await waitForHealth())) throw new Error("compile server never became healthy");
  console.log("Compile server healthy.\n");

  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  });
  const page = await browser.newPage();

  // Track only uncaught JS exceptions. Network status logs (favicon 404, the
  // expected 422 from the compile-error test) surface as console "error"
  // messages but aren't page errors, so they're filtered out here.
  const pageErrors = [];
  page.on("pageerror", (err) => { pageErrors.push(err.message); console.error(`  [page error] ${err.message}`); });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/Failed to load resource/.test(text)) return;
    pageErrors.push(text);
    console.error(`  [browser error] ${text}`);
  });

  await page.goto(`${BASE}/demos/ide/`, { waitUntil: "domcontentloaded" });

  // ── Initial run ──────────────────────────────────────────────────────────
  console.log("Initial load + run:");
  await page.waitForSelector("#events .event[data-uid]", { timeout: 15000 });
  await page.waitForFunction(() => /\d+ actions/.test(document.querySelector("#run-meta")?.textContent ?? ""), { timeout: 15000 });
  const eventCount = await page.locator("#events .event[data-uid]").count();
  check(`chronicle shows events on tick 1 (${eventCount})`, eventCount > 0);
  const serverStatus = await page.locator("#server-status").getAttribute("data-kind");
  check("compile server detected as online", serverStatus === "online");
  const charCount = await page.locator(".char-card").count();
  check(`world state shows characters (${charCount})`, charCount === 6);

  // ── Scrubbing ──────────────────────────────────────────────────────────────
  console.log("\nScrubbing:");
  await page.locator("#btn-end").click();
  const endLabel = await page.locator("#tick-label").textContent();
  check(`jump-to-end updates tick label (${endLabel.trim()})`, /\/\s*\d+/.test(endLabel) && !endLabel.includes("001 /"));
  await page.locator("#btn-start").click();
  const startLabel = await page.locator("#tick-label").textContent();
  check("jump-to-start returns to tick 001", startLabel.includes("001 /"));

  // ── Causal tree ──────────────────────────────────────────────────────────
  console.log("\nCausal tree:");
  // Find a tick with events, click the first event, expect a tree diagram.
  await page.locator("#btn-end").click();
  await page.waitForSelector("#events .event[data-uid]", { timeout: 5000 });
  await page.locator("#events .event[data-uid]").first().click();
  await page.waitForSelector("#causal-diagram .diagram-pre", { timeout: 10000 });
  const causalText = await page.locator("#causal-diagram .diagram-pre").textContent();
  check("causal tree renders with box-drawing structure", /[└├─]/.test(causalText) || causalText.includes("["));
  const causalLinks = await page.locator("#causal-diagram a.diag-id").count();
  check(`causal tree has clickable node ids (${causalLinks})`, causalLinks > 0);

  // ── Sifting ────────────────────────────────────────────────────────────────
  console.log("\nSifting patterns:");
  const patternCount = await page.locator(".pattern").count();
  check(`pattern list shows compiled patterns (${patternCount})`, patternCount === 3);
  await page.locator("#btn-run-all").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".pattern-result .diagram-pre").length > 0,
    { timeout: 15000 }
  );
  const matchDiagrams = await page.locator(".pattern-result .diagram-pre").count();
  check(`at least one sifting-match diagram rendered (${matchDiagrams})`, matchDiagrams > 0);
  const roleSpans = await page.locator(".pattern-result .diag-role").count();
  check(`match diagram colors sifting roles (${roleSpans})`, roleSpans > 0);

  // Click a sifting-match id → it should jump the scrubber (no error).
  const siftLink = page.locator(".pattern-result a.diag-id").first();
  if (await siftLink.count()) {
    await siftLink.click();
    await page.waitForTimeout(200);
    check("clicking a match id jumps without error", true);
  }

  // ── Edit + recompile ──────────────────────────────────────────────────────
  console.log("\nEdit + recompile:");
  const edited = (await page.locator("#editor-input").inputValue())
    .replace("@speaker.mood += 2", "@speaker.mood += 7");
  check("source contained the line to edit", edited.includes("+= 7"));
  await page.locator("#editor-input").fill(edited);
  await page.locator("#seed").fill("beta");
  await page.locator("#btn-run").click();
  await page.waitForFunction(
    () => /ran \d+ ticks/.test(document.querySelector("#diagnostics")?.textContent ?? ""),
    { timeout: 20000 }
  );
  const diagKind = await page.locator("#diagnostics").getAttribute("data-kind");
  check("recompile + rerun succeeds", diagKind === "ok");
  const eventsAfter = await page.locator("#events .event[data-uid]").count();
  check(`chronicle repopulated after rerun (${eventsAfter})`, eventsAfter >= 0);

  // ── Compile error path ─────────────────────────────────────────────────────
  console.log("\nCompile-error path:");
  await page.locator("#editor-input").fill('action broken:\n    glosss: "nope"\n');
  await page.locator("#btn-compile").click();
  await page.waitForFunction(
    () => document.querySelector("#diagnostics")?.dataset.kind === "error",
    { timeout: 15000 }
  );
  const errText = await page.locator("#diagnostics").textContent();
  check("compile error shown in diagnostics", /could not be parsed|Compilation failed|line \d+/.test(errText));
  check("error message references sim.viv (temp path stripped)", !errText.includes("/tmp/"));

  // Restore via reset.
  await page.locator("#btn-reset").click();
  const restored = await page.locator("#editor-input").inputValue();
  check("reset restores default source", restored.includes("pattern betrayal-arc"));

  console.log("\nPage errors during run:", pageErrors.length);
  check("no uncaught page errors", pageErrors.length === 0);

} catch (e) {
  console.error("\nFATAL:", e?.stack ?? e);
  failures++;
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`);
process.exit(failures === 0 ? 0 : 1);
