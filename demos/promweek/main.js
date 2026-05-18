import { initializeVivRuntime, attemptAction, selectAction, EntityType } from "../../shared/viv-runtime.js";
import { initGame, ACTION_CATALOG, CATEGORIES, CHARACTER_DEFS, ACT1_TURNS, ACT2_TURNS } from "./sim.mjs";

const runtime = { initializeVivRuntime, attemptAction, selectAction, EntityType };
let bundle = null;
let game = null;
let busy = false;
let selectedInitiator = null;
let selectedTarget = null;
let lastActSeen = 1;

const statusEl       = document.getElementById("status");
const logEl          = document.getElementById("log");
const castGridEl     = document.getElementById("cast-grid");
const actionListEl   = document.getElementById("action-list");
const actionHintEl   = document.getElementById("action-hint");
const turnCountEl    = document.getElementById("turn-count");
const outcomeEl      = document.getElementById("outcome");
const actLabelEl     = document.getElementById("act-label");
const subtitleEl     = document.getElementById("subtitle");
const goalTitleEl    = document.getElementById("goal-title");
const goalFlavorEl   = document.getElementById("goal-flavor");
const goalHintEl     = document.getElementById("goal-hint");
const selectionLabelEl = document.getElementById("selection-label");
const clearSelectionEl = document.getElementById("clear-selection");

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.hidden = !msg;
  statusEl.className = "status" + (isError ? " error" : "");
}

function renderActHeader(actNumber, turn) {
  const totalTurns = ACT1_TURNS + ACT2_TURNS;
  actLabelEl.textContent = actNumber === 1
    ? `Act 1 · the week before prom`
    : `Act 2 · prom night`;
  actLabelEl.className = `scene-label act-${actNumber}`;
  subtitleEl.textContent = actNumber === 1
    ? "Northside High · the week before prom"
    : "The gym, transformed · prom night";
  turnCountEl.textContent = `Turn ${turn} / ${totalTurns}`;
}

function relationBadges(state, characterID) {
  const c = state.characters.find(c => c.id === characterID);
  if (!c) return "";
  const badges = [];
  for (const [otherID, rel] of Object.entries(c.relationships ?? {})) {
    const other = CHARACTER_DEFS[otherID];
    if (!other) continue;
    badges.push(`<span class="badge badge-${rel}">${rel} · ${other.name}</span>`);
  }
  for (const [otherID, hasCrush] of Object.entries(c.crushes ?? {})) {
    if (!hasCrush) continue;
    const other = CHARACTER_DEFS[otherID];
    if (!other) continue;
    badges.push(`<span class="badge badge-crush">crush · ${other.name}</span>`);
  }
  return badges.length ? `<div class="cast-badges">${badges.join("")}</div>` : "";
}

function selectionRoleFor(id) {
  if (id === selectedInitiator) return "initiator";
  if (id === selectedTarget)    return "target";
  return null;
}

function handleCastClick(id) {
  if (busy) return;
  if (selectedInitiator === id) {
    // Click initiator → clear selection
    selectedInitiator = null;
    selectedTarget = null;
  } else if (selectedTarget === id) {
    // Click current target → clear target only
    selectedTarget = null;
  } else if (!selectedInitiator) {
    selectedInitiator = id;
    selectedTarget = null;
  } else if (!selectedTarget) {
    selectedTarget = id;
  } else {
    // Both set; new click becomes the new initiator
    selectedInitiator = id;
    selectedTarget = null;
  }
  renderCast(game.getState());
  renderActions();
}

function renderCast(state) {
  castGridEl.innerHTML = "";
  for (const c of state.characters) {
    const role = selectionRoleFor(c.id);
    const card = document.createElement("button");
    card.className = "cast-card" + (role ? ` selected role-${role}` : "");
    card.disabled = busy;

    const showNetworks = selectedInitiator && c.id !== selectedInitiator;
    let networkRow = "";
    if (showNetworks) {
      const snap = game.getSnapshot(selectedInitiator, c.id);
      const vibe = game.getPairVibe(selectedInitiator, c.id);
      networkRow = `
        <div class="cast-vibe ${vibe.cls}">${vibe.label}</div>
        <div class="cast-networks">
          <span>buddy ${snap.buddy}</span><span>romance ${snap.romance}</span>
          <span>cool ${snap.cool}</span><span>tension ${snap.tension}</span>
        </div>`;
    }

    const roleTag = role === "initiator"
      ? `<span class="role-tag role-tag-initiator">Initiator</span>`
      : role === "target"
        ? `<span class="role-tag role-tag-target">Receiver</span>`
        : "";

    card.innerHTML = `
      <div class="cast-row">
        <div class="cast-portrait">${c.portrait}</div>
        <div class="cast-id">
          <div class="cast-name">${c.name}${roleTag}</div>
          <div class="cast-traits">${c.traits.slice(0, 2).join(" · ")}</div>
        </div>
      </div>
      ${networkRow}
      ${relationBadges(state, c.id)}
    `;
    card.addEventListener("click", () => handleCastClick(c.id));
    castGridEl.appendChild(card);
  }
}

