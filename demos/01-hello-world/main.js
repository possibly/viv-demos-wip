import { initializeVivRuntime, selectAction, EntityType } from "../../shared/viv-runtime.js";

// Seeded PRNG (mulberry32)
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Deterministic UUID from seeded PRNG
function makeUUID(rng) {
  const b = Array.from({ length: 16 }, () => Math.floor(rng() * 256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return b.map((v, i) => ([4, 6, 8, 10].includes(i) ? "-" : "") + v.toString(16).padStart(2, "0")).join("");
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return Math.abs(h) || 1;
}

const setIn = (obj, path, value) => {
  const parts = Array.isArray(path) ? path : String(path).split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
};

function buildInitialState() {
  const entities = {};
  const locationID = "tavern";
  entities[locationID] = { entityType: EntityType.Location, id: locationID, name: "The Tavern" };
  const characters = ["alice", "bob", "carol"];
  for (const [id, name] of [["alice", "Alice"], ["bob", "Bob"], ["carol", "Carol"]]) {
    entities[id] = { entityType: EntityType.Character, id, name, location: locationID, mood: 0, memories: {} };
  }
  return { timestamp: 0, entities, characters, locations: [locationID], items: [], actions: [], vivInternalState: null };
}

let cachedBundle = null;

async function runSim(seedStr, tickCount) {
  const rng = mulberry32(hashSeed(seedStr));

  const state = buildInitialState();

  const adapter = {
    provisionActionID: () => makeUUID(rng),
    rng,
    getEntityView: (id) => structuredClone(state.entities[id]),
    getEntityLabel: (id) => state.entities[id].name,
    updateEntityProperty: (id, path, value) => setIn(state.entities[id], path, value),
    saveActionData: (id, data) => {
      if (state.entities[id] === undefined) state.actions.push(id);
      state.entities[id] = data;
    },
    getCurrentTimestamp: () => state.timestamp,
    getEntityIDs: (type, locationID) => {
      if (locationID) {
        if (type === EntityType.Character) return state.characters.filter((id) => state.entities[id].location === locationID);
        if (type === EntityType.Item) return state.items.filter((id) => state.entities[id].location === locationID);
        throw new Error(`invalid type for location query: ${type}`);
      }
      switch (type) {
        case EntityType.Character: return [...state.characters];
        case EntityType.Item: return [...state.items];
        case EntityType.Location: return [...state.locations];
        case EntityType.Action: return [...state.actions];
        default: throw new Error(`invalid entity type: ${type}`);
      }
    },
    getVivInternalState: () => structuredClone(state.vivInternalState),
    saveVivInternalState: (s) => { state.vivInternalState = structuredClone(s); },
    saveCharacterMemory: (characterID, actionID, memory) => {
      state.entities[characterID].memories[actionID] = memory;
    },
    saveItemInscriptions: (itemID, inscriptions) => {
      state.entities[itemID].inscriptions = inscriptions;
    },
    debug: { validateAPICalls: true, watchlists: {} },
  };

  if (!cachedBundle) {
    cachedBundle = await fetch("./bundle.json").then((r) => r.json());
  }

  initializeVivRuntime({ contentBundle: cachedBundle, adapter });

  const ticks = [];
  for (let t = 0; t < tickCount; t++) {
    const actionsBefore = new Set(state.actions);
    for (const cid of state.characters) {
      await selectAction({ initiatorID: cid });
    }
    state.timestamp += 10;

    const newActionIDs = state.actions.filter((id) => !actionsBefore.has(id));
    const events = newActionIDs.map((id) => {
      const a = state.entities[id];
      return a.report ?? a.gloss ?? "(action)";
    });

    ticks.push({
      index: t,
      timestamp: state.timestamp,
      events,
      characters: state.characters.map((id) => structuredClone(state.entities[id])),
    });
  }

  return ticks;
}

// --- UI ---

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

  // Characters
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

  // Events
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
    ticks = await runSim(seedStr, tickCount);
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

// Tab switching
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
    document.getElementById("tab-characters").hidden = btn.dataset.tab !== "characters";
    document.getElementById("tab-chronicle").hidden = btn.dataset.tab !== "chronicle";
  });
});
