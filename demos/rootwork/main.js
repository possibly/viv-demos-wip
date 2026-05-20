import {
  initializeVivRuntime, attemptAction, selectAction, tickPlanner,
  runSiftingPattern, EntityType,
} from "../../shared/viv-runtime.js";
import {
  initGame, PLAYER_ACTION_CATALOG, SPECIES, STAGE_LABEL, STAGE_EMOJI,
  STAGE_ORDER, SEASON_DAYS,
} from "./sim.mjs";

const runtime = { initializeVivRuntime, attemptAction, selectAction, tickPlanner, runSiftingPattern, EntityType };

let bundle = null;
let game = null;
let busy = false;
let selectedPlot = null;
let selectedSeed = null;

const statusEl       = document.getElementById("status");
const seasonLabelEl  = document.getElementById("season-label");
const dayCountEl     = document.getElementById("day-count");
const plotsGridEl    = document.getElementById("plots-grid");
const basketEl       = document.getElementById("basket");
const actionListEl   = document.getElementById("action-list");
const actionHintEl   = document.getElementById("action-hint");
const selectionBarEl = document.getElementById("selection-bar");
const logEl          = document.getElementById("log");
const outcomeEl      = document.getElementById("outcome");

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.hidden = !msg;
  statusEl.className = "status" + (isError ? " error" : "");
}

function renderHeader(state) {
  seasonLabelEl.textContent = state.season.ended ? "Season ended" : `Spring · day ${state.day}`;
  dayCountEl.textContent = `${state.day} / ${SEASON_DAYS}`;
}

function renderPlots(state) {
  plotsGridEl.innerHTML = "";
  for (const plot of state.plots) {
    const card = document.createElement("button");
    card.className = "plot-card" + (selectedPlot === plot.id ? " selected" : "");
    card.disabled = busy;
    card.innerHTML = renderPlotInner(plot);
    card.addEventListener("click", () => handlePlotClick(plot.id));
    plotsGridEl.appendChild(card);
  }
}

function renderPlotInner(plot) {
  const host = plot.plant
    ? `<span class="plot-host">${plot.plant.emoji}</span>`
    : `<span class="plot-host empty">(empty)</span>`;
  const stats = [
    ["💧", "moisture", plot.moisture],
    ["☀", "warmth",   plot.warmth],
    ["🌱", "nitrogen", plot.nitrogen],
    ["🪵", "mulch",    Math.min(100, plot.mulch * 20)],
  ];
  const statRows = stats.map(([icon, cls, val]) =>
    `<div class="stat-row" title="${cls}: ${val}">
      <span class="stat-label">${icon}</span>
      <span class="stat-bar"><span class="stat-fill ${cls}" style="width:${Math.max(0, Math.min(100, val))}%"></span></span>
    </div>`
  ).join("");

  let foot;
  if (plot.plant) {
    const p = plot.plant;
    const flags = [];
    flags.push(`<span class="flag${p.pollinated ? " on" : ""}">🐝</span>`);
    if ((plot.pests ?? 0) > 0) flags.push(`<span class="flag on">🐛${plot.pests}</span>`);
    foot = `
      <div class="plot-foot">
        <span class="plant-stage">${p.stageEmoji} ${p.stageLabel} · ${SPECIES[p.species].name}</span>
        <span class="plant-flags">${flags.join("")}</span>
      </div>`;
  } else {
    foot = `<div class="plot-foot"><span class="empty-plot-hint">Plant a seed to begin.</span></div>`;
  }

  return `
    <div class="plot-head">
      <span class="plot-name">${plot.name}</span>
      ${host}
    </div>
    <div class="plot-stats">${statRows}</div>
    ${foot}
  `;
}

