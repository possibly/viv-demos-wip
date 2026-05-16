import { initializeVivRuntime, selectAction, attemptAction, EntityType } from "../../shared/viv-runtime.js";
import { runSim, CLASS_DATA, ZONES, ENEMY_TEMPLATES, ZONE_ENEMIES, LEVEL_XP_MIN, LEVEL_CAP, FACTIONS, RACE_LABELS, EQUIPMENT_SLOTS, SLOT_LABELS } from "./sim.mjs";

const runtime = { initializeVivRuntime, selectAction, attemptAction, EntityType };
let cachedBundle = null;

let simData = null;
let currentTick = 0;
let currentDisplayChar = null;

const statusEl    = document.getElementById("status");
const simViewEl   = document.getElementById("sim-view");
const tickLabelEl = document.getElementById("tick-label");
const btnPrev     = document.getElementById("btn-prev");
const btnNext     = document.getElementById("btn-next");
const btnRun      = document.getElementById("btn-run");
const eventsEl    = document.getElementById("events");
const seedInput   = document.getElementById("seed-input");
const stepsInput  = document.getElementById("steps-input");
const charCardEl  = document.getElementById("char-card");
const zonemapEl   = document.getElementById("zonemap");
const charModalEl = document.getElementById("char-modal");
const modalBodyEl = document.getElementById("modal-body");

function factionStanding(rep) {
  if (rep <= 10)  return { label: "Hostile",    cls: "standing-hostile" };
  if (rep <= 25)  return { label: "Unfriendly", cls: "standing-unfriendly" };
  if (rep <= 60)  return { label: "Neutral",    cls: "standing-neutral" };
  if (rep <= 80)  return { label: "Friendly",   cls: "standing-friendly" };
  return            { label: "Honored",     cls: "standing-honored" };
}

function renderCharCard(char) {
  const cd = CLASS_DATA[char.class];
  const level = char.level ?? 1;
  const xp = char.xp ?? 0;
  const nextXP = level < LEVEL_CAP ? LEVEL_XP_MIN[level] : null;
  const xpText = nextXP !== null ? `${xp} / ${nextXP} XP` : `${xp} XP (max)`;

  charCardEl.innerHTML = `
    <div class="char-portrait" style="border-color: ${cd.color}">
      <span class="char-icon">${cd.icon}</span>
    </div>
    <div class="char-info">
      <div class="char-name">${char.name}</div>
      <div class="char-details">
        <span class="char-class" style="color:${cd.color}">${char.class.charAt(0).toUpperCase() + char.class.slice(1)}</span>
        <span class="char-sep">·</span>
        <span>${RACE_LABELS[char.race]}</span>
      </div>
      <div class="char-level">Level ${level} · ${xpText}</div>
    </div>`;
}

function renderModal(char) {
  const cd = CLASS_DATA[char.class];
  const factionColor = char.faction === "Covenant" ? "#2a7dc9" : "#c42b2b";
  const genderLabel  = char.gender === "m" ? "Male" : "Female";
  const level = char.level ?? 1;
  const xp    = char.xp ?? 0;
  const nextXP = level < LEVEL_CAP ? LEVEL_XP_MIN[level] : null;
  const xpText = nextXP !== null ? `${xp} / ${nextXP}` : `${xp} (max)`;
  const className = char.class.charAt(0).toUpperCase() + char.class.slice(1);

  const statsRows = [
    ["Class",   `<span style="color:${cd.color}">${className}</span>`],
    ["Race",    RACE_LABELS[char.race]],
    ["Gender",  genderLabel],
    ["Faction", `<span style="color:${factionColor}">${char.faction}</span>`],
    ["Level",   String(level)],
    ["XP",      xpText],
  ].map(([k, v]) => `<tr><td class="col-label">${k}</td><td>${v}</td></tr>`).join("");

  const equipRows = EQUIPMENT_SLOTS.map(slot => {
    const item  = char.equipment[slot];
    const label = SLOT_LABELS[slot];
    if (!item) return `<tr><td class="col-label col-muted">${label}</td><td class="col-muted">—</td><td class="col-power col-muted">—</td></tr>`;
    return `<tr><td class="col-label">${label}</td><td>${item.name}</td><td class="col-power">${item.powerLevel}</td></tr>`;
  }).join("");

  const knownFactions = Object.entries(char.factionRelationships ?? {});
  const factionRows = knownFactions.length === 0
    ? `<tr><td colspan="3" class="col-muted" style="font-style:italic">None discovered yet</td></tr>`
    : knownFactions.map(([factionId, rep]) => {
        const name = FACTIONS[factionId]?.name ?? factionId;
        const { label, cls } = factionStanding(rep);
        return `<tr><td class="col-label">${name}</td><td class="${cls}">${label}</td><td class="col-power ${cls}">${rep}</td></tr>`;
      }).join("");

  const factionHead = knownFactions.length > 0
    ? `<thead><tr><td class="col-label col-head">Faction</td><td class="col-head">Standing</td><td class="col-power col-head">Rep</td></tr></thead>`
    : "";

  modalBodyEl.innerHTML = `
    <div class="modal-char-header">
      <div class="char-portrait" style="border-color:${cd.color}; width:48px; height:48px">
        <span class="char-icon" style="font-size:1.4rem">${cd.icon}</span>
      </div>
      <div>
        <div class="char-name">${char.name}</div>
        <div class="modal-char-sub">Level ${level} <span style="color:${cd.color}">${className}</span></div>
      </div>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Character</div>
      <table class="modal-table"><tbody>${statsRows}</tbody></table>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Equipment</div>
      <table class="modal-table">
        <thead><tr><td class="col-label col-head">Slot</td><td class="col-head">Item</td><td class="col-power col-head">Power</td></tr></thead>
        <tbody>${equipRows}</tbody>
      </table>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Known Factions</div>
      <table class="modal-table">${factionHead}<tbody>${factionRows}</tbody></table>
    </div>`;
}

