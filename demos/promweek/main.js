import { initializeVivRuntime, attemptAction, selectAction, EntityType } from "../../shared/viv-runtime.js";
import { initGame, INTENTS, CHARACTER_DEFS, ITEM_DEFS, ACT1_TURNS, ACT2_TURNS } from "./sim.mjs";

const runtime = { initializeVivRuntime, attemptAction, selectAction, EntityType };
let bundle = null;
let game = null;
let busy = false;
let pendingTarget = null;
let pendingIntent = null;
let lastActSeen = 1;

const statusEl     = document.getElementById("status");
const logEl        = document.getElementById("log");
const castGridEl   = document.getElementById("cast-grid");
const targetRowEl  = document.getElementById("target-row");
const intentRowEl  = document.getElementById("intent-row");
const commitBtnEl  = document.getElementById("commit-btn");
const turnCountEl  = document.getElementById("turn-count");
const outcomeEl    = document.getElementById("outcome");
const actLabelEl   = document.getElementById("act-label");
const subtitleEl   = document.getElementById("subtitle");
const actionHintEl = document.getElementById("action-hint");
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
    const card = document.createElement("div");
    card.className = "cast-card" + (pendingTarget === c.id ? " selected" : "");
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

function renderTargets() {
  targetRowEl.innerHTML = "";
  const state = game.getState();
  for (const c of state.characters) {
    const snap = game.getSnapshot(c.id);
    const btn = document.createElement("button");
    btn.className = "target-btn" + (pendingTarget === c.id ? " selected" : "");
    btn.innerHTML = `
      <span class="t-portrait">${c.portrait}</span>
      <span class="t-name">${c.name}</span>
      <span class="t-vibe">b${snap.focusBuddy} r${snap.focusRomance}${snap.focusTension > 0 ? ` t${snap.focusTension}` : ""}</span>
    `;
    btn.disabled = busy;
    btn.addEventListener("click", () => {
      pendingTarget = c.id;
      renderTargets();
      renderCast(state);
      updateHint();
    });
    targetRowEl.appendChild(btn);
  }
}

function renderIntents() {
  intentRowEl.innerHTML = "";
  for (const [key, def] of Object.entries(INTENTS)) {
    const btn = document.createElement("button");
    btn.className = `intent-btn intent-${key}` + (pendingIntent === key ? " selected" : "");
    btn.innerHTML = `
      <span class="i-label">${def.label}</span>
      <span class="i-desc">${def.desc}</span>
    `;
    btn.disabled = busy;
    btn.addEventListener("click", () => {
      pendingIntent = key;
      renderIntents();
      updateHint();
    });
    intentRowEl.appendChild(btn);
  }
}

function updateHint() {
  if (!pendingTarget && !pendingIntent) {
    actionHintEl.textContent = "Pick a target, then an intent";
  } else if (pendingTarget && !pendingIntent) {
    const def = CHARACTER_DEFS[pendingTarget];
    actionHintEl.textContent = `Toward ${def.name} — now pick an intent`;
  } else if (!pendingTarget && pendingIntent) {
    actionHintEl.textContent = `${INTENTS[pendingIntent].label} — pick a target`;
  } else {
    const def = CHARACTER_DEFS[pendingTarget];
    actionHintEl.textContent = `${INTENTS[pendingIntent].label} toward ${def.name}`;
  }
  commitBtnEl.disabled = !pendingTarget || !pendingIntent || busy;
}

function appendLogEntry({ turn, intentKey, intentGloss, exchangeGloss, responseGloss, triggers, actNumber }) {
  if (actNumber > lastActSeen) {
    const banner = document.createElement("div");
    banner.className = "log-act-banner";
    banner.textContent = `Act ${actNumber} · prom night begins`;
    logEl.appendChild(banner);
    lastActSeen = actNumber;
  }

  const entry = document.createElement("div");
  entry.className = "log-entry intent-" + intentKey;

  let html = `
    <div class="log-turn">Turn ${turn} · ${INTENTS[intentKey].label}</div>
    <div class="log-player">${intentGloss}</div>
  `;
  if (exchangeGloss && exchangeGloss !== intentGloss) {
    html += `<div class="log-exchange">${exchangeGloss}</div>`;
  }
  if (responseGloss) {
    html += `<div class="log-response">${responseGloss}</div>`;
  }
  for (const t of triggers ?? []) {
    html += `<div class="log-trigger">→ ${t.gloss}</div>`;
  }
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

async function handleCommit() {
  if (busy || !game || !pendingTarget || !pendingIntent) return;
  busy = true;
  commitBtnEl.disabled = true;
  setStatus("Thinking…");

  try {
    const beforeState = game.getState();
    const result = await game.takeTurn(pendingTarget, pendingIntent);

    appendLogEntry({
      turn:          beforeState.turn + 1,
      intentKey:     pendingIntent,
      intentGloss:   result.intent?.gloss   ?? "(no gloss)",
      exchangeGloss: result.exchange?.gloss ?? null,
      responseGloss: result.response?.gloss ?? null,
      triggers:      result.triggers ?? [],
      actNumber:     result.actNumber,
    });

    pendingTarget = null;
    pendingIntent = null;
    busy = false;
    setStatus("");

    const state = game.getState();
    renderActHeader(state.actNumber, state.turn);
    renderCast(state);
    renderAlexStatuses(state);
    renderTargets();
    renderIntents();
    updateHint();

    if (result.outcome) {
      showOutcome(result.outcome);
    }
  } catch (err) {
    busy = false;
    setStatus(`Error: ${err.message}`, true);
    console.error(err);
    updateHint();
  }
}

async function startGame() {
  outcomeEl.hidden = true;
  logEl.innerHTML = "";
  pendingTarget = null;
  pendingIntent = null;
  lastActSeen = 1;
  setStatus("Loading…");

  try {
    game = initGame(runtime, bundle);
    const startInfo = await game.start();
    const state = game.getState();
    renderActHeader(state.actNumber, state.turn);
    renderCast(state);
    renderAlexStatuses(state);
    renderTargets();
    renderIntents();
    updateHint();

    logEl.innerHTML = `<div class="log-intro">
      <strong>${startInfo.opening?.gloss ?? "The week before prom."}</strong>
      <br><br>
      Goal: end prom night with someone — date, friend, anyone. Pick a target, pick an intent (warm, romantic, bold, mend), and Viv will pick the exchange that fits your social state. ${ACT1_TURNS} turns at school, then ${ACT2_TURNS} at the prom.
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
    commitBtnEl.addEventListener("click", handleCommit);
    await startGame();
  } catch (err) {
    setStatus(`Failed to load: ${err.message}`, true);
    console.error(err);
  }
}

init();