function renderSelectionLabel() {
  if (!selectedInitiator) {
    selectionLabelEl.innerHTML = `<span class="hint">First click an initiator, then a receiver.</span>`;
    clearSelectionEl.hidden = true;
    return;
  }
  const iDef = CHARACTER_DEFS[selectedInitiator];
  if (!selectedTarget) {
    selectionLabelEl.innerHTML = `
      <span class="sel-name">${iDef.portrait} ${iDef.name}</span>
      <span class="arrow">→</span>
      <span class="hint">pick a receiver</span>
    `;
  } else {
    const tDef = CHARACTER_DEFS[selectedTarget];
    selectionLabelEl.innerHTML = `
      <span class="sel-name">${iDef.portrait} ${iDef.name}</span>
      <span class="arrow">→</span>
      <span class="sel-name">${tDef.portrait} ${tDef.name}</span>
    `;
  }
  clearSelectionEl.hidden = false;
}

function renderActions() {
  renderSelectionLabel();
  actionListEl.innerHTML = "";

  if (!selectedInitiator) {
    actionHintEl.textContent = "Pick two characters above";
    actionListEl.innerHTML = `<div class="action-empty">Click someone to choose who acts — then click their receiver.</div>`;
    return;
  }
  if (!selectedTarget) {
    actionHintEl.textContent = "Now pick a receiver";
    actionListEl.innerHTML = `<div class="action-empty">${CHARACTER_DEFS[selectedInitiator].name} is ready. Click another character to be the receiver.</div>`;
    return;
  }

  const iDef = CHARACTER_DEFS[selectedInitiator];
  const tDef = CHARACTER_DEFS[selectedTarget];
  const available = game.getAvailableActions(selectedInitiator, selectedTarget);
  actionHintEl.textContent = `${iDef.name} → ${tDef.name} · ${available.length} option${available.length === 1 ? "" : "s"}`;

  if (available.length === 0) {
    actionListEl.innerHTML = `<div class="action-empty">${iDef.name} doesn't feel like doing anything with ${tDef.name} right now. Try a different pair.</div>`;
    return;
  }

  const byCategory = {};
  for (const a of available) (byCategory[a.category] ??= []).push(a);

  for (const cat of CATEGORIES) {
    const actions = byCategory[cat.key];
    if (!actions || actions.length === 0) continue;
    const group = document.createElement("div");
    group.className = `action-group action-group-${cat.key}`;
    group.innerHTML = `<div class="action-group-label">${cat.label}</div>`;
    const grid = document.createElement("div");
    grid.className = "action-grid";
    for (const a of actions) {
      const btn = document.createElement("button");
      btn.className = `action-btn intent-${cat.key}`;
      btn.disabled = busy;
      btn.innerHTML = `
        <div class="action-top">
          <span class="action-label">${a.label}</span>
          <span class="action-score">${a.volition}</span>
        </div>
        <div class="action-desc">${a.desc}</div>
      `;
      btn.addEventListener("click", () => handleAction(a.name));
      grid.appendChild(btn);
    }
    group.appendChild(grid);
    actionListEl.appendChild(group);
  }
}

