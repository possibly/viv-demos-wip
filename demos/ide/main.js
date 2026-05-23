// Viv IDE — browser entry point.
//
// Wires a Viv source editor to the compile server (POST /compile → vivc), runs
// the compiled bundle through the shared sim (sim.mjs), and renders snapshots,
// causal trees, and sifting-match diagrams against the live runtime.
//
// All simulation logic lives in sim.mjs; this file is host/UI glue plus the
// IDE-specific calls into the runtime's analysis APIs.

import {
  initializeVivRuntime, selectAction, tickPlanner,
  runSiftingPattern, constructSiftingMatchDiagram, constructTreeDiagram,
  EntityType,
} from "../../shared/viv-runtime.js";
import { runSim } from "./sim.mjs";
import { highlightVivInline } from "./highlight-viv.js";

const runtime = {
  initializeVivRuntime, selectAction, tickPlanner, EntityType,
};

const $ = (sel) => document.querySelector(sel);

// ── State ────────────────────────────────────────────────────────────────────

let bundle = null;            // last successfully compiled content bundle
let HISTORY = [];             // per-tick snapshots from the most recent run
let actionIndex = new Map();  // action UID → { tickIndex, text, actionName, tags }
let currentTick = 0;
let serverOnline = false;
let defaultSource = "";       // checked-in sim.viv, for the reset button

// ── Utilities ──────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function setDiagnostics(msg, kind = "info") {
  const el = $("#diagnostics");
  el.textContent = msg;
  el.dataset.kind = kind;
}

// ── Editor (textarea + highlight overlay) ────────────────────────────────────

const input = $("#editor-input");
const highlightCode = $("#editor-highlight > code");

function syncHighlight() {
  // Trailing newline guard so the final line renders in the overlay.
  highlightCode.innerHTML = highlightVivInline(input.value + "\n");
}

function syncScroll() {
  const pre = $("#editor-highlight");
  pre.scrollTop = input.scrollTop;
  pre.scrollLeft = input.scrollLeft;
}

function setupEditor() {
  input.addEventListener("input", syncHighlight);
  input.addEventListener("scroll", syncScroll);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const s = input.selectionStart, end = input.selectionEnd;
      input.value = input.value.slice(0, s) + "    " + input.value.slice(end);
      input.selectionStart = input.selectionEnd = s + 4;
      syncHighlight();
    }
  });
}

function setSource(text) {
  input.value = text;
  syncHighlight();
  syncScroll();
}

// ── Compilation ──────────────────────────────────────────────────────────────

async function probeServer() {
  try {
    const r = await fetch("/health", { method: "GET" });
    const data = await r.json().catch(() => ({}));
    serverOnline = r.ok && data.service === "viv-ide-compile";
  } catch { serverOnline = false; }
  const el = $("#server-status");
  if (serverOnline) {
    el.textContent = "● compile server online";
    el.dataset.kind = "online";
  } else {
    el.textContent = "○ compile server offline";
    el.dataset.kind = "offline";
    el.title = "Start it: node scripts/ide-server.mjs";
  }
}

// Compile the editor source via the server. Returns the bundle, or null on
// failure (with diagnostics already shown).
async function compileSource() {
  if (!serverOnline) {
    // One more probe in case the server came up after page load.
    await probeServer();
  }
  if (!serverOnline) {
    setDiagnostics(
      "Compile server offline — run `node scripts/ide-server.mjs` and reload. " +
      "Using the last compiled bundle for now.",
      "warn"
    );
    return null;
  }
  setDiagnostics("compiling…", "info");
  try {
    const r = await fetch("/compile", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: input.value,
    });
    const data = await r.json();
    if (!data.ok) {
      setDiagnostics(data.error || "compilation failed", "error");
      return null;
    }
    setDiagnostics("compiled ✓", "ok");
    return data.bundle;
  } catch (e) {
    serverOnline = false;
    await probeServer();
    setDiagnostics(`compile request failed: ${e?.message ?? e}`, "error");
    return null;
  }
}

// ── Running ──────────────────────────────────────────────────────────────────

function buildActionIndex() {
  actionIndex = new Map();
  HISTORY.forEach((tick, tIdx) => {
    for (const e of tick.events) {
      actionIndex.set(e.id, { tickIndex: tIdx, text: e.text, actionName: e.actionName, tags: e.tags });
    }
  });
}

