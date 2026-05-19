import { initializeVivRuntime, selectAction, attemptAction, tickPlanner, EntityType } from "../../shared/viv-runtime.js";
import { runSim, CLASS_DATA, ZONES, ENEMY_TEMPLATES, ZONE_ENEMIES, LEVEL_XP_MIN, LEVEL_CAP, FACTIONS, RACE_LABELS, EQUIPMENT_SLOTS, SLOT_LABELS, QUEST_GIVER, ALL_QUEST_GIVERS, ALL_VENDORS, QUESTS, QUEST_ITEMS, copperToString, PLAYER_IDS } from "./sim.mjs";

const runtime = { initializeVivRuntime, selectAction, attemptAction, tickPlanner, EntityType };
let cachedBundle = null;

let simData = null;
let currentTick = 0;
let currentDisplayChars = null;
let modalCharId = null;

const statusEl    = document.getElementById("status");
const simViewEl   = document.getElementById("sim-view");
const tickLabelEl = document.getElementById("tick-label");
const btnPrev     = document.getElementById("btn-prev");
const btnNext     = document.getElementById("btn-next");
const btnJump     = document.getElementById("btn-jump");
const btnRun      = document.getElementById("btn-run");
const jumpModalEl = document.getElementById("jump-modal");
const jumpTickInput = document.getElementById("jump-tick-input");
const jumpErrorEl = document.getElementById("jump-error");
const btnJumpGo   = document.getElementById("btn-jump-go");
const eventsEl    = document.getElementById("events");
const seedInput   = document.getElementById("seed-input");
const stepsInput  = document.getElementById("steps-input");
const charCardsEl = document.getElementById("char-cards");
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

function questStatusText(char) {
  if (!char.questActive) return null;
  const quest = QUESTS.find(q => q.id === char.questId);
  if (!quest) return null;
  const done = char.questKillsDone ?? 0;
  const needed = char.questKillsNeeded ?? quest.targetCount;
  const questGiver = ALL_QUEST_GIVERS.find(qg => qg.id === quest.questGiverId) ?? QUEST_GIVER;
  let phase;
  if (!char.questEnemyFound) phase = "Scouting…";
  else if (done < needed) phase = `Slain: ${done} / ${needed}`;
  else if (quest.questItem && !char.questItemCollected) phase = `Collect: ${QUEST_ITEMS[quest.questItem]?.name ?? "quest item"}`;
  else if (char.partyActive) phase = `Waiting for party`;
  else if (!char.questReadyToComplete) phase = `Return to ${questGiver.name}`;
  else phase = "Ready to turn in!";
  return { name: quest.name, phase };
}

function partyTagHTML(char) {
  if (!char.partyActive) return "";
  const size = (char.partyMembers ?? []).length;
  const isLeader = char.partyLeaderId === char.id;
  return `<div class="char-party" title="${isLeader ? "Party leader" : "Party member"}">⚑ Party ${size}/5${isLeader ? " (leader)" : ""}</div>`;
}

function renderCharCard(char, isActiveTick) {
  const cd = CLASS_DATA[char.class];
  const level = char.level ?? 1;
  const xp = char.xp ?? 0;
  const nextXP = level < LEVEL_CAP ? LEVEL_XP_MIN[level] : null;
  const xpText = nextXP !== null ? `${xp} / ${nextXP} XP` : `${xp} XP (max)`;

  const qs = questStatusText(char);
  const questHTML = qs
    ? `<div class="char-quest"><span class="quest-name">${qs.name}</span><span class="quest-phase">${qs.phase}</span></div>`
    : "";

  const copper = char.copper ?? 0;
  const copperHTML = copper > 0
    ? `<div class="char-copper">&#x1F4B0; ${copperToString(copper)}</div>`
    : "";

  const el = document.createElement("div");
  el.className = "char-card";
  el.dataset.charId = char.id;
  el.innerHTML = `
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
      ${copperHTML}
      ${questHTML}
      ${partyTagHTML(char)}
    </div>`;
  return el;
}

