import { initializeVivRuntime, selectAction, EntityType } from "../../shared/viv-runtime.js";

// --- Seeded PRNG (mulberry32) ---
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return Math.abs(h) || 1;
}

function makeUUID(rng) {
  const b = Array.from({ length: 16 }, () => Math.floor(rng() * 256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return b.map((v, i) => ([4, 6, 8, 10].includes(i) ? "-" : "") + v.toString(16).padStart(2, "0")).join("");
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

// --- Vanilla WoW data ---

const RACES = {
  human:     { faction: "Alliance", names: { m: ["Anduin","Arthas","Varian","Marcus","Edwin","Roland","Gareth","Stormwind"], f: ["Jaina","Katrana","Tiffin","Elaine","Moira","Reyna","Lyssa","Celeste"] } },
  dwarf:     { faction: "Alliance", names: { m: ["Magni","Brann","Muradin","Thargas","Belgrom","Ironforge","Thane","Bolvar"], f: ["Moira","Dagran","Freja","Helga","Irmgard","Sigrid","Brynja","Astrid"] } },
  nightelf:  { faction: "Alliance", names: { m: ["Malfurion","Illidan","Tyrande","Cenarius","Jarod","Shandris","Naisha","Shadowmeld"], f: ["Tyrande","Shandris","Naisha","Ysera","Whisperwind","Moonwhisper","Starglade","Dawnsong"] } },
  gnome:     { faction: "Alliance", names: { m: ["Mekkatorque","Gelbin","Thermaplugg","Cogsworth","Tinkmaster","Fizzwidget","Sprocket","Zap"], f: ["Lissanna","Fizzy","Cogsworth","Tinker","Sprocket","Wrenchy","Bolty","Gizmo"] } },
  orc:       { faction: "Horde",    names: { m: ["Thrall","Grom","Durotan","Orgrim","Garrosh","Nazgrel","Kargath","Nazgrim"], f: ["Draka","Garona","Aggra","Rehgar","Lantresor","Mekthorg","Kor","Geyah"] } },
  undead:    { faction: "Horde",    names: { m: ["Sylvanas","Nathanos","Varimathras","Kel'Thuzad","Putress","Faranell","Bethor","Gunther"], f: ["Sylvanas","Alonsus","Leonid","Bethor","Calia","Alina","Velsa","Marsea"] } },
  tauren:    { faction: "Horde",    names: { m: ["Cairne","Baine","Hamuul","Magatha","Stormsong","Stonehoof","Thunderhorn","Windtotem"], f: ["Magatha","Aponi","Tahu","Sunwalker","Mistrunner","Cloudchaser","Earthmother","Stormhoof"] } },
  troll:     { faction: "Horde",    names: { m: ["Vol'jin","Rokhan","Zul'jin","Hexlord","Malacrass","Akali","Zanzil","Rastakhan"], f: ["Zekhan","Talanji","Voodoo","Hexla","Juju","Witcha","Zala","Saraka"] } },
};

const CLASS_DATA = {
  warrior:  { icon: "⚔️",  color: "#c79c38" },
  paladin:  { icon: "🛡️",  color: "#f58cba" },
  hunter:   { icon: "🏹",  color: "#abd473" },
  rogue:    { icon: "🗡️",  color: "#fff569" },
  priest:   { icon: "✨",  color: "#ffffff" },
  mage:     { icon: "🔮",  color: "#69ccf0" },
  warlock:  { icon: "💀",  color: "#9482c9" },
  druid:    { icon: "🌿",  color: "#ff7d0a" },
  shaman:   { icon: "⚡",  color: "#0070de" },
};

const RACE_CLASS = {
  human:    ["warrior","paladin","rogue","priest","mage","warlock"],
  dwarf:    ["warrior","paladin","hunter","rogue","priest"],
  nightelf: ["warrior","hunter","rogue","priest","druid"],
  gnome:    ["warrior","rogue","mage","warlock"],
  orc:      ["warrior","hunter","rogue","shaman","warlock"],
  undead:   ["warrior","rogue","priest","mage","warlock"],
  tauren:   ["warrior","hunter","shaman","druid"],
  troll:    ["warrior","hunter","rogue","priest","shaman"],
};

const RACE_LABELS = {
  human: "Human", dwarf: "Dwarf", nightelf: "Night Elf", gnome: "Gnome",
  orc: "Orc", undead: "Undead", tauren: "Tauren", troll: "Troll",
};

// --- Starter zone: Elwynn Forest with 5 subzones ---
const ZONES = [
  { id: "northshire",    name: "Northshire Valley",  desc: "A peaceful valley with a small abbey. The starting breath of adventure." },
  { id: "goldshire",     name: "Goldshire",           desc: "A bustling crossroads hamlet, the Lion's Pride Inn calling to weary travelers." },
  { id: "forest_edge",   name: "Forest's Edge",       desc: "The treeline thickens here; wolves and bandits lurk in the shadows." },
  { id: "stonefield",    name: "Stonefield Farm",     desc: "Rolling fields and weathered farmhouses, pigs rooting in the mud." },
  { id: "mirror_lake",   name: "Mirror Lake",         desc: "A glittering lake that reflects the sky. Defias lookouts watch from the reeds." },
];

function pickRandom(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function generateCharacter(rng) {
  const raceKey = pickRandom(rng, Object.keys(RACE_CLASS));
  const classKey = pickRandom(rng, RACE_CLASS[raceKey]);
  const gender = rng() < 0.5 ? "m" : "f";
  const name = pickRandom(rng, RACES[raceKey].names[gender]);
  return {
    id: "adventurer",
    entityType: EntityType.Character,
    name,
    race: raceKey,
    class: classKey,
    gender,
    faction: RACES[raceKey].faction,
    location: ZONES[0].id,
    memories: {},
  };
}

function buildInitialState(rng) {
  const entities = {};
  const locations = [];
  for (const z of ZONES) {
    entities[z.id] = { entityType: EntityType.Location, id: z.id, name: z.name, desc: z.desc };
    locations.push(z.id);
  }
  const character = generateCharacter(rng);
  entities[character.id] = character;
  return {
    timestamp: 0,
    entities,
    characters: [character.id],
    locations,
    items: [],
    actions: [],
    vivInternalState: null,
  };
}

let cachedBundle = null;

async function runSim(seedStr, tickCount) {
  const rng = mulberry32(hashSeed(seedStr));
  const state = buildInitialState(rng);

  const adapter = {
    provisionActionID: () => makeUUID(rng),
    rng,
    getEntityView: (id) => structuredClone(state.entities[id]),
    getEntityLabel: (id) => state.entities[id]?.name ?? id,
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
    saveCharacterMemory: (characterID, actionID, memory) => { state.entities[characterID].memories[actionID] = memory; },
    saveItemInscriptions: (itemID, inscriptions) => { state.entities[itemID].inscriptions = inscriptions; },
    debug: { validateAPICalls: true, watchlists: {} },
  };

  if (!cachedBundle) {
    cachedBundle = await fetch("./bundle.json").then((r) => r.json());
  }

  initializeVivRuntime({ contentBundle: cachedBundle, adapter });

  const ticks = [];
  const char = structuredClone(state.entities["adventurer"]);

  for (let t = 0; t < tickCount; t++) {
    const actionsBefore = new Set(state.actions);
    await selectAction({ initiatorID: "adventurer" });
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
      character: structuredClone(state.entities["adventurer"]),
    });
  }

  return { character: char, ticks };
}

// --- UI ---

let simData = null;
let currentTick = 0;

const statusEl = document.getElementById("status");
const simViewEl = document.getElementById("sim-view");
const tickLabelEl = document.getElementById("tick-label");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const btnRun = document.getElementById("btn-run");
const eventsEl = document.getElementById("events");
const seedInput = document.getElementById("seed-input");
const stepsInput = document.getElementById("steps-input");
const charCardEl = document.getElementById("char-card");
const zonemapEl = document.getElementById("zonemap");

function renderCharCard(char) {
  const cd = CLASS_DATA[char.class];
  const genderLabel = char.gender === "m" ? "Male" : "Female";
  const factionColor = char.faction === "Alliance" ? "#2a7dc9" : "#c42b2b";
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
        <span class="char-sep">·</span>
        <span>${genderLabel}</span>
      </div>
      <div class="char-faction" style="color:${factionColor}">${char.faction}</div>
    </div>`;
}

function renderZonemap(currentLocationID) {
  zonemapEl.innerHTML = "";
  for (const z of ZONES) {
    const el = document.createElement("div");
    el.className = "zone-node" + (z.id === currentLocationID ? " active" : "");
    el.innerHTML = `<span class="zone-name">${z.name}</span><span class="zone-desc">${z.desc}</span>`;
    zonemapEl.appendChild(el);
  }
}

function render() {
  const tick = simData.ticks[currentTick];
  tickLabelEl.textContent = `Tick ${currentTick + 1} / ${simData.ticks.length}`;
  btnPrev.disabled = currentTick === 0;
  btnNext.disabled = currentTick === simData.ticks.length - 1;

  renderZonemap(tick.character.location);

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
  const seedStr = seedInput.value.trim() || "azeroth";
  const tickCount = Math.min(500, Math.max(1, parseInt(stepsInput.value, 10) || 20));
  btnRun.disabled = true;
  setStatus(`entering the world…`);
  simViewEl.hidden = true;
  cachedBundle = null;
  try {
    simData = await runSim(seedStr, tickCount);
    currentTick = 0;
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

btnRun.addEventListener("click", runSimulation);
btnPrev.addEventListener("click", () => { if (currentTick > 0) { currentTick--; render(); } });
btnNext.addEventListener("click", () => { if (currentTick < simData.ticks.length - 1) { currentTick++; render(); } });
seedInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runSimulation(); });
stepsInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runSimulation(); });
