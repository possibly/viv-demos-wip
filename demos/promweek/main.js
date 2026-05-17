import { initializeVivRuntime, attemptAction, selectAction, EntityType } from "../../shared/viv-runtime.js";
import { initGame, SCENES } from "./sim.mjs";

const runtime = { initializeVivRuntime, attemptAction, selectAction, EntityType };
let bundle = null;
let game = null;
let busy = false;
let currentSceneKey = "pursuit";

const statusEl       = document.getElementById("status");
const logEl          = document.getElementById("log");
const actionsEl      = document.getElementById("actions");
const jordanMoodEl   = document.getElementById("jordan-mood");
const vibeEl         = document.getElementById("vibe-label");
const sparkEl        = document.getElementById("spark-label");
const tensionEl      = document.getElementById("tension-label");
const goalFillEl     = document.getElementById("goal-fill");
const goalTextEl     = document.getElementById("goal-text");
const turnCountEl    = document.getElementById("turn-count");
const outcomeEl      = document.getElementById("outcome");
const sceneLabelEl   = document.getElementById("scene-label");
const sceneSwitchEl  = document.getElementById("scene-switch");
const subtitleEl     = document.getElementById("subtitle");

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

  goalTextEl.textContent =
    pct < 20 ? "Cold start" :
    pct < 40 ? "Making progress..." :
    pct < 60 ? "Something's there" :
    pct < 80 ? "Getting close..." :
               "Almost there!";
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

function appendLogEntry({ turn, intentGloss, outcomeGloss, reactionGloss, reactionName }) {
  const entry = document.createElement("div");
  entry.className = "log-entry";

  const reactionClass =
    reactionName === "jordan-pulls-back"   ? "jordan-cold" :
    reactionName === "jordan-deflects"     ? "jordan-cold" :
    reactionName === "jordan-flusters"     ? "jordan-warm" :
    reactionName === "jordan-reciprocates" ? "jordan-warm" :
    reactionName === "jordan-warms-up"     ? "jordan-warm" :
    reactionName === "jordan-tests-alex"   ? "jordan-cool" :
                                             "";

  const outcomeBlock = outcomeGloss
    ? `<div class="log-outcome">${outcomeGloss}</div>`
    : "";

  entry.innerHTML = `
    <div class="log-turn">Turn ${turn}</div>
    <div class="log-player">${intentGloss}</div>
    ${outcomeBlock}
    <div class="log-jordan ${reactionClass}">${reactionGloss}</div>
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
      <button id="outcome-replay">Play this scene again</button>
      <button id="outcome-switch">Try the other scene</button>
    `;
  } else if (outcome === "win-friends") {
    outcomeEl.className = "outcome win-alt";
    outcomeEl.innerHTML = `
      <div class="outcome-icon">💛</div>
      <div class="outcome-title">Best friends.</div>
      <div class="outcome-body">Not a date, but Jordan genuinely likes you. That's not nothing.</div>
      <button id="outcome-replay">Play this scene again</button>
      <button id="outcome-switch">Try the other scene</button>
    `;
  } else {
    outcomeEl.className = "outcome lose";
    outcomeEl.innerHTML = `
      <div class="outcome-icon">😶</div>
      <div class="outcome-title">Jordan's done.</div>
      <div class="outcome-body">You pushed too far, too fast. Jordan has gone cold.</div>
      <button id="outcome-replay">Try this scene again</button>
      <button id="outcome-switch">Try the other scene</button>
    `;
  }
  document.getElementById("outcome-replay").addEventListener("click", () => startScene(currentSceneKey));
  document.getElementById("outcome-switch").addEventListener("click", () => startScene(otherSceneKey()));
  actionsEl.innerHTML = "";
}

function otherSceneKey() {
  return currentSceneKey === "pursuit" ? "guarded" : "pursuit";
}

function renderSceneHeader(scene) {
  sceneLabelEl.textContent = `${scene.label} · ${scene.difficulty}`;
  sceneLabelEl.className = `scene-label difficulty-${scene.difficulty}`;
  subtitleEl.textContent = scene.teaser;
  const other = SCENES[otherSceneKey()];
  sceneSwitchEl.textContent = `Switch to: ${other.label} (${other.difficulty})`;
}

async function handleAction(actionName) {
  if (busy || !game) return;
  busy = true;
  renderActions([]);

  try {
    const { turn } = game.getState();
    const result = await game.takeTurn(actionName);
    appendLogEntry({
      turn: turn + 1,
      intentGloss:   result.intent?.gloss   ?? "(no intent gloss)",
      outcomeGloss:  result.outcome?.gloss  ?? null,
      reactionGloss: result.jordanReaction?.gloss ?? "(no reaction)",
      reactionName:  result.jordanReaction?.name  ?? null,
    });
    renderRelationship(result.display, turn + 1);
    busy = false;
    if (result.gameOutcome) {
      showOutcome(result.gameOutcome);
    } else {
      renderActions(game.getAvailableActions());
    }
  } catch (err) {
    busy = false;
    setStatus(`Error: ${err.message}`, true);
    console.error(err);
    renderActions(game.getAvailableActions());
  }
}

async function startScene(sceneKey) {
  currentSceneKey = sceneKey;
  outcomeEl.hidden = true;
  logEl.innerHTML = "";
  setStatus("Loading…");

  try {
    game = initGame(runtime, bundle, sceneKey);
    const startInfo = await game.start();
    renderSceneHeader(startInfo.scene);
    renderRelationship(startInfo.display, 0);
    renderActions(game.getAvailableActions());

    logEl.innerHTML = `<div class="log-intro">
      <strong>${startInfo.scene.label}.</strong>
      ${startInfo.opening?.gloss ?? ""}
      <br><br>
      Your goal: ask Jordan to prom. Good luck.
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
    sceneSwitchEl.addEventListener("click", () => startScene(otherSceneKey()));
    await startScene("pursuit");
  } catch (err) {
    setStatus(`Failed to load: ${err.message}`, true);
    console.error(err);
  }
}

init();
