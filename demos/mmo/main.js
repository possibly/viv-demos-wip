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

const RACES = {
  human:    { faction: "Covenant", names: { m: ["Gareth","Roland","Marcus","Edwin","Aldric","Brennan","Calder","Donovan"], f: ["Elaine","Lyssa","Celeste","Mira","Reyna","Arden","Brielle","Cayla"] } },
  dwarf:    { faction: "Covenant", names: { m: ["Thane","Belden","Grundar","Kordak","Torvin","Volgrin","Brundar","Aldric"], f: ["Helga","Sigrid","Freya","Astrid","Brynja","Ingrid","Vigdis","Dagmar"] } },
  elf:      { faction: "Covenant", names: { m: ["Faelyn","Sylvan","Aeron","Caelan","Miral","Thalion","Erevan","Caladorn"], f: ["Lyria","Aeris","Miriel","Senna","Sylara","Thalindra","Elowen","Caladwen"] } },
  gnome:    { faction: "Covenant", names: { m: ["Cogsworth","Fizzle","Sprocket","Tinkard","Boltz","Gadget","Widget","Crank"], f: ["Fizzy","Bolty","Gizmo","Twitch","Ratchet","Wrenchy","Clicky","Sparky"] } },
  orc:      { faction: "Vanguard", names: { m: ["Kragnok","Bloodtusk","Grimfang","Gorthar","Vorak","Thrak","Muzgash","Drakkul"], f: ["Dasha","Grona","Korra","Meksha","Vrasha","Gorla","Traka","Durga"] } },
  revenant: { faction: "Vanguard", names: { m: ["Valdris","Corvus","Ashgor","Grimton","Soulren","Morvane","Wraithek","Duskmore"], f: ["Velsa","Marsea","Ashlea","Corvina","Mournweave","Shadowveil","Duskara","Wraithia"] } },
  minotaur: { faction: "Vanguard", names: { m: ["Earthhorn","Stormhoof","Thunderstone","Boulderback","Wildhorn","Ironhide","Dustwalker","Stoneback"], f: ["Cloudchaser","Mistrunner","Sunwalker","Windsong","Skygazer","Meadowhoof","Dawnstep","Rainhoof"] } },
  troll:    { faction: "Vanguard", names: { m: ["Zekhan","Voodrix","Hexlord","Zanzil","Akali","Malacrass","Zaruka","Jixtar"], f: ["Zalaxa","Jixxa","Hexxa","Vuja","Mossi","Lixxa","Zanda","Trolla"] } },
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
  elf:      ["warrior","hunter","rogue","priest","druid"],
  gnome:    ["warrior","rogue","mage","warlock"],
  orc:      ["warrior","hunter","rogue","shaman","warlock"],
  revenant: ["warrior","rogue","priest","mage","warlock"],
  minotaur: ["warrior","hunter","shaman","druid"],
  troll:    ["warrior","hunter","rogue","priest","shaman"],
};

const RACE_LABELS = {
  human: "Human", dwarf: "Dwarf", elf: "Elf", gnome: "Gnome",
  orc: "Orc", revenant: "Revenant", minotaur: "Minotaur", troll: "Troll",
};

const ZONES = [
  { id: "hearthfield",  name: "Hearthfield",       desc: "A peaceful hillside settlement where new arrivals catch their first breath." },
  { id: "millhaven",    name: "Millhaven",          desc: "A busy crossroads hamlet; the Wayward Lantern inn draws travelers from across the realm." },
  { id: "briar_edge",   name: "The Briar's Edge",   desc: "The treeline thickens here; wolves and bandits lurk in the tangled undergrowth." },
  { id: "stonewick",    name: "Stonewick Farm",     desc: "Rolling fields and weathered farmhouses, goats grazing in the amber light." },
  { id: "stillwater",   name: "Stillwater Mere",    desc: "A glittering lake that mirrors the sky. Scouts watch from the reed banks." },
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
  const factionColor = char.faction === "Covenant" ? "#2a7dc9" : "#c42b2b";
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
  const seedStr = seedInput.value.trim() || "greenvale";
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