function renderZonemap(currentLocationID, discoveredEnemies) {
  zonemapEl.innerHTML = "";
  for (const z of ZONES) {
    const el = document.createElement("div");
    const isDanger = !!ZONE_ENEMIES[z.id];
    el.className = "zone-node" +
      (z.id === currentLocationID ? " active" : "") +
      (isDanger ? " danger" : "");

    const discovered = (discoveredEnemies?.[z.id] ?? [])
      .map(id => ENEMY_TEMPLATES[id])
      .filter(Boolean)
      .sort((a, b) => a.level - b.level);

    const enemyHTML = discovered.length > 0
      ? `<div class="zone-enemies">${discovered.map(e => `<span class="zone-enemy">${e.name} · Lv. ${e.level}</span>`).join("")}</div>`
      : "";

    el.innerHTML = `<span class="zone-name">${z.name}</span><span class="zone-desc">${z.desc}</span>${enemyHTML}`;
    zonemapEl.appendChild(el);
  }
}

function render() {
  const tick = simData.ticks[currentTick];
  currentDisplayChar = tick.character;

  tickLabelEl.textContent = `Tick ${currentTick + 1} / ${simData.ticks.length}`;
  btnPrev.disabled = currentTick === 0;
  btnNext.disabled = currentTick === simData.ticks.length - 1;

  renderCharCard(tick.character);
  renderZonemap(tick.character.location, tick.character.discoveredEnemies);
  if (!charModalEl.hidden) renderModal(tick.character);

  eventsEl.innerHTML = "";
  if (tick.events.length === 0) {
    const el = document.createElement("div");
    el.className = "event-entry empty";
    el.textContent = "(no events this tick)";
    eventsEl.appendChild(el);
  } else {
    for (const e of tick.events) {
      const el = document.createElement("div");
      el.className = "event-entry" + (e.type ? " " + e.type : "");
      el.textContent = e.text;
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
  const seedStr   = seedInput.value.trim() || "greenvale";
  const tickCount = Math.min(500, Math.max(1, parseInt(stepsInput.value, 10) || 20));
  btnRun.disabled = true;
  setStatus(`entering the world…`);
  simViewEl.hidden = true;
  charModalEl.hidden = true;
  cachedBundle = null;
  try {
    if (!cachedBundle) cachedBundle = await fetch("./bundle.json").then((r) => r.json());
    simData = await runSim(runtime, cachedBundle, seedStr, tickCount);
    currentTick = 0;
    currentDisplayChar = simData.character;
    renderCharCard(simData.character);
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

charCardEl.addEventListener("click", () => {
  if (!currentDisplayChar) return;
  renderModal(currentDisplayChar);
  charModalEl.hidden = false;
});

document.getElementById("modal-backdrop").addEventListener("click", () => { charModalEl.hidden = true; });
document.getElementById("modal-close").addEventListener("click", () => { charModalEl.hidden = true; });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !charModalEl.hidden) charModalEl.hidden = true; });

btnRun.addEventListener("click", runSimulation);
btnPrev.addEventListener("click", () => { if (currentTick > 0) { currentTick--; render(); } });
btnNext.addEventListener("click", () => { if (currentTick < simData.ticks.length - 1) { currentTick++; render(); } });
seedInput.addEventListener("keydown",  (e) => { if (e.key === "Enter") runSimulation(); });
stepsInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runSimulation(); });
