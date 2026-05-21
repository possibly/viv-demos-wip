import {
  initializeVivRuntime, attemptAction, selectAction, tickPlanner,
  runSiftingPattern, EntityType,
} from "../../shared/viv-runtime.js";
import {
  initGame, PLAYER_ACTION_CATALOG, SPECIES, STAGE_LABEL, STAGE_EMOJI,
  STAGE_ORDER, SEASON_DAYS, CULTIVARS, TRAIT_RULES, traitRule,
  loadSave, saveSave, clearSave,
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
const journalEl      = document.getElementById("journal");
const outcomeEl      = document.getElementById("outcome");
const popoverEl      = document.getElementById("popover");
const modalBackdrop  = document.getElementById("modal-backdrop");
const modalEl        = document.getElementById("modal");
const modalContent   = document.getElementById("modal-content");
const modalClose     = document.getElementById("modal-close");

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

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
    card.addEventListener("click", (e) => {
      const pedTarget = e.target.closest("[data-plant-pedigree]");
      if (pedTarget) {
        e.stopPropagation();
        openPedigreeForPlant(pedTarget.getAttribute("data-plant-pedigree"));
        return;
      }
      handlePlotClick(plot.id);
    });
    plotsGridEl.appendChild(card);
  }
}

function renderPlotInner(plot) {
  const host = plot.plant
    ? `<span class="plot-host" title="${escapeHTML(plot.plant.name)}">${plot.plant.emoji}</span>`
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
    const cultivar = p.cultivarName ?? "";
    const hybridMark = p.isHybrid ? `<span class="plot-hybrid" title="Hybrid">×</span>` : "";
    foot = `
      <div class="plot-foot">
        <span class="plant-stage">${p.stageEmoji} ${p.stageLabel} · ${escapeHTML(cultivar)} ${SPECIES[p.species].name}${hybridMark}</span>
        <span class="plant-flags">${flags.join("")}</span>
      </div>`;
  } else {
    foot = `<div class="plot-foot"><span class="empty-plot-hint">Plant a seed to begin.</span></div>`;
  }

  // Lineage badge: an inherited trait list from the seed this plant was
  // grown from, so the player can see "this one came from a Sweet parent."
  let lineage = "";
  if (plot.plant && plot.plant.inheritedTraits?.length) {
    const tags = plot.plant.inheritedTraits.map(t =>
      `<span class="trait-tag inherited" title="Inherited: ${t.explain}">★ ${t.label}</span>`
    ).join("");
    lineage = `<div class="plot-lineage">From: ${tags}</div>`;
  }

  // Earned traits (assigned at ripening). These are the new qualities the
  // plant developed this season — visible from "ripe" stage onward.
  let traits = "";
  if (plot.plant && plot.plant.traits?.length) {
    const tags = plot.plant.traits.map(t =>
      `<span class="trait-tag earned" title="${t.explain}">${t.label}</span>`
    ).join("");
    traits = `<div class="plot-traits">${tags}</div>`;
  }

  const lineageLink = (plot.plant && (plot.plant.parentSummary || plot.plant.inheritedTraits?.length || plot.plant.isHybrid))
    ? `<span class="plot-pedigree-link" data-plant-pedigree="${plot.plant.id}" title="See where this plant came from" role="button" tabindex="0">↳ lineage</span>`
    : "";

  return `
    <div class="plot-head">
      <span class="plot-name">${plot.name}</span>
      ${host}
    </div>
    <div class="plot-stats">${statRows}</div>
    ${foot}
    ${traits}
    ${lineage}
    ${lineageLink}
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
    if (seed.isHybrid) chip.classList.add("hybrid");
    chip.disabled = busy;

    let traitLabels = "";
    if (seed.parentTraits?.length) {
      traitLabels = `<span class="seed-traits">${seed.parentTraits.map(t => `★ ${escapeHTML(t.label)}`).join(" · ")}</span>`;
    } else if (seed.parentSummary) {
      traitLabels = `<span class="seed-lineage">★ heirloom</span>`;
    }
    const cultivarLabel = seed.cultivarName ? `<span class="seed-cultivar">${escapeHTML(seed.cultivarName)}</span> ` : "";
    chip.innerHTML = `<span class="seed-emoji">${seed.emoji}</span>${cultivarLabel}<span class="seed-species">${SPECIES[seed.species].name}</span>${traitLabels}`;

    chip.addEventListener("click", () => handleSeedClick(seed.id));
    chip.addEventListener("mouseenter", () => showSeedPopover(chip, seed));
    chip.addEventListener("focus", () => showSeedPopover(chip, seed));
    chip.addEventListener("mouseleave", hidePopover);
    chip.addEventListener("blur", hidePopover);
    basketEl.appendChild(chip);
  }
}

function showSeedPopover(anchor, seed) {
  const preview = seed.preview ?? {};
  const t = preview.t ?? {};
  const base = preview.base ?? {};
  const sens = preview.sens ?? { water: 1, rain: 1 };
  const cultivarName = seed.cultivarName ?? "";
  const lines = [];
  if (preview.blurb) lines.push(`<div class="popover-blurb">${escapeHTML(preview.blurb)}</div>`);
  if (seed.isHybrid) {
    lines.push(`<div class="popover-hybrid">Hybrid · gen ${seed.generation ?? 1}</div>`);
  } else if (seed.generation && seed.generation > 1) {
    lines.push(`<div class="popover-gen">Generation ${seed.generation}</div>`);
  }
  // Threshold + sensitivity grid. Show modified value next to base when they
  // differ — this is the predict-before-planting surface.
  const rows = [
    ["Germinate", "moisture ≥", t.g_m, base.g_m],
    ["Germinate", "warmth ≥",   t.g_w, base.g_w],
    ["Leaf out",  "nitrogen ≥", t.l_n, base.l_n],
    ["Flower",    "warmth ≥",   t.f_w, base.f_w],
    ["Ripen",     "warmth ≥",   t.r_w, base.r_w],
  ].filter(([,, v]) => v != null).map(([phase, label, v, b]) => {
    const baseStr = (b != null && b !== v) ? ` <span class="popover-base">(base ${b})</span>` : "";
    return `<div class="popover-row"><span class="popover-phase">${phase}</span><span class="popover-label">${label}</span><span class="popover-val">${v}${baseStr}</span></div>`;
  }).join("");

  const sensRows = [];
  if (sens.water !== 1) sensRows.push(`<div class="popover-row"><span class="popover-phase">Watering</span><span class="popover-label">absorbs</span><span class="popover-val">${Math.round(sens.water * 100)}%</span></div>`);
  if (sens.rain !== 1) sensRows.push(`<div class="popover-row"><span class="popover-phase">Rain</span><span class="popover-label">absorbs</span><span class="popover-val">${Math.round(sens.rain * 100)}%</span></div>`);
  if (preview.pestResist) sensRows.push(`<div class="popover-row"><span class="popover-phase">Pests</span><span class="popover-label">resist</span><span class="popover-val">${preview.pestResist > 0 ? "+" : ""}${Math.round(preview.pestResist * 100)}%</span></div>`);

  const traitsSection = seed.parentTraits?.length
    ? `<div class="popover-traits"><div class="popover-section-head">Inherited from parent</div>${seed.parentTraits.map(t => `<div class="popover-trait">★ <strong>${escapeHTML(t.label)}</strong> — ${escapeHTML(t.explain)}</div>`).join("")}</div>`
    : "";
  const donorSection = seed.donorTraits?.length
    ? `<div class="popover-traits"><div class="popover-section-head">From cross with ${escapeHTML(seed.donorCultivarName ?? "")}</div>${seed.donorTraits.map(t => `<div class="popover-trait">✦ <strong>${escapeHTML(t.label)}</strong> — ${escapeHTML(t.explain)}</div>`).join("")}</div>`
    : "";
  const pedigreeBtn = (seed.parentSeedId || seed.parentTraits?.length || seed.parentSummary)
    ? `<button class="popover-pedigree-btn" data-seed-pedigree="${seed.id}">View lineage</button>`
    : "";

  popoverEl.innerHTML = `
    <div class="popover-head">${seed.emoji} <strong>${escapeHTML(cultivarName)}</strong> ${escapeHTML(SPECIES[seed.species].name)}</div>
    ${lines.join("")}
    <div class="popover-grid">${rows}${sensRows.join("")}</div>
    ${traitsSection}
    ${donorSection}
    ${pedigreeBtn}
  `;
  positionPopover(anchor);
  popoverEl.hidden = false;
  popoverEl.querySelector("[data-seed-pedigree]")?.addEventListener("click", (e) => {
    e.stopPropagation();
    hidePopover();
    openPedigreeForSeed(seed.id);
  });
}

function positionPopover(anchor) {
  const r = anchor.getBoundingClientRect();
  const top = Math.max(8, r.bottom + 6 + window.scrollY);
  // Try right of anchor; fall back to clamped to viewport.
  const left = Math.min(window.innerWidth - 280 - 8, Math.max(8, r.left));
  popoverEl.style.top = `${top}px`;
  popoverEl.style.left = `${left}px`;
}

function hidePopover() {
  popoverEl.hidden = true;
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

function renderJournal(state) {
  journalEl.innerHTML = "";

  // New-cultivar banners come first — these are the breeding-payoff moments.
  if (state.newCultivars?.length) {
    for (const nc of state.newCultivars) {
      const banner = document.createElement("div");
      banner.className = "journal-new-cultivar";
      banner.innerHTML = `<strong>New cultivar stabilized:</strong> ${escapeHTML(nc.name)} ${escapeHTML(SPECIES[nc.species].name)} — after three generations of consistent trait inheritance.`;
      journalEl.appendChild(banner);
    }
  }

  if (!state.journal.length) {
    const empty = document.createElement("div");
    empty.className = "journal-empty";
    empty.textContent = "No traits observed yet. Plants get traits when they ripen — try planting clover next to a tomato, or mulching a plot, or letting rain do the watering, and see what changes.";
    journalEl.appendChild(empty);
    return;
  }
  const bySpecies = {};
  for (const j of state.journal) (bySpecies[j.species] ??= []).push(j);
  const speciesOrder = Object.keys(bySpecies).sort();
  for (const sp of speciesOrder) {
    const block = document.createElement("div");
    block.className = "journal-species";
    block.innerHTML = `<div class="journal-species-head">${SPECIES[sp].emoji} ${SPECIES[sp].name}</div>`;
    for (const entry of bySpecies[sp]) {
      const row = document.createElement("div");
      row.className = "journal-row";
      const rule = traitRule(entry.traitId);
      const inheritText = rule?.inheritExplain ? `<div class="journal-inherit">↳ ${escapeHTML(rule.inheritExplain)}</div>` : "";
      row.innerHTML = `
        <span class="journal-trait">${escapeHTML(entry.label)}</span>
        <span class="journal-explain">${escapeHTML(entry.explain)}${inheritText}</span>
        <span class="journal-count">×${entry.count} · first d${entry.firstSeenDay}</span>
      `;
      block.appendChild(row);
    }
    journalEl.appendChild(block);
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
  renderJournal(state);
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

  // Persist the next-season save. New cultivars and traits carry forward.
  saveSave(game.serialize());

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

  const state = game.getState();
  const seedsToCarry = state.inventory.length;
  const cultivarLabels = Object.values(state.localCultivars ?? {}).map(c => `★ ${escapeHTML(c.name)}`).join("  ·  ");
  const stableLine = cultivarLabels ? `<div class="outcome-stable">Stable strains: ${cultivarLabels}</div>` : "";

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
    ${stableLine}
    <div class="outcome-viv">viv sifting patterns &nbsp;${vivBits}</div>
    <div class="outcome-buttons">
      <button class="outcome-button" id="play-again">Plant another season (${seedsToCarry} seeds)</button>
      <button class="outcome-button secondary" id="burn-journal">Burn the journal &amp; start fresh</button>
    </div>
  `;
  document.getElementById("play-again").addEventListener("click", () => startGame({ continueRun: true }));
  document.getElementById("burn-journal").addEventListener("click", () => {
    if (!confirm("Burn the journal? You'll lose your saved seeds, journal, and stabilized cultivars.")) return;
    clearSave();
    startGame({ continueRun: false });
  });
}