function renderBasket(state) {
  basketEl.innerHTML = "";
  if (state.inventory.length === 0) {
    basketEl.innerHTML = `<div class="basket-empty">Empty basket.</div>`;
    return;
  }
  for (const seed of state.inventory) {
    const chip = document.createElement("button");
    chip.className = "seed-chip" + (selectedSeed === seed.id ? " selected" : "");
    chip.disabled = busy;
    const lineage = seed.parentSummary
      ? `<span class="seed-lineage" title="From a parent plant whose life produced ${seed.parentSummary.actionCount} chronicle entries.">★</span>`
      : "";
    chip.innerHTML = `<span class="seed-emoji">${seed.emoji}</span><span>${SPECIES[seed.species].name}</span>${lineage}`;
    chip.title = seed.parentSummary
      ? `Heirloom — last chapter: ${seed.parentSummary.headline}`
      : SPECIES[seed.species].blurb;
    chip.addEventListener("click", () => handleSeedClick(seed.id));
    basketEl.appendChild(chip);
  }
}

function renderSelection(state) {
  const parts = [];
  const plot = selectedPlot ? state.plots.find(p => p.id === selectedPlot) : null;
  const seed = selectedSeed ? state.inventory.find(s => s.id === selectedSeed) : null;
  if (plot) parts.push(`<span class="sel-chip">${plot.name}</span>`);
  if (seed) parts.push(`<span class="sel-chip">${seed.emoji} ${SPECIES[seed.species].name}</span>`);
  selectionBarEl.innerHTML = parts.length
    ? parts.join(' <span style="color:#555">·</span> ')
    : `<span style="color:var(--text-muted)">Nothing selected. Tap a plot to interact with it, or a seed to plant.</span>`;
}

function actionEnabled(actionName, state) {
  const plot = selectedPlot ? state.plots.find(p => p.id === selectedPlot) : null;
  const seed = selectedSeed ? state.inventory.find(s => s.id === selectedSeed) : null;
  switch (actionName) {
    case "water-plot":    return !!plot;
    case "mulch-plot":    return !!plot;
    case "weed-pests":    return !!plot && (plot.pests ?? 0) > 0;
    case "plant-seed":    return !!plot && !plot.plant && !!seed;
    case "harvest-fruit": return !!plot && !!plot.plant && plot.plant.stage === "ripe";
    case "wait-day":      return true;
  }
  return false;
}

function actionHint(state) {
  if (!selectedPlot && !selectedSeed) return "Tap a plot or seed to start.";
  if (selectedPlot && !selectedSeed) {
    const plot = state.plots.find(p => p.id === selectedPlot);
    if (plot.plant) return `${plot.name} · ${plot.plant.emoji} ${plot.plant.stageLabel}`;
    return `${plot.name} · empty — pick a seed to plant`;
  }
  if (!selectedPlot && selectedSeed) {
    const seed = state.inventory.find(s => s.id === selectedSeed);
    return `Holding ${seed.emoji} — pick a plot`;
  }
  const plot = state.plots.find(p => p.id === selectedPlot);
  const seed = state.inventory.find(s => s.id === selectedSeed);
  return `${plot.name} ${plot.plant ? "(planted)" : "(empty)"} · ${seed.emoji} ${SPECIES[seed.species].name}`;
}

function renderActions(state) {
  actionHintEl.textContent = actionHint(state);
  actionListEl.innerHTML = "";
  if (state.season.ended) {
    actionListEl.innerHTML = `<div style="grid-column:1/-1;color:var(--text-muted);font-style:italic;">Season ended. Scroll down for the chronicle's verdict.</div>`;
    return;
  }
  for (const def of PLAYER_ACTION_CATALOG) {
    const btn = document.createElement("button");
    btn.className = "action-btn";
    btn.disabled = busy || !actionEnabled(def.name, state);
    btn.innerHTML = `<span class="action-label">${def.label}</span><span class="action-desc">${def.desc}</span>`;
    btn.addEventListener("click", () => handleAction(def.name));
    actionListEl.appendChild(btn);
  }
}

function renderLog(state) {
  logEl.innerHTML = "";
  const entries = state.log.slice(-80);
  for (const entry of entries) {
    const el = document.createElement("div");
    el.className = `log-entry ${entry.kind}`;
    el.innerHTML = `<span class="log-day">d${entry.day ?? 0}</span>${entry.text}`;
    logEl.appendChild(el);
  }
  logEl.scrollTop = logEl.scrollHeight;
}

function renderAll() {
  const state = game.getState();
  renderHeader(state);
  renderPlots(state);
  renderBasket(state);
  renderSelection(state);
  renderActions(state);
  renderLog(state);
}