function appendLogEntry({ turn, initiatorName, targetName, actionDef, exchangeGloss, responseGloss, triggers, actNumber }) {
  if (actNumber > lastActSeen) {
    const banner = document.createElement("div");
    banner.className = "log-act-banner";
    banner.textContent = `Act ${actNumber} · prom night begins`;
    logEl.appendChild(banner);
    lastActSeen = actNumber;
  }

  const entry = document.createElement("div");
  entry.className = "log-entry intent-" + (actionDef.category ?? "warm");

  let html = `<div class="log-turn">Turn ${turn} · ${initiatorName} → ${targetName} · ${actionDef.label}</div>`;
  if (exchangeGloss) html += `<div class="log-exchange">${exchangeGloss}</div>`;
  if (responseGloss) html += `<div class="log-response">${responseGloss}</div>`;
  for (const t of triggers ?? []) html += `<div class="log-trigger">→ ${t.gloss}</div>`;
  entry.innerHTML = html;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

function showOutcome(outcome) {
  outcomeEl.hidden = false;
  outcomeEl.className = "outcome " + (outcome.achieved ? "goal-won" : "goal-lost");
  const goal = game.getGoal();
  const icon = outcome.achieved ? "🌟" : "🌧️";
  const title = outcome.achieved ? "Goal achieved." : "Not quite.";
  const body = outcome.achieved ? goal.successText() : goal.failText();

  const stats = `
    <div class="outcome-stats">
      <span>${outcome.friendsPairs} friend pair${outcome.friendsPairs === 1 ? "" : "s"}</span>
      <span>${outcome.datingPairs} dating</span>
      <span>${outcome.enemiesPairs} enemy pair${outcome.enemiesPairs === 1 ? "" : "s"}</span>
    </div>
  `;

  outcomeEl.innerHTML = `
    <div class="outcome-icon">${icon}</div>
    <div class="outcome-title">${title}</div>
    <div class="outcome-body">${body}</div>
    <div class="outcome-goal ${outcome.achieved ? "goal-achieved" : "goal-failed"}">
      <span class="outcome-goal-icon">${outcome.achieved ? "✓" : "✗"}</span>
      <span class="outcome-goal-label">${goal.title}:</span>
      ${goal.hint}
    </div>
    ${stats}
    <button id="outcome-replay">Play again</button>
  `;
  document.getElementById("outcome-replay").addEventListener("click", () => startGame());
}

async function handleAction(actionName) {
  if (busy || !game || !selectedInitiator || !selectedTarget) return;
  busy = true;
  setStatus("Thinking…");
  renderActions();

  try {
    const actionDef = ACTION_CATALOG.find(a => a.name === actionName);
    const beforeState = game.getState();
    const initiatorID = selectedInitiator;
    const targetID    = selectedTarget;
    const result = await game.takeTurn(actionName, initiatorID, targetID);

    appendLogEntry({
      turn:          beforeState.turn + 1,
      initiatorName: CHARACTER_DEFS[initiatorID].name,
      targetName:    CHARACTER_DEFS[targetID].name,
      actionDef,
      exchangeGloss: result.exchange?.gloss ?? null,
      responseGloss: result.response?.gloss ?? null,
      triggers:      result.triggers ?? [],
      actNumber:     result.actNumber,
    });

    busy = false;
    setStatus("");

    const state = game.getState();
    renderActHeader(state.actNumber, state.turn);
    renderCast(state);
    renderActions();

    if (result.outcome) showOutcome(result.outcome);
  } catch (err) {
    busy = false;
    setStatus(`Error: ${err.message}`, true);
    console.error(err);
    renderActions();
  }
}

async function startGame() {
  outcomeEl.hidden = true;
  logEl.innerHTML = "";
  selectedInitiator = null;
  selectedTarget = null;
  lastActSeen = 1;
  setStatus("Loading…");

  try {
    game = initGame(runtime, bundle);
    const startInfo = await game.start();

    const goal = game.getGoal();
    goalTitleEl.textContent  = goal.title;
    goalFlavorEl.textContent = goal.flavor;
    goalHintEl.textContent   = goal.hint;

    const state = game.getState();
    renderActHeader(state.actNumber, state.turn);
    renderCast(state);
    renderActions();

    logEl.innerHTML = `<div class="log-intro">
      <strong>${startInfo.opening?.gloss ?? "The week before prom."}</strong>
      <br><br>
      Click a character to be the <em>initiator</em>, then click another to be the <em>receiver</em>. The action menu shows what the initiator is willing to do toward that receiver right now (utility score on each button). You have ${ACT1_TURNS} school turns and ${ACT2_TURNS} prom turns to engineer the goal above.
    </div>`;
    setStatus("");
  } catch (err) {
    setStatus(`Failed to load: ${err.message}`, true);
    console.error(err);
  }
}

async function init() {
  setStatus("Loading…");
  try {
    bundle = await fetch("./bundle.json").then(r => r.json());
    clearSelectionEl.addEventListener("click", () => {
      if (busy) return;
      selectedInitiator = null;
      selectedTarget = null;
      renderCast(game.getState());
      renderActions();
    });
    await startGame();
  } catch (err) {
    setStatus(`Failed to load: ${err.message}`, true);
    console.error(err);
  }
}

init();