async function startGame(opts = {}) {
  outcomeEl.hidden = true;
  hidePopover();
  closeModal();
  logEl.innerHTML = "";
  selectedPlot = null;
  selectedSeed = null;
  setStatus("Loading…");

  try {
    const seed = `rootwork-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    game = initGame(runtime, bundle, seed);
    const save = opts.continueRun !== false ? loadSave() : null;
    await game.start({ save });
    setStatus("");
    renderAll();
  } catch (err) {
    setStatus(`Failed to start: ${err.message}`, true);
    console.error(err);
  }
}

// ── Pedigree modal ─────────────────────────────────────────────────────────

function openPedigreeForPlant(plantId) {
  const state = game.getState();
  const plant = state.plants.find(p => p.id === plantId);
  if (!plant) return;
  const nodes = buildPedigreeFromPlant(state, plant);
  showPedigreeModal(`${plant.cultivarName ?? ""} ${SPECIES[plant.species].name}`, nodes);
}

function openPedigreeForSeed(seedId) {
  const state = game.getState();
  const seed = state.inventory.find(s => s.id === seedId);
  if (!seed) return;
  const nodes = buildPedigreeFromSeed(state, seed);
  showPedigreeModal(`${seed.cultivarName ?? ""} ${SPECIES[seed.species].name} seed`, nodes);
}

// Walk the lineage records (populated as plants are planted) to build a
// vertical tree from the current plant/seed back to its earliest known
// ancestor. The lineage map persists across season resets via localStorage.
function buildPedigreeFromPlant(state, plant) {
  const lineage = state.lineage ?? {};
  const nodes = [currentNode(plant, state)];
  // Walk back: this plant was grown from parentSeedId; that seed was
  // produced by an earlier plant whose lineage entry has producedSeedId
  // matching. Hop seed → plant → seed → plant across seasons.
  let parentSeedId = lineage[plant.id]?.parentSeedId ?? plant.parentSeedId ?? null;
  let depth = 0;
  while (parentSeedId && depth < 10) {
    const ancestor = Object.values(lineage).find(n => n.producedSeedId === parentSeedId);
    if (!ancestor) break;
    nodes.push(lineageNode(ancestor));
    parentSeedId = ancestor.parentSeedId;
    depth++;
  }
  return nodes;
}

function buildPedigreeFromSeed(state, seed) {
  const lineage = state.lineage ?? {};
  const nodes = [{
    title: `Seed: ${seed.cultivarName ?? ""} ${SPECIES[seed.species].name}`,
    subtitle: seed.isHybrid ? `Hybrid · gen ${seed.generation ?? 1}` : `Generation ${seed.generation ?? 1}`,
    traits: seed.parentTraits ?? [],
    donorTraits: seed.donorTraits ?? [],
    donorCultivarName: seed.donorCultivarName,
  }];
  // Find the plant that produced this seed (its lineage.producedSeedId).
  let curSeedId = seed.id;
  let depth = 0;
  while (curSeedId && depth < 10) {
    const producer = Object.values(lineage).find(n => n.producedSeedId === curSeedId);
    if (!producer) break;
    nodes.push(lineageNode(producer));
    curSeedId = producer.parentSeedId;
    depth++;
  }
  return nodes;
}

function lineageNode(rec) {
  return {
    title: `${rec.cultivarName ?? ""} ${SPECIES[rec.species].name}`,
    subtitle: `Season ${rec.seasonNumber ?? 1} · gen ${rec.generation ?? 1}`,
    traits: rec.inheritedTraits ?? [],
    donorTraits: rec.donorTraits ?? [],
    earnedTraits: rec.earnedTraits ?? [],
  };
}

function currentNode(plant, state) {
  return {
    title: `${plant.cultivarName ?? ""} ${SPECIES[plant.species].name} (currently in ${state.plots.find(pl => pl.id === plant.location)?.name ?? plant.location})`,
    subtitle: `${plant.stageLabel} · gen ${plant.generation ?? 1}${plant.isHybrid ? " · hybrid" : ""}`,
    traits: plant.inheritedTraits ?? [],
    donorTraits: plant.donorTraits ?? [],
    earnedTraits: plant.traits ?? [],
  };
}

function showPedigreeModal(title, nodes) {
  const body = nodes.length === 0
    ? `<div class="pedigree-empty">No earlier ancestors recorded.</div>`
    : nodes.map((n, i) => renderPedigreeNode(n, i, i === nodes.length - 1)).join('<div class="pedigree-arrow">↑</div>');
  modalContent.innerHTML = `
    <div class="modal-title">Lineage: ${escapeHTML(title)}</div>
    <div class="pedigree">${body}</div>
  `;
  modalBackdrop.hidden = false;
}

function renderPedigreeNode(n, idx, isOldest) {
  const traits = (n.traits ?? []).map(t => `<span class="trait-tag inherited">★ ${escapeHTML(t.label)}</span>`).join("");
  const donor = (n.donorTraits ?? []).map(t => `<span class="trait-tag donor">✦ ${escapeHTML(t.label)}</span>`).join("");
  const earned = (n.earnedTraits ?? []).map(t => `<span class="trait-tag earned">${escapeHTML(t.label)}</span>`).join("");
  const donorBlock = donor ? `<div class="pedigree-traits"><span class="pedigree-label">cross with ${escapeHTML(n.donorCultivarName ?? "another cultivar")}:</span> ${donor}</div>` : "";
  return `
    <div class="pedigree-node${isOldest ? " oldest" : ""}${idx === 0 ? " current" : ""}">
      <div class="pedigree-node-title">${escapeHTML(n.title)}</div>
      ${n.subtitle ? `<div class="pedigree-node-sub">${escapeHTML(n.subtitle)}</div>` : ""}
      ${earned ? `<div class="pedigree-traits"><span class="pedigree-label">earned:</span> ${earned}</div>` : ""}
      ${traits ? `<div class="pedigree-traits"><span class="pedigree-label">inherited:</span> ${traits}</div>` : ""}
      ${donorBlock}
    </div>
  `;
}

function closeModal() {
  modalBackdrop.hidden = true;
}

modalClose.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => { if (e.target === modalBackdrop) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); hidePopover(); } });

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