function handlePlotClick(plotId) {
  if (busy) return;
  selectedPlot = (selectedPlot === plotId) ? null : plotId;
  renderAll();
}

function handleSeedClick(seedId) {
  if (busy) return;
  selectedSeed = (selectedSeed === seedId) ? null : seedId;
  renderAll();
}

async function handleAction(actionName) {
  if (busy || !game) return;
  const state = game.getState();
  if (state.season.ended) return;
  if (!actionEnabled(actionName, state)) return;

  busy = true;
  setStatus("…");
  renderAll();

  try {
    let payload = { name: actionName };
    if (actionName === "water-plot" || actionName === "mulch-plot" || actionName === "weed-pests") {
      payload.plotId = selectedPlot;
    } else if (actionName === "plant-seed") {
      payload.plotId = selectedPlot;
      payload.seedId = selectedSeed;
    } else if (actionName === "harvest-fruit") {
      const plot = state.plots.find(p => p.id === selectedPlot);
      payload.plantId = plot.plant.id;
    }

    await game.takeTurn(payload);

    if (actionName === "plant-seed") selectedSeed = null;
    // Auto-clear seed selection if it's no longer in inventory.
    const newState = game.getState();
    if (selectedSeed && !newState.inventory.find(s => s.id === selectedSeed)) selectedSeed = null;

    busy = false;
    setStatus("");
    renderAll();
    if (newState.season.ended) await showOutcome();
  } catch (err) {
    busy = false;
    setStatus(`Error: ${err.message}`, true);
    console.error(err);
    renderAll();
  }
}

async function showOutcome() {
  setStatus("Sifting the season's chronicle…");
  const sifting = await game.runSifting();
  setStatus("");

  outcomeEl.hidden = false;
  const a = sifting.archetype;
  const scoreRows = (a.ranked ?? []).map(r => {
    const labels = {
      patient:   "Patient cultivator",
      companion: "Companion planter",
      handsOn:   "Hands-on grower",
    };
    const pct = Math.round((r.weight / Math.max(1, sifting.scores.total)) * 100);
    return `
      <div class="outcome-score-row">
        <span class="label">${labels[r.key]}</span>
        <span class="outcome-score-bar"><span class="outcome-score-fill" style="width:${Math.min(100, pct)}%"></span></span>
        <span style="color:var(--text-muted);min-width:2.6rem;text-align:right;">${pct}%</span>
      </div>`;
  }).join("");

  const vivBits = Object.entries(sifting.vivMatches ?? {}).map(([name, match]) => {
    return `${name}: ${match ? "match" : "no match"}`;
  }).join("  ·  ");

  outcomeEl.innerHTML = `
    <div class="outcome-icon">🌾</div>
    <div class="outcome-title">${a.title}</div>
    <div class="outcome-body">${a.blurb}</div>
    <div class="outcome-scores">${scoreRows}</div>
    <div class="outcome-stats">
      <span>${sifting.stats.plantedCount} planted</span>
      <span>${sifting.stats.harvested} harvested</span>
      <span>${sifting.stats.totalActions} chronicle entries</span>
    </div>
    <div class="outcome-viv">viv sifting patterns &nbsp;${vivBits}</div>
    <button class="outcome-button" id="play-again">Plant another season</button>
  `;
  document.getElementById("play-again").addEventListener("click", () => startGame());
}

async function startGame() {
  outcomeEl.hidden = true;
  logEl.innerHTML = "";
  selectedPlot = null;
  selectedSeed = null;
  setStatus("Loading…");

  try {
    const seed = `rootwork-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    game = initGame(runtime, bundle, seed);
    await game.start();
    setStatus("");
    renderAll();
  } catch (err) {
    setStatus(`Failed to start: ${err.message}`, true);
    console.error(err);
  }
}

async function init() {
  setStatus("Loading bundle…");
  try {
    bundle = await fetch("./bundle.json").then(r => r.json());
    await startGame();
  } catch (err) {
    setStatus(`Failed to load: ${err.message}`, true);
    console.error(err);
  }
}

init();
