import { initializeVivRuntime, selectAction, EntityType } from "../../shared/viv-runtime.js";
import { runSim } from "./sim.mjs";

const runtime = { initializeVivRuntime, selectAction, EntityType };
let cachedBundle = null;

let ticks = [];
let currentTick = 0;

const statusEl = document.getElementById("status");
const simViewEl = document.getElementById("sim-view");
const tickLabelEl = document.getElementById("tick-label");
const tickTimeEl = document.getElementById("tick-time");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const btnRun = document.getElementById("btn-run");
const charactersEl = document.getElementById("characters");
const eventsEl = document.getElementById("events");
const seedInput = document.getElementById("seed-input");
const stepsInput = document.getElementById("steps-input");

function render() {
  const tick = ticks[currentTick];
  tickLabelEl.textContent = `Tick ${currentTick + 1} / ${ticks.length}`;
  tickTimeEl.textContent = `T = ${tick.timestamp - 10} → ${tick.timestamp}`;
  btnPrev.disabled = currentTick === 0;
  btnNext.disabled = currentTick === ticks.length - 1;

  charactersEl.innerHTML = "";
  for (const char of tick.characters) {
    const card = document.createElement("div");
    card.className = "char-card";
    const pct = Math.min(100, Math.max(0, char.mood));
    card.innerHTML = `
      <span class="char-name">${char.name}</span>
      <span class="mood-bar-wrap">
        <span class="mood-bar"><span class="mood-fill" style="width:${pct}%"></span></span>
        <span class="mood-val ${char.mood > 0 ? "pos" : char.mood < 0 ? "neg" : ""}">${char.mood > 0 ? "+" : ""}${char.mood}</span>
      </span>`;
    charactersEl.appendChild(card);
  }

  eventsEl.innerHTML = "";
  if (tick.events.length === 0) {
    const el = document.createElement("div");
    el.className = "event-entry empty";
    el.textContent = "(no events this tick)";
    eventsEl.appendChild(el);
  } else {
    for (const e of tick.events) {
      const el = document.createElement("div");
      el.className = "event-entry";
      el.textContent = e;
      eventsEl.appendChild(el);
    }
  }
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.hidden = !msg;
  statusEl.className = "status" + (isError ? " error" : "");
}

async function runSimulation() {
  const seedStr = seedInput.value.trim() || "hello-world";
  const tickCount = Math.min(500, Math.max(1, parseInt(stepsInput.value, 10) || 100));
  btnRun.disabled = true;
  setStatus(`running ${tickCount} tick${tickCount === 1 ? "" : "s"}…`);
  simViewEl.hidden = true;
  try {
    if (!cachedBundle) cachedBundle = await fetch("./bundle.json").then((r) => r.json());
    ({ ticks } = await runSim(runtime, cachedBundle, seedStr, tickCount));
    currentTick = 0;
    simViewEl.hidden = false;
    render();
    setStatus("");
  } catch (err) {
    setStatus(`error: ${err.message}`, true);
    console.error(err);
  } finally {
    btnRun.disabled = false;
  }
}

btnRun.addEventListener("click", runSimulation);
btnPrev.addEventListener("click", () => { if (currentTick > 0) { currentTick--; render(); } });
btnNext.addEventListener("click", () => { if (currentTick < ticks.length - 1) { currentTick++; render(); } });
seedInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runSimulation(); });
stepsInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runSimulation(); });

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
    document.getElementById("tab-characters").hidden = btn.dataset.tab !== "characters";
    document.getElementById("tab-chronicle").hidden = btn.dataset.tab !== "chronicle";
  });
});