async function runSimulation() {
  if (!bundle) { setDiagnostics("nothing compiled yet", "warn"); return; }
  const seed = $("#seed").value.trim() || "alpha";
  let ticks = parseInt($("#ticks").value, 10);
  if (!Number.isFinite(ticks) || ticks < 1) ticks = 60;
  ticks = Math.min(ticks, 300);
  $("#ticks").value = String(ticks);

  setDiagnostics(`running ${ticks} ticks (seed "${seed}")…`, "info");
  // Yield so the diagnostics paint before the (synchronous-ish) run.
  await new Promise((r) => setTimeout(r, 0));

  const t0 = performance.now();
  const { ticks: hist, state } = await runSim(runtime, bundle, seed, ticks);
  const ms = Math.round(performance.now() - t0);

  HISTORY = hist;
  buildActionIndex();
  currentTick = 0;

  $("#scrubber").max = String(Math.max(0, HISTORY.length - 1));
  $("#scrubber").value = "0";
  $("#run-meta").textContent = `${state.actions.length} actions · ${ticks} ticks · ${ms}ms`;

  renderTick(0);
  renderPatternList();
  clearCausal();

  const patternCount = Object.keys(bundle.siftingPatterns ?? {}).length;
  setDiagnostics(
    `ran ${ticks} ticks → ${state.actions.length} actions. ${patternCount} sifting pattern(s) available.`,
    "ok"
  );
}

async function compileAndRun() {
  const compiled = await compileSource();
  if (compiled) bundle = compiled;
  // If compile failed but we have a previous bundle, still run that so the IDE
  // stays usable; runSimulation no-ops if there's no bundle at all.
  await runSimulation();
}

// ── Snapshots / chronicle ────────────────────────────────────────────────────

function tagSpans(tags) {
  return (tags ?? []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");
}

function renderTick(t) {
  if (HISTORY.length === 0) return;
  currentTick = Math.max(0, Math.min(HISTORY.length - 1, t));
  const tick = HISTORY[currentTick];

  $("#scrubber").value = String(currentTick);
  $("#tick-label").textContent = `tick ${String(currentTick + 1).padStart(3, "0")} / ${HISTORY.length}`;
  $("#tick-time").textContent = `T=${tick.timestamp}`;
  $("#total-actions").textContent = `events so far: ${tick.totalActions}`;

  const eventsEl = $("#events");
  if (tick.events.length === 0) {
    eventsEl.innerHTML = `<div class="event empty">— no actions this tick —</div>`;
  } else {
    eventsEl.innerHTML = tick.events.map((e) => {
      const links = [];
      if (e.causes.length) links.push(`↑${e.causes.length}`);
      if (e.caused.length) links.push(`↓${e.caused.length}`);
      const causal = links.length ? `<span class="event-causal" title="↑ causes / ↓ caused">${links.join(" ")}</span>` : "";
      return `
        <div class="event" data-uid="${escapeHtml(e.id)}" title="click to trace causal lineage">
          <span class="event-name">${escapeHtml(e.actionName)}</span>
          <span class="event-text">${escapeHtml(e.text)}</span>
          <span class="event-tail">${causal}${tagSpans(e.tags)}</span>
        </div>`;
    }).join("");
  }

  renderState(tick);
}

function statBar(label, val) {
  const pct = Math.max(0, Math.min(100, val));
  const hot = label === "paranoia" && val >= 60 ? " hot" : "";
  return `
    <div class="stat${hot}">
      <span class="stat-k">${label}</span>
      <span class="stat-bar"><span class="stat-fill" style="width:${pct}%"></span></span>
      <span class="stat-v">${val}</span>
    </div>`;
}

function renderState(tick) {
  const stateEl = $("#state");
  const chars = tick.characters.map((c) => {
    const primary = ["paranoia", "mood"].map((k) => statBar(k, c.stats[k] ?? 0)).join("");
    const others = Object.entries(c.stats)
      .filter(([k]) => k !== "paranoia" && k !== "mood")
      .map(([k, v]) => `<span class="chip">${k} ${v}</span>`).join("");
    return `
      <div class="char-card${(c.stats.paranoia ?? 0) >= 60 ? " paranoid" : ""}">
        <div class="char-top">
          <span class="char-name">${escapeHtml(c.name)}</span>
          <span class="char-loc">${escapeHtml(c.locationName)}</span>
        </div>
        ${primary}
        <div class="chips">${others}</div>
        ${c.target ? `<div class="char-target">fixated on ${escapeHtml(c.target)}</div>` : ""}
        ${c.memoryCount ? `<div class="char-mem">${c.memoryCount} memorie${c.memoryCount === 1 ? "" : "s"}</div>` : ""}
      </div>`;
  }).join("");

  const items = tick.items.map((it) => `
    <div class="item-row">
      <span class="item-name">${escapeHtml(it.name)}</span>
      <span class="item-loc">${escapeHtml(it.locationName)}</span>
      <span class="item-meta">${it.inscriptionCount} inscr.${it.mentions ? ` · mentions ${escapeHtml(it.mentions)}` : ""}</span>
    </div>`).join("");

  stateEl.innerHTML = `
    <div class="state-group">${chars}</div>
    <div class="col-h sub">Items</div>
    <div class="state-group items">${items}</div>`;
}

// ── Diagram rendering (causal trees + sifting matches) ───────────────────────

function parseLegend(raw) {
  // Returns { shortIdToUid, treeText, legendRows }.
  const lines = raw.split("\n");
  let legendStart = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trimStart().startsWith("┌")) { legendStart = i; break; }
  }
  const treeText = legendStart < 0 ? raw : lines.slice(0, legendStart).join("\n");
  const legendLines = legendStart < 0 ? [] : lines.slice(legendStart);

  const shortIdToUid = {};
  const legendRows = [];
  for (const line of legendLines) {
    const m = line.match(/\*?\s*([a-z]\d+)\s*:\s*([0-9a-fA-F-]{6,})/);
    if (m) {
      shortIdToUid[m[1]] = m[2];
      legendRows.push({ shortId: m[1], uid: m[2] });
    }
  }
  return { shortIdToUid, treeText, legendRows };
}

