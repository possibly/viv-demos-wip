import {
  initializeVivRuntime, selectAction, tickPlanner,
  runSiftingPattern, constructSiftingMatchDiagram, EntityType,
} from "../../shared/viv-runtime.js";
import { runSim } from "./sim.mjs";
import { highlightViv } from "./highlight-viv.js";

const runtime = {
  initializeVivRuntime, selectAction, tickPlanner,
  runSiftingPattern, constructSiftingMatchDiagram, EntityType,
};

const TICK_COUNT = 200;
const DEFAULT_SEED_FALLBACK = "alpha";

const PATTERN_META = {
  trystero: {
    title: "the-trystero-arc",
    subtitle: "A sign-reading lineage and a mail-conspiracy lineage converge on the same paranoid climax.",
  },
  flight: {
    title: "mistaken-flight",
    subtitle: "A tight three-action chain via the triggered operator.",
  },
  cascade: {
    title: "gossip-cascade",
    subtitle: "A swarm of mutter/overhear actions feeding into a single climax.",
  },
};

let cachedBundle = null;
let cachedSource = null;
let cachedBestSeed = null;
let HISTORY = [];
let DIAGRAMS = {};   // { trystero, flight, cascade } → { match, raw, rendered, legend }
let currentTick = 0;
let seedInUse = null;

// ── DOM ────────────────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function setStatus(msg, isError = false) {
  const el = $("#status");
  el.textContent = msg;
  el.dataset.kind = isError ? "error" : "info";
  el.hidden = !msg;
}

// ── Source view ────────────────────────────────────────────────────────────

async function renderSource() {
  if (!cachedSource) cachedSource = await fetch("./sim.viv").then(r => r.text());
  $("#source-pane").innerHTML = highlightViv(cachedSource);
}

// ── Chronicle / scrubber ───────────────────────────────────────────────────

function actionTagSpans(tags) {
  return (tags ?? []).map(t => `<span class="tag tag-${t}">${t}</span>`).join("");
}

function renderTick(t) {
  currentTick = Math.max(0, Math.min(HISTORY.length - 1, t));
  const tick = HISTORY[currentTick];
  if (!tick) return;

  $("#scrubber").value = String(currentTick);
  $("#tick-label").textContent = `tick ${String(currentTick + 1).padStart(3, "0")} / ${HISTORY.length}`;
  $("#tick-time").textContent = `T=${tick.timestamp}`;
  $("#total-actions").textContent = `events accumulated: ${tick.totalActions}`;

  const eventsEl = $("#events");
  if (tick.events.length === 0) {
    eventsEl.innerHTML = `<div class="event empty">— no actions this tick —</div>`;
  } else {
    eventsEl.innerHTML = tick.events.map(e => `
      <div class="event" data-action-id="${e.id}">
        <span class="event-time">T=${String(e.timestamp ?? tick.timestamp).padStart(3, "0")}</span>
        <span class="event-text">${escapeHtml(e.text)}</span>
        <span class="event-tags">${actionTagSpans(e.tags)}</span>
      </div>`).join("");
  }

  const charsEl = $("#chars");
  charsEl.innerHTML = tick.characters.map(c => `
    <div class="char-card ${c.paranoia >= 60 ? "paranoid" : ""}">
      <div class="char-name">${escapeHtml(c.name)}</div>
      <div class="char-loc">${escapeHtml(c.locationName)}</div>
      <div class="char-para">
        <span class="char-para-label">paranoia</span>
        <span class="char-para-bar"><span class="char-para-fill" style="width:${Math.min(100, c.paranoia)}%"></span></span>
        <span class="char-para-val">${c.paranoia}</span>
      </div>
      <div class="char-mem">${c.memoryCount} memorie${c.memoryCount === 1 ? "" : "s"}</div>
    </div>`).join("");
}

// ── Diagrams ───────────────────────────────────────────────────────────────

function postProcessDiagram(raw) {
  // Wrap role-tagged lines and short IDs for styling.
  const safe = escapeHtml(raw);
  // Color matched short IDs in stamp-red: `[a1]`, `[b3]`, etc., when next to a role suffix.
  return safe.replace(/\(([a-z\-]+)\)\s*\[([a-z]\d+)\]/g, (m, role, id) =>
    `<span class="mr role-${role}">(${role})</span> <a class="short-id" data-action-tick="${id}">[${id}]</a>`
  );
}

function splitDiagramAndLegend(rendered) {
  // The legend appears as a box drawn at the bottom of the diagram. Detect it
  // and pull it off so we can style it separately.
  const lines = rendered.split("\n");
  let legendStart = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().startsWith("┌")) { legendStart = i; break; }
  }
  if (legendStart < 0) return { tree: rendered, legend: "" };
  return {
    tree: lines.slice(0, legendStart).join("\n"),
    legend: lines.slice(legendStart).join("\n"),
  };
}

