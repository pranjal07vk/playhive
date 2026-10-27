import { readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Every folder in games/ that has an index.js is a game. Adding a game means
// adding a folder; nothing else in the server needs to change.
const here = dirname(fileURLToPath(import.meta.url));
const games = new Map();

for (const entry of readdirSync(here, { withFileTypes: true })) {
  const file = join(here, entry.name, 'index.js');
  if (!entry.isDirectory() || entry.name === 'shared' || !existsSync(file)) continue;
  const { default: game } = await import(pathToFileURL(file).href);
  games.set(game.meta.id, game);
}

export const getGame = (id) => games.get(id);
export const listGames = () => [...games.values()].sort((a, b) => a.meta.order - b.meta.order);
