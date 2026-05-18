import { initializeVivRuntime, selectAction, attemptAction, tickPlanner, EntityType } from "../../shared/viv-runtime.js";
import { runSim } from "./sim.mjs";
import { readFileSync } from "fs";

const bundle = JSON.parse(readFileSync(new URL("./bundle.json", import.meta.url), "utf8"));
const runtime = { initializeVivRuntime, selectAction, attemptAction, tickPlanner, EntityType };
const seed = process.argv[2] ?? "greenvale";
const ticks_n = parseInt(process.argv[3] ?? "15", 10);

try {
  const { characters, ticks } = await runSim(runtime, bundle, seed, ticks_n);
  console.log(`Seed: ${seed}, ${ticks_n} ticks`);
  for (const [pid, c] of Object.entries(characters)) console.log(`  ${pid}: ${c.name} (${c.class})`);
  for (const tick of ticks) {
    const a = tick.characters.adventurer;
    const b = tick.characters.adventurer2;
    const partyTag = a.partyActive ? ` PARTY[${(a.partyMembers ?? []).length}]` : "";
    console.log(`\nTick ${tick.index + 1}  ${a.name}@${a.location} L${a.level} Q${a.questKillsDone ?? "-"}/${a.questKillsNeeded ?? "-"} | ${b.name}@${b.location} L${b.level} Q${b.questKillsDone ?? "-"}/${b.questKillsNeeded ?? "-"}${partyTag}`);
    for (const e of tick.events) console.log(`  [${e.who}] [${e.type}] ${e.text}`);
  }
} catch (err) {
  console.error("ERROR:", err.message, err.stack);
}
