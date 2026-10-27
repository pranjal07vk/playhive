import { lazy } from 'react';

/*
 * Each folder here named after a game id (e.g. ./pictionary/) can provide:
 *   View.jsx   the game stage while it is running   (required)
 *   Reveal.jsx extra content for the results screen  (optional)
 * Vite finds them automatically and loads each one only when needed.
 */
const toMap = (modules) =>
  Object.fromEntries(Object.entries(modules).map(([path, loader]) => [path.split('/')[1], lazy(loader)]));

const views = toMap(import.meta.glob('./*/View.jsx'));
const reveals = toMap(import.meta.glob('./*/Reveal.jsx'));

export const getGameView = (id) => views[id] ?? null;
export const getGameReveal = (id) => reveals[id] ?? null;
