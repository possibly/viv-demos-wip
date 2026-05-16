import { createRequire } from 'module';
import { resolve } from 'path';
const require = createRequire(import.meta.url);
const root = new URL('../..', import.meta.url).pathname;
const { EntityType } = require(resolve(root, 'viv/runtimes/js/dist/index.cjs'));

export function buildInitialState() {
  const entities = {};
  entities['tavern'] = { entityType: EntityType.Location, id: 'tavern', name: 'The Tavern' };
  for (const [id, name] of [['alice', 'Alice'], ['bob', 'Bob'], ['carol', 'Carol']]) {
    entities[id] = { entityType: EntityType.Character, id, name, location: 'tavern', mood: 0, memories: {} };
  }
  return {
    timestamp: 0,
    entities,
    characters: ['alice', 'bob', 'carol'],
    locations: ['tavern'],
    items: [],
    actions: [],
    vivInternalState: null,
  };
}