const ROLE_PALETTE = ["role-a", "role-b", "role-c", "role-d", "role-e", "role-f"];
function roleClass(role) {
  let h = 0;
  for (let i = 0; i < role.length; i++) h = (h * 31 + role.charCodeAt(i)) | 0;
  return ROLE_PALETTE[Math.abs(h) % ROLE_PALETTE.length];
}

function renderDiagramHTML(raw) {
  const { shortIdToUid, treeText, legendRows } = parseLegend(raw);

  // Escape, then linkify bracketed short IDs ([a1], [=a1], [⋯a1]) and color roles.
  let html = escapeHtml(treeText);
  html = html.replace(/\[(=|⋯)?([a-z]\d+)\]/g, (full, prefix, id) => {
    const uid = shortIdToUid[id];
    const inner = `[${prefix ?? ""}${id}]`;
    if (!uid) return `<span class="diag-id dead">${inner}</span>`;
    return `<a class="diag-id" data-uid="${escapeHtml(uid)}">${inner}</a>`;
  });
  html = html.replace(/\(([a-z][a-z0-9-]*)\)/g, (full, role) =>
    `<span class="diag-role ${roleClass(role)}">(${role})</span>`);

  const legend = legendRows.length ? `
    <table class="legend-table">
      <tbody>
        ${legendRows.map((r) => {
          const a = actionIndex.get(r.uid);
          const summary = a ? a.text : "(not in current run)";
          return `
            <tr>
              <td class="legend-id">${a ? `<a class="diag-id" data-uid="${escapeHtml(r.uid)}">[${r.shortId}]</a>` : `<span class="diag-id dead">[${r.shortId}]</span>`}</td>
              <td class="legend-text">${escapeHtml(summary)}</td>
            </tr>`;
        }).join("")}
      </tbody>
    </table>` : "";

  return `<pre class="diagram-pre">${html}</pre>${legend}`;
}

