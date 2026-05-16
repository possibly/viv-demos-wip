import { initializeVivRuntime, selectAction, attemptAction, tickPlanner, EntityType } from "../../shared/viv-runtime.js";
import { runSim } from "./sim.mjs";
import { readFileSync } from "fs";

const bundle = JSON.parse(readFileSync(new URL("./bundle.json", import.meta.url), "utf8"));
const runtime = { initializeVivRuntime, selectAction, attemptAction, tickPlanner, EntityType };

try {
  const { ticks } = await runSim(runtime, bundle, "greenvale", 15);
  for (const tick of ticks) {
    const c = tick.character;
    const qState = c.questActive ? `qKills:${c.questKillsDone}/${c.questKillsNeeded} found:${c.questEnemyFound} huntDone:${c.questHuntDone}` : "(no quest)";
    console.log(`\nTick ${tick.index + 1} [Lv${c.level} ${c.xp}XP] ${qState}`);
    for (const e of tick.events) console.log(`  [${e.type}] ${e.text}`);
  }
} catch (err) {
  console.error("ERROR:", err.message);
}