function buildLegendTable(legendRaw, actionById) {
  // Parse `│ a1 : aid-…  │` lines into a small id→description table.
  const rows = [];
  legendRaw.split("\n").forEach(line => {
    const m = line.match(/\b([a-z]\d+)\s*:\s*([a-zA-Z0-9-]+)/);
    if (m) {
      const id = m[1], uid = m[2];
      const action = actionById[uid];
      rows.push({ id, uid, summary: action?.text ?? "(unknown)" });
    }
  });
  if (!rows.length) return "";
  return `
    <table class="legend-table">
      <tbody>
        ${rows.map(r => `
          <tr>
            <td class="legend-id"><a class="short-id" data-action-tick="${r.id}">[${r.id}]</a></td>
            <td class="legend-text">${escapeHtml(r.summary)}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

function renderDiagrams(state) {
  // Build a lookup from action UID to recorded event (for legend tick-jump).
  const actionByUid = {};
  HISTORY.forEach((tick, tIdx) => {
    tick.events.forEach(e => { actionByUid[e.id] = { ...e, tickIndex: tIdx }; });
  });
  // Build short-id → action tick lookup once we know diagram → legend mapping.
  for (const key of Object.keys(DIAGRAMS)) {
    const meta = PATTERN_META[key];
    const slot = $(`#diagram-${key}`);
    const d = DIAGRAMS[key];
    if (!d.match) {
      slot.innerHTML = `
        <h3>${meta.title}</h3>
        <p class="diagram-sub">${meta.subtitle}</p>
        <div class="diagram-card empty">no arc found this run — try reseeding</div>`;
      continue;
    }
    const { tree, legend } = splitDiagramAndLegend(d.raw);
    // Pull short-id → UID mapping from the legend.
    const shortIdToUid = {};
    legend.split("\n").forEach(line => {
      const m = line.match(/\b([a-z]\d+)\s*:\s*([a-zA-Z0-9-]+)/);
      if (m) shortIdToUid[m[1]] = m[2];
    });
    // Save back so click handler can use it.
    DIAGRAMS[key].shortIdToUid = shortIdToUid;
    DIAGRAMS[key].actionByUid = actionByUid;

    const renderedTree = postProcessDiagram(tree);
    const renderedLegend = buildLegendTable(legend, actionByUid);
    slot.innerHTML = `
      <h3>${meta.title}</h3>
      <p class="diagram-sub">${meta.subtitle}</p>
      <div class="diagram-card">
        <pre class="diagram-pre">${renderedTree}</pre>
      </div>
      <div class="diagram-legend">${renderedLegend}</div>`;
  }
}

// ── Run ────────────────────────────────────────────────────────────────────

async function loadBundleAndSource() {
  if (!cachedBundle) cachedBundle = await fetch("./bundle.json").then(r => r.json());
  if (!cachedBestSeed) {
    try {
      const txt = await fetch("./best-seed.txt").then(r => r.ok ? r.text() : null);
      cachedBestSeed = txt?.trim() || DEFAULT_SEED_FALLBACK;
    } catch { cachedBestSeed = DEFAULT_SEED_FALLBACK; }
  }
}

async function runSimulation(seedOverride) {
  await loadBundleAndSource();
  seedInUse = seedOverride ?? cachedBestSeed;
  setStatus(`running ${TICK_COUNT} ticks with seed "${seedInUse}"…`);
  $("#seed-label").textContent = `seed: ${seedInUse}`;

  const { ticks } = await runSim(runtime, cachedBundle, seedInUse, TICK_COUNT);
  HISTORY = ticks;

  const trystero = await runSiftingPattern({ patternName: "the-trystero-arc" });
  const flight = await runSiftingPattern({ patternName: "mistaken-flight" });
  const cascade = await runSiftingPattern({ patternName: "gossip-cascade" });

  DIAGRAMS = {};
  for (const [key, match] of [["trystero", trystero], ["flight", flight], ["cascade", cascade]]) {
    if (match) {
      const raw = await constructSiftingMatchDiagram({ siftingMatch: match, ansi: false, elide: true });
      DIAGRAMS[key] = { match, raw };
    } else {
      DIAGRAMS[key] = { match: null };
    }
  }

  // Wire up scrubber bounds, render UI.
  $("#scrubber").max = String(HISTORY.length - 1);
  currentTick = 0;
  renderTick(0);
  renderDiagrams();

  const matched = Object.values(DIAGRAMS).filter(d => d.match).length;
  setStatus(`${matched}/3 patterns matched.`);
}

// ── Wiring ─────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function jumpToTick(idx) {
  renderTick(idx);
  $("#chronicle-region").scrollIntoView({ behavior: "smooth", block: "start" });
}

function handleDiagramClick(ev) {
  const a = ev.target.closest(".short-id");
  if (!a) return;
  ev.preventDefault();
  const shortId = a.dataset.actionTick;
  // Find which diagram this belongs to and look up the UID.
  const card = a.closest("[id^='diagram-']");
  if (!card) return;
  const key = card.id.replace("diagram-", "");
  const uid = DIAGRAMS[key]?.shortIdToUid?.[shortId];
  if (!uid) return;
  const meta = DIAGRAMS[key].actionByUid[uid];
  if (meta != null && typeof meta.tickIndex === "number") jumpToTick(meta.tickIndex);
}

window.addEventListener("DOMContentLoaded", async () => {
  await renderSource();
  await runSimulation();

  $("#scrubber").addEventListener("input", e => renderTick(parseInt(e.target.value, 10)));
  $("#btn-end").addEventListener("click", () => renderTick(HISTORY.length - 1));
  $("#btn-start").addEventListener("click", () => renderTick(0));
  $("#btn-reseed").addEventListener("click", async () => {
    const newSeed = `r${Math.floor(Math.random() * 9999)}`;
    await runSimulation(newSeed);
  });
  $("#btn-replay").addEventListener("click", () => runSimulation(seedInUse));

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "ArrowRight") { e.preventDefault(); renderTick(currentTick + 1); }
    if (e.key === "ArrowLeft")  { e.preventDefault(); renderTick(currentTick - 1); }
    if (e.key === "Home") { e.preventDefault(); renderTick(0); }
    if (e.key === "End")  { e.preventDefault(); renderTick(HISTORY.length - 1); }
  });

  $("#diagrams-region").addEventListener("click", handleDiagramClick);
});