function jumpToAction(uid) {
  const a = actionIndex.get(uid);
  if (!a) return;
  renderTick(a.tickIndex);
  // Briefly flag the matching event row.
  const row = $(`#events .event[data-uid="${CSS.escape(uid)}"]`);
  if (row) {
    row.classList.add("flash");
    row.scrollIntoView({ block: "nearest" });
    setTimeout(() => row.classList.remove("flash"), 900);
  }
  $("#snapshots-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Causal tree ──────────────────────────────────────────────────────────────

function clearCausal() {
  $("#causal-diagram").className = "diagram-card empty";
  $("#causal-diagram").textContent = "— no action selected —";
  $("#causal-meta").textContent = "";
}

async function showCausalTree(uid) {
  const a = actionIndex.get(uid);
  $("#causal-meta").textContent = a ? `${a.actionName} · tick ${a.tickIndex + 1}` : "";
  const slot = $("#causal-diagram");
  slot.className = "diagram-card";
  slot.textContent = "tracing…";
  try {
    const raw = await constructTreeDiagram({ actionID: uid, ansi: false });
    slot.innerHTML = renderDiagramHTML(raw);
  } catch (e) {
    slot.className = "diagram-card empty";
    slot.textContent = `could not build tree: ${e?.message ?? e}`;
  }
}

// ── Sifting ──────────────────────────────────────────────────────────────────

function renderPatternList() {
  const names = Object.keys(bundle?.siftingPatterns ?? {});
  const listEl = $("#pattern-list");
  if (names.length === 0) {
    listEl.innerHTML = `<div class="hint empty">No <code>pattern</code> blocks in the source. Define one and Compile &amp; Run.</div>`;
    return;
  }
  listEl.innerHTML = names.map((name) => `
    <div class="pattern" data-pattern="${escapeHtml(name)}">
      <div class="pattern-h">
        <span class="pattern-name">${escapeHtml(name)}</span>
        <button class="mini btn-run-pattern" data-pattern="${escapeHtml(name)}">run</button>
      </div>
      <div class="pattern-result" id="result-${escapeHtml(name)}"></div>
    </div>`).join("");
}

async function runPattern(name) {
  const resultEl = $(`#result-${CSS.escape(name)}`);
  if (!resultEl) return;
  resultEl.innerHTML = `<div class="hint">sifting…</div>`;
  try {
    const match = await runSiftingPattern({ patternName: name });
    if (!match) {
      resultEl.innerHTML = `<div class="no-match">no match in this chronicle — try a different seed or more ticks</div>`;
      return;
    }
    const roleSummary = Object.entries(match).map(([role, ids]) => {
      const labels = ids.map((id) => {
        const a = actionIndex.get(id);
        return a ? a.actionName : id.slice(0, 8);
      });
      return `<span class="match-role"><span class="diag-role ${roleClass(role)}">${escapeHtml(role)}</span> ${escapeHtml(labels.join(", "))}</span>`;
    }).join("");
    const raw = await constructSiftingMatchDiagram({ siftingMatch: match, ansi: false, elide: true });
    resultEl.innerHTML = `
      <div class="match-roles">${roleSummary}</div>
      <div class="diagram-card">${renderDiagramHTML(raw)}</div>`;
  } catch (e) {
    resultEl.innerHTML = `<div class="no-match error">sifting failed: ${escapeHtml(String(e?.message ?? e))}</div>`;
  }
}

async function runAllPatterns() {
  const names = Object.keys(bundle?.siftingPatterns ?? {});
  for (const name of names) await runPattern(name);
}

// ── Wiring ───────────────────────────────────────────────────────────────────

window.addEventListener("DOMContentLoaded", async () => {
  setupEditor();

  // Load default source + a fallback precompiled bundle so the IDE is usable
  // immediately, even before (or without) the compile server.
  defaultSource = await fetch("./sim.viv").then((r) => r.text()).catch(() => "");
  setSource(defaultSource);
  bundle = await fetch("./bundle.json").then((r) => r.json()).catch(() => null);

  await probeServer();
  await runSimulation();

  // Toolbar
  $("#btn-run").addEventListener("click", compileAndRun);
  $("#btn-compile").addEventListener("click", async () => {
    const compiled = await compileSource();
    if (compiled) {
      bundle = compiled;
      renderPatternList();
      setDiagnostics("compiled ✓ — Compile & Run to regenerate snapshots", "ok");
    }
  });
  $("#btn-reset").addEventListener("click", () => {
    setSource(defaultSource);
    setDiagnostics("source reset to default", "info");
  });

  // Scrubber
  $("#scrubber").addEventListener("input", (e) => renderTick(parseInt(e.target.value, 10)));
  $("#btn-start").addEventListener("click", () => renderTick(0));
  $("#btn-prev").addEventListener("click", () => renderTick(currentTick - 1));
  $("#btn-next").addEventListener("click", () => renderTick(currentTick + 1));
  $("#btn-end").addEventListener("click", () => renderTick(HISTORY.length - 1));

  // Chronicle → causal tree
  $("#events").addEventListener("click", (e) => {
    const row = e.target.closest(".event[data-uid]");
    if (row) showCausalTree(row.dataset.uid);
  });

  // Diagram ID clicks (delegated across causal + sifting cards) → jump to tick
  $(".results-pane").addEventListener("click", (e) => {
    const link = e.target.closest("a.diag-id[data-uid]");
    if (link) { e.preventDefault(); jumpToAction(link.dataset.uid); }
  });

  // Sifting
  $("#pattern-list").addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-run-pattern");
    if (btn) runPattern(btn.dataset.pattern);
  });
  $("#btn-run-all").addEventListener("click", runAllPatterns);

  // Keyboard: arrows scrub, Ctrl/Cmd+Enter compiles & runs.
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); compileAndRun(); return; }
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "ArrowRight") { e.preventDefault(); renderTick(currentTick + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); renderTick(currentTick - 1); }
  });
});
