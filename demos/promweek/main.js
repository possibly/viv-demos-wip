import { initializeVivRuntime, attemptAction, selectAction, EntityType } from "../../shared/viv-runtime.js";
import { initGame, ACTION_CATALOG, CATEGORIES, CHARACTER_DEFS, ACT1_TURNS, ACT2_TURNS } from "./sim.mjs";

const runtime = { initializeVivRuntime, attemptAction, selectAction, EntityType };
let bundle = null;
let game = null;
let busy = false;
let selectedTarget = null;
let lastActSeen = 1;

const statusEl       = document.getElementById("status");
const logEl          = document.getElementById("log");
const castGridEl     = document.getElementById("cast-grid");
const actionPanelEl  = document.getElementById("action-panel");
const actionListEl   = document.getElementById("action-list");
const actionHintEl   = document.getElementById("action-hint");
const turnCountEl    = document.getElementById("turn-count");
const outcomeEl      = document.getElementById("outcome");
const actLabelEl     = document.getElementById("act-label");
const subtitleEl     = document.getElementById("subtitle");
const alexStatusesEl = document.getElementById("alex-statuses");

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

function renderCast(state) {
  castGridEl.innerHTML = "";
  for (const c of state.characters) {
    const snap = game.getSnapshot(c.id);
    const card = document.createElement("button");
    card.className = "cast-card" + (selectedTarget === c.id ? " selected" : "");
    card.disabled = busy;
    card.innerHTML = `
      <div class="cast-row">
        <div class="cast-portrait">${c.portrait}</div>
        <div>
          <div class="cast-name">${c.name}</div>
          <div class="cast-traits">${c.traits.slice(0, 2).join(" · ")}</div>
        </div>
      </div>
      <div class="cast-vibe ${c.vibe.cls}">${c.vibe.label}</div>
      <div class="cast-networks">
        <span>buddy ${snap.focusBuddy}</span><span>romance ${snap.focusRomance}</span>
        <span>cool ${snap.focusCool}</span><span>tension ${snap.focusTension}</span>
      </div>
    `;
    card.addEventListener("click", () => {
      selectedTarget = c.id;
      renderCast(state);
      renderActions();
    });
    castGridEl.appendChild(card);
  }
}

function renderAlexStatuses(state) {
  alexStatusesEl.innerHTML = "";
  const ss = state.alexStatuses ?? {};
  if (ss.popular) {
    const pill = document.createElement("span");
    pill.className = "status-pill popular";
    pill.textContent = "Popular";
    alexStatusesEl.appendChild(pill);
  }
  const crushes = ss.crush ?? {};
  for (const [id, hasCrush] of Object.entries(crushes)) {
    if (!hasCrush) continue;
    const def = CHARACTER_DEFS[id];
    if (!def) continue;
    const pill = document.createElement("span");
    pill.className = "status-pill";
    pill.textContent = `Crush: ${def.name}`;
    alexStatusesEl.appendChild(pill);
  }
}

function renderActions() {
  actionListEl.innerHTML = "";
  if (!selectedTarget) {
    actionHintEl.textContent = "Pick a target above";
    actionListEl.innerHTML = `<div class="action-empty">Select someone from the cast to see what you can do.</div>`;
    return;
  }
  const targetDef = CHARACTER_DEFS[selectedTarget];
  const available = game.getAvailableActions(selectedTarget);
  actionHintEl.textContent = `Toward ${targetDef.name} · ${available.length} option${available.length === 1 ? "" : "s"}`;

  if (available.length === 0) {
    actionListEl.innerHTML = `<div class="action-empty">Nothing comes to mind right now. Try a different target.</div>`;
    return;
  }

  // Group by category, preserving the global volition-sort within each group.
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

function appendLogEntry({ turn, actionDef, exchangeGloss, responseGloss, triggers, actNumber }) {
  if (actNumber > lastActSeen) {
    const banner = document.createElement("div");
    banner.className = "log-act-banner";
    banner.textContent = `Act ${actNumber} · prom night begins`;
    logEl.appendChild(banner);
    lastActSeen = actNumber;
  }

  const entry = document.createElement("div");
  entry.className = "log-entry intent-" + (actionDef.category ?? "warm");

  let html = `<div class="log-turn">Turn ${turn} · ${actionDef.label}</div>`;
  if (exchangeGloss) html += `<div class="log-exchange">${exchangeGloss}</div>`;
  if (responseGloss) html += `<div class="log-response">${responseGloss}</div>`;
  for (const t of triggers ?? []) html += `<div class="log-trigger">→ ${t.gloss}</div>`;
  entry.innerHTML = html;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

function showOutcome(outcome) {
  outcomeEl.hidden = false;
  outcomeEl.className = "outcome " + outcome.kind;
  let icon, title, body;
  switch (outcome.kind) {
    case "win-date":
      icon = "🌟"; title = "You did it.";
      body = `You and ${CHARACTER_DEFS[outcome.partner].name} are dating. The night ended exactly the way you hoped.`;
      break;
    case "win-friends":
      icon = "💛"; title = "Good company.";
      body = `Not a date — but you ended prom with real friends. That's not nothing.`;
      break;
    case "lose-pariah":
      icon = "😶"; title = "Rough night.";
      body = `Two enemies and not much else. You pushed too hard.`;
      break;
    default:
      icon = "🤷"; title = "Just another night.";
      body = `Prom came and went. Some moments stood out. Most didn't.`;
  }
  outcomeEl.innerHTML = `
    <div class="outcome-icon">${icon}</div>
    <div class="outcome-title">${title}</div>
    <div class="outcome-body">${body}</div>
    <button id="outcome-replay">Play again</button>
  `;
  document.getElementById("outcome-replay").addEventListener("click", () => startGame());
}

async function handleAction(actionName) {
  if (busy || !game || !selectedTarget) return;
  busy = true;
  setStatus("Thinking…");
  renderActions();

  try {
    const actionDef = ACTION_CATALOG.find(a => a.name === actionName);
    const beforeState = game.getState();
    const result = await game.takeTurn(actionName, selectedTarget);

    appendLogEntry({
      turn:          beforeState.turn + 1,
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
    renderAlexStatuses(state);
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
  selectedTarget = null;
  lastActSeen = 1;
  setStatus("Loading…");

  try {
    game = initGame(runtime, bundle);
    const startInfo = await game.start();
    const state = game.getState();
    renderActHeader(state.actNumber, state.turn);
    renderCast(state);
    renderAlexStatuses(state);
    renderActions();

    logEl.innerHTML = `<div class="log-intro">
      <strong>${startInfo.opening?.gloss ?? "The week before prom."}</strong>
      <br><br>
      Pick someone, then pick a move. Only moves you're actually inclined to try right now will appear — the number on each button is how much you want it (utility score from the social state). Build friendships and romance over ${ACT1_TURNS} school turns, then ${ACT2_TURNS} more at the prom.
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
    await startGame();
  } catch (err) {
    setStatus(`Failed to load: ${err.message}`, true);
    console.error(err);
  }
}

init();
