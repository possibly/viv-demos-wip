import { initializeVivRuntime, attemptAction, EntityType } from "../shared/viv-runtime.js";
import { initGame, ACTIONS, JORDAN, getRelationshipDisplay, checkOutcome } from "./sim.mjs";

const runtime = { initializeVivRuntime, attemptAction, EntityType };
let game = null;
let busy = false;

const statusEl      = document.getElementById("status");
const logEl         = document.getElementById("log");
const actionsEl     = document.getElementById("actions");
const jordanMoodEl  = document.getElementById("jordan-mood");
const vibeEl        = document.getElementById("vibe-label");
const sparkEl       = document.getElementById("spark-label");
const tensionEl     = document.getElementById("tension-label");
const goalFillEl    = document.getElementById("goal-fill");
const goalTextEl    = document.getElementById("goal-text");
const turnCountEl   = document.getElementById("turn-count");
const outcomeEl     = document.getElementById("outcome");

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.hidden = !msg;
  statusEl.className = "status" + (isError ? " error" : "");
}

function renderRelationship(display, turn) {
  jordanMoodEl.textContent = display.jordanMood;
  vibeEl.textContent       = display.vibe.label;
  sparkEl.textContent      = display.spark.label;
  tensionEl.textContent    = display.tension.label;
  turnCountEl.textContent  = `Turn ${turn}`;

  vibeEl.className    = `pill vibe-${display.vibe.tier}`;
  sparkEl.className   = `pill spark-${display.spark.tier}`;
  tensionEl.className = `pill tension-${display.tension.tier}`;

  const pct = Math.round(display.goalProgress);
  goalFillEl.style.width = pct + "%";

  const goalLabel =
    pct < 20 ? "Cold start" :
    pct < 40 ? "Making progress..." :
    pct < 60 ? "Something's there" :
    pct < 80 ? "Getting close..." :
               "Almost there!";
  goalTextEl.textContent = goalLabel;
}

function renderActions(availableActions) {
  actionsEl.innerHTML = "";
  for (const action of availableActions) {
    const btn = document.createElement("button");
    btn.className = "action-btn" + (action.available ? "" : " locked");
    btn.disabled  = !action.available || busy;

    btn.innerHTML = `
      <span class="action-label">${action.available ? "" : "🔒 "}${action.label}</span>
      <span class="action-desc">${action.desc}</span>
    `;

    if (action.available) {
      btn.addEventListener("click", () => handleAction(action.name));
    }
    actionsEl.appendChild(btn);
  }
}

function appendLogEntry(turn, playerText, jordanText, jordanReaction) {
  const entry = document.createElement("div");
  entry.className = "log-entry";

  const reactionClass =
    jordanReaction === "jordan-pulls-back"   ? "jordan-cold" :
    jordanReaction === "jordan-reciprocates" ? "jordan-warm"  :
    jordanReaction === "jordan-warms-up"     ? "jordan-warm"  : "";

  entry.innerHTML = `
    <div class="log-turn">Turn ${turn}</div>
    <div class="log-player">${playerText}</div>
    <div class="log-jordan ${reactionClass}">${jordanText}</div>
  `;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

function showOutcome(outcome) {
  outcomeEl.hidden = false;
  if (outcome === "win-date") {
    outcomeEl.className = "outcome win";
    outcomeEl.innerHTML = `
      <div class="outcome-icon">🌟</div>
      <div class="outcome-title">You did it!</div>
      <div class="outcome-body">Jordan agreed to go to prom with you. Somehow you pulled it off.</div>
      <button onclick="location.reload()">Play again</button>
    `;
  } else if (outcome === "win-friends") {
    outcomeEl.className = "outcome win-alt";
    outcomeEl.innerHTML = `
      <div class="outcome-icon">💛</div>
      <div class="outcome-title">Best friends.</div>
      <div class="outcome-body">It's not a date, but Jordan genuinely likes you. That's not nothing.</div>
      <button onclick="location.reload()">Play again</button>
    `;
  } else {
    outcomeEl.className = "outcome lose";
    outcomeEl.innerHTML = `
      <div class="outcome-icon">😶</div>
      <div class="outcome-title">Jordan's done.</div>
      <div class="outcome-body">You pushed too far, too fast. Jordan has gone cold. Maybe next year.</div>
      <button onclick="location.reload()">Try again</button>
    `;
  }
  actionsEl.innerHTML = "";
}

async function handleAction(actionName) {
  if (busy || !game) return;
  busy = true;
  renderActions([]);

  try {
    const { turn } = game.getState();
    const result = await game.takeTurn(actionName);
    appendLogEntry(turn + 1, result.narrative, result.jordanNarrative, result.jordanReaction);
    renderRelationship(result.display, turn + 1);

    if (result.outcome) {
      showOutcome(result.outcome);
    } else {
      renderActions(game.getAvailableActions());
    }
  } catch (err) {
    setStatus(`Error: ${err.message}`, true);
    console.error(err);
    renderActions(game.getAvailableActions());
  } finally {
    busy = false;
  }
}

async function start() {
  setStatus("Loading…");
  try {
    const bundle = await fetch("./bundle.json").then(r => r.json());
    game = initGame(runtime, bundle);
    const { display } = game.getState();
    renderRelationship(display, 0);
    renderActions(game.getAvailableActions());

    logEl.innerHTML = `<div class="log-intro">
      <strong>The scene:</strong> Third period is about to start. You're standing near the lockers.
      Jordan is a few feet away, not looking at you—yet.
      Your goal: ask them to prom. Good luck.
    </div>`;

    setStatus("");
  } catch (err) {
    setStatus(`Failed to load: ${err.message}`, true);
    console.error(err);
  }
}

start();
