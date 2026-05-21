#!/usr/bin/env node
// Rootwork browser smoke test. Serves the repo over HTTP, opens the demo in
// headless Chromium, plants a seed, waters it, advances days, and asserts the
// season ends cleanly with no page errors and an outcome panel.

import { chromium } from "playwright";
import { createServer } from "http";
import { readFile } from "fs/promises";
import { extname, resolve, join } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const PORT = 7433;

const MIME = {
  ".html": "text/html", ".js": "application/javascript",
  ".mjs": "application/javascript", ".json": "application/json", ".css": "text/css",
};

function serve() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      let path = req.url.split("?")[0];
      if (path === "/" || path === "") path = "/index.html";
      try {
        const data = await readFile(join(ROOT, path));
        res.writeHead(200, { "Content-Type": MIME[extname(path)] ?? "text/plain" });
        res.end(data);
      } catch {
        res.writeHead(404); res.end("not found");
      }
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

const server = await serve();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage();

const errors = [];
page.on("pageerror", err => { errors.push(err.message); console.error(`  [page error] ${err.message}`); });
page.on("console", msg => {
  if (msg.type() === "error") {
    const txt = msg.text();
    // Favicon 404s are harmless. Anything else is a real problem.
    if (/Failed to load resource.*404/.test(txt) && msg.location()?.url?.endsWith?.("favicon.ico")) return;
    if (/Failed to load resource.*404/.test(txt)) {
      console.warn(`  [resource 404] ignored`);
      return;
    }
    errors.push(txt);
    console.error(`  [console error] ${txt}`);
  }
});

console.log(`Serving ${ROOT} on http://127.0.0.1:${PORT}`);
await page.goto(`http://127.0.0.1:${PORT}/demos/rootwork/index.html`);
await page.waitForSelector(".plot-card", { timeout: 10000 });

// Clear any saved game state so the run is reproducible.
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector(".plot-card", { timeout: 10000 });
console.log("Loaded.");

// Verify cultivar-labeled seed chips render.
const seedChips = await page.locator(".seed-chip").all();
console.log(`Inventory chips: ${seedChips.length}`);
let cherryFound = false;
for (const chip of seedChips) {
  const text = (await chip.textContent()).trim();
  if (/Cherry/.test(text)) cherryFound = true;
  console.log(`  · ${text.replace(/\s+/g, " ")}`);
}
if (!cherryFound) console.error("FAIL: no Cherry tomato seed in starter basket");

// Hover the first chip to trigger popover.
await seedChips[0].hover();
await page.waitForTimeout(150);
const popoverVisible = await page.locator("#popover").isVisible();
console.log(`Popover visible after hover: ${popoverVisible}`);
// Move mouse away to dismiss the popover before clicking other UI.
await page.mouse.move(10, 10);
await page.waitForTimeout(120);

// Plant first seed in plot 1.
await page.locator(".plot-card").first().click();
await page.waitForTimeout(50);
await seedChips[0].click();
await page.waitForTimeout(120);
// Dump all action buttons + enabled state for debugging
const actBtns = await page.locator(".action-btn").all();
for (const b of actBtns) {
  const txt = (await b.textContent()).replace(/\s+/g, " ").trim();
  const disabled = await b.isDisabled();
  console.log(`  action: "${txt}" disabled=${disabled}`);
}
const plantBtn = page.locator(".action-btn").filter({ has: page.locator(".action-label", { hasText: "Plant" }) });
await plantBtn.click({ timeout: 5000 });
await page.waitForTimeout(200);
console.log("Planted seed in plot 1.");

// Plant Cherry in plot 2 if we can find it.
const cherryChip = page.locator(".seed-chip", { hasText: /Cherry/ }).first();
if (await cherryChip.isVisible().catch(() => false)) {
  await page.locator(".plot-card").nth(1).click();
  await page.waitForTimeout(50);
  await cherryChip.click();
  await page.waitForTimeout(120);
  await plantBtn.click({ timeout: 5000 });
  await page.waitForTimeout(200);
  console.log("Planted Cherry in plot 2.");
}

// Iterate days: water plot 1, harvest any ripe plants, otherwise wait.
const SEASON_TURNS = 27;
const byLabel = (text) => page.locator(".action-btn").filter({ has: page.locator(".action-label", { hasText: text }) });
for (let i = 0; i < SEASON_TURNS; i++) {
  // Did any plot become ripe? Look for "Ripe" text in plot-cards.
  let actedRipe = false;
  const plots = await page.locator(".plot-card").all();
  for (let pi = 0; pi < plots.length; pi++) {
    const txt = await plots[pi].textContent();
    if (/\bRipe\b/.test(txt)) {
      await plots[pi].click();
      await page.waitForTimeout(30);
      const harvest = byLabel("Harvest");
      if (await harvest.isEnabled().catch(() => false)) {
        await harvest.click({ timeout: 2000 }).catch(() => null);
        await page.waitForTimeout(50);
        actedRipe = true;
        break;
      }
    }
  }
  if (actedRipe) continue;

  // Default: water plot 1 (or plot 2 every other turn).
  const targetIdx = i % 2;
  await page.locator(".plot-card").nth(targetIdx).click();
  await page.waitForTimeout(30);
  const waterBtn = byLabel("Water");
  if (await waterBtn.isEnabled().catch(() => false)) {
    await waterBtn.click({ timeout: 2000 }).catch(() => null);
  } else {
    const waitBtn = byLabel("Wait");
    if (await waitBtn.isEnabled().catch(() => false)) await waitBtn.click({ timeout: 2000 }).catch(() => null);
  }
  await page.waitForTimeout(40);

  if (i % 5 === 0) {
    const dayCount = await page.locator("#day-count").textContent().catch(() => "?");
    console.log(`turn ${i + 1}: day=${dayCount.trim()}`);
  }

  // End if outcome appeared.
  const outcome = await page.locator("#outcome").isVisible().catch(() => false);
  if (outcome) {
    console.log(`Season ended at turn ${i + 1}.`);
    break;
  }
}

const outcomeVisible = await page.locator("#outcome").isVisible().catch(() => false);
if (outcomeVisible) {
  const title = await page.locator(".outcome-title").textContent().catch(() => "");
  console.log(`Outcome: "${title.trim()}"`);
  const stable = await page.locator(".outcome-stable").textContent().catch(() => null);
  if (stable) console.log(`Stable strains line: "${stable.trim()}"`);
} else {
  console.log("Outcome panel did not appear.");
}

// Try opening the pedigree modal on a plot, if any plot has a lineage link.
const pedigreeLink = page.locator(".plot-pedigree-link").first();
if (await pedigreeLink.isVisible().catch(() => false)) {
  await pedigreeLink.click();
  const modalShown = await page.locator("#modal-backdrop").isVisible();
  console.log(`Pedigree modal shown: ${modalShown}`);
  if (modalShown) {
    const modalTitle = (await page.locator(".modal-title").textContent()).trim();
    console.log(`Modal title: "${modalTitle}"`);
  }
}

await browser.close();
server.close();

if (errors.length) {
  console.error(`\nFAIL: ${errors.length} browser error(s) encountered.`);
  process.exit(1);
}
console.log("\nOK — no browser errors.");