function renderCharCards(charsByPid) {
  charCardsEl.innerHTML = "";
  for (const pid of PLAYER_IDS) {
    const char = charsByPid[pid];
    if (!char) continue;
    const card = renderCharCard(char);
    card.addEventListener("click", () => {
      modalCharId = pid;
      renderModal(charsByPid[pid]);
      charModalEl.hidden = false;
    });
    charCardsEl.appendChild(card);
  }
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

  const copper = char.copper ?? 0;
  const statsRows = [
    ["Class",   `<span style="color:${cd.color}">${className}</span>`],
    ["Race",    RACE_LABELS[char.race]],
    ["Gender",  genderLabel],
    ["Faction", `<span style="color:${factionColor}">${char.faction}</span>`],
    ["Level",   String(level)],
    ["XP",      xpText],
    ["Gold",    `<span style="color:#b89c5a">${copperToString(copper)}</span>`],
  ].map(([k, v]) => `<tr><td class="col-label">${k}</td><td>${v}</td></tr>`).join("");

  const equipRows = EQUIPMENT_SLOTS.map(slot => {
    const item  = char.equipment[slot];
    const label = SLOT_LABELS[slot];
    if (!item) return `<tr><td class="col-label col-muted">${label}</td><td class="col-muted">—</td><td class="col-power col-muted">—</td></tr>`;
    return `<tr><td class="col-label">${label}</td><td>${item.name}</td><td class="col-power">${item.powerLevel}</td></tr>`;
  }).join("");

  const inventory = char.inventory ?? [];
  const inventoryRows = inventory.length === 0
    ? `<tr><td colspan="2" class="col-muted" style="font-style:italic">No items yet</td></tr>`
    : inventory.map(item => `<tr><td>${item.name}</td><td class="col-power">${item.powerLevel}</td></tr>`).join("");
  const inventorySectionHTML = `
    <div class="modal-section">
      <div class="modal-section-title">Inventory</div>
      <table class="modal-table">
        <thead><tr><td class="col-head">Item</td><td class="col-power col-head">Power</td></tr></thead>
        <tbody>${inventoryRows}</tbody>
      </table>
    </div>`;

  const activeQuest = char.questActive ? QUESTS.find(q => q.id === char.questId) : null;
  const completedQuestNames = (char.completedQuests ?? []).map(id => QUESTS.find(q => q.id === id)?.name ?? id);

  const qs = questStatusText(char);
  const questSectionHTML = (activeQuest || completedQuestNames.length > 0) ? `
    <div class="modal-section">
      <div class="modal-section-title">Quests</div>
      <table class="modal-table"><tbody>
        ${activeQuest ? `<tr><td class="col-label">Active</td><td>${activeQuest.name}</td></tr>
          <tr><td class="col-label col-muted">Goal</td><td class="col-muted">${activeQuest.description}</td></tr>
          <tr><td class="col-label col-muted">Progress</td><td class="col-muted">${qs?.phase ?? ""}</td></tr>
          <tr><td class="col-label col-muted">Reward</td><td class="col-muted">${char.questXpReward ?? 0} XP</td></tr>` : ""}
        ${completedQuestNames.length > 0 ? `<tr><td class="col-label">Completed</td><td>${completedQuestNames.join(", ")}</td></tr>` : ""}
      </tbody></table>
    </div>` : "";

  const partySectionHTML = char.partyActive ? (() => {
    const members = (char.partyMembers ?? []).map(pid => {
      const m = currentDisplayChars?.[pid];
      return m ? `${m.name}${pid === char.partyLeaderId ? " (leader)" : ""}` : pid;
    }).join(", ");
    return `<div class="modal-section">
      <div class="modal-section-title">Party</div>
      <table class="modal-table"><tbody>
        <tr><td class="col-label">Members</td><td>${members}</td></tr>
        <tr><td class="col-label">Size</td><td>${(char.partyMembers ?? []).length} / 5</td></tr>
      </tbody></table>
    </div>`;
  })() : "";

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
    ${inventorySectionHTML}
    ${partySectionHTML}
    ${questSectionHTML}
    <div class="modal-section">
      <div class="modal-section-title">Known Factions</div>
      <table class="modal-table">${factionHead}<tbody>${factionRows}</tbody></table>
    </div>`;
}

function renderZonemap(charsByPid) {
  zonemapEl.innerHTML = "";
  // Merge all discoveries for the zonemap so the player can see everyone's progress.
  const mergedDiscoveries = {};
  for (const pid of Object.keys(charsByPid)) {
    const c = charsByPid[pid];
    for (const [zoneId, ids] of Object.entries(c.discoveredNPCs ?? {})) {
      if (!mergedDiscoveries[zoneId]) mergedDiscoveries[zoneId] = new Set();
      ids.forEach(id => mergedDiscoveries[zoneId].add(id));
    }
  }

  const charsByZone = {};
  for (const pid of PLAYER_IDS) {
    const c = charsByPid[pid];
    if (!c) continue;
    (charsByZone[c.location] ??= []).push(c);
  }

  for (const z of ZONES) {
    const el = document.createElement("div");
    const isDanger = !!ZONE_ENEMIES[z.id];
    const presentChars = charsByZone[z.id] ?? [];
    el.className = "zone-node" +
      (presentChars.length > 0 ? " active" : "") +
      (isDanger ? " danger" : "");

    const knownHere = [...(mergedDiscoveries[z.id] ?? [])];

    const discovered = knownHere
      .map(id => ENEMY_TEMPLATES[id])
      .filter(Boolean)
      .sort((a, b) => a.level - b.level);

    const enemyHTML = discovered.length > 0
      ? `<div class="zone-enemies">${discovered.map(e => `<span class="zone-enemy">${e.name} · Lv. ${e.level}</span>`).join("")}</div>`
      : "";

    const knownGivers = ALL_QUEST_GIVERS.filter(qg => qg.location === z.id && knownHere.includes(qg.id));
    const giverHTML = knownGivers.length > 0
      ? `<div class="zone-quest-giver">${knownGivers.map(qg => `<span class="zone-npc">&#x1F4DC; ${qg.name}</span>`).join("")}</div>`
      : "";

    const knownVendors = ALL_VENDORS.filter(v => v.location === z.id && knownHere.includes(v.id));
    const vendorHTML = knownVendors.length > 0
      ? `<div class="zone-vendor">${knownVendors.map(v => `<span class="zone-npc" style="color:#7eb8a8">&#x1F6D2; ${v.name}</span>`).join("")}</div>`
      : "";

    const presentHTML = presentChars.length > 0
      ? `<div class="zone-present">${presentChars.map(c => `<span class="zone-char" style="color:${CLASS_DATA[c.class].color}">${CLASS_DATA[c.class].icon} ${c.name}</span>`).join("")}</div>`
      : "";

    el.innerHTML = `<span class="zone-name">${z.name}</span><span class="zone-desc">${z.desc}</span>${presentHTML}${enemyHTML}${giverHTML}${vendorHTML}`;
    zonemapEl.appendChild(el);
  }
}

function render() {
  const tick = simData.ticks[currentTick];
  currentDisplayChars = tick.characters;

  tickLabelEl.textContent = `Tick ${currentTick + 1} / ${simData.ticks.length}`;
  btnPrev.disabled = currentTick === 0;
  btnNext.disabled = currentTick === simData.ticks.length - 1;

  renderCharCards(tick.characters);
  renderZonemap(tick.characters);
  if (!charModalEl.hidden && modalCharId && tick.characters[modalCharId]) {
    renderModal(tick.characters[modalCharId]);
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
      el.className = "event-entry" + (e.type ? " " + e.type : "");
      const whoChar = e.who ? tick.characters[e.who] : null;
      const whoLabel = whoChar
        ? `<span class="event-who" style="color:${CLASS_DATA[whoChar.class].color}">${whoChar.name}:</span> `
        : "";
      el.innerHTML = `${whoLabel}${e.text}`;
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
    currentDisplayChars = simData.characters;
    renderCharCards(simData.characters);
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

function openJumpModal() {
  jumpTickInput.value = String(currentTick + 1);
  jumpErrorEl.hidden = true;
  jumpModalEl.hidden = false;
  jumpTickInput.select();
}

function closeJumpModal() {
  jumpModalEl.hidden = true;
}

function commitJump() {
  const val = parseInt(jumpTickInput.value, 10);
  const max = simData.ticks.length;
  if (!Number.isInteger(val) || val < 1 || val > max) {
    jumpErrorEl.textContent = `Enter a number between 1 and ${max}.`;
    jumpErrorEl.hidden = false;
    return;
  }
  currentTick = val - 1;
  render();
  closeJumpModal();
}

document.getElementById("modal-backdrop").addEventListener("click", () => { charModalEl.hidden = true; modalCharId = null; });
document.getElementById("modal-close").addEventListener("click", () => { charModalEl.hidden = true; modalCharId = null; });
document.getElementById("jump-modal-backdrop").addEventListener("click", closeJumpModal);
document.getElementById("jump-modal-close").addEventListener("click", closeJumpModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!jumpModalEl.hidden) { closeJumpModal(); return; }
    if (!charModalEl.hidden) { charModalEl.hidden = true; modalCharId = null; }
  }
});

btnRun.addEventListener("click", runSimulation);
btnPrev.addEventListener("click", () => { if (currentTick > 0) { currentTick--; render(); } });
btnNext.addEventListener("click", () => { if (currentTick < simData.ticks.length - 1) { currentTick++; render(); } });
btnJump.addEventListener("click", openJumpModal);
btnJumpGo.addEventListener("click", commitJump);
jumpTickInput.addEventListener("keydown", (e) => { if (e.key === "Enter") commitJump(); });
seedInput.addEventListener("keydown",  (e) => { if (e.key === "Enter") runSimulation(); });
stepsInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runSimulation(); });
