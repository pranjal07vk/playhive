// Display details for the marketing pages, so they render even before the
// API answers. Rules and settings always come from the server (/api/games).
export const GAME_CATALOG = [
  { id: 'truth-or-dare', name: 'Truth or Dare', tagline: 'Spill it or do it.', players: '3–12', glyph: '🎭', accent: 'gulal', vibe: 'Classic' },
  { id: 'would-you-rather', name: 'Would You Rather', tagline: 'Two choices. Zero easy answers.', players: '2–20', glyph: '⚖️', accent: 'peacock', vibe: 'Debate' },
  { id: 'never-have-i-ever', name: 'Never Have I Ever', tagline: 'Confess anonymously. Judge silently.', players: '3–15', glyph: '🙊', accent: 'marigold', vibe: 'Confession' },
  { id: 'two-truths-and-a-lie', name: 'Two Truths & a Lie', tagline: 'Someone is definitely lying.', players: '3–12', glyph: '🤥', accent: 'parrot', vibe: 'Bluff' },
  { id: 'heads-up', name: 'Heads Up', tagline: 'Everyone knows but you.', players: '3–12', glyph: '🙆', accent: 'gulal', vibe: 'Guessing' },
  { id: 'charades', name: 'Charades', tagline: 'No words. All drama.', players: '3–12', glyph: '🎬', accent: 'peacock', vibe: 'Acting' },
  { id: 'pictionary', name: 'Pictionary', tagline: 'Draw badly, guess wildly.', players: '3–12', glyph: '🖍️', accent: 'marigold', vibe: 'Drawing' },
  { id: 'mafia', name: 'Mafia', tagline: 'Trust no one after dark.', players: '6–12', glyph: '🕵️', accent: 'gulal', vibe: 'Deception' },
  { id: 'hot-seat', name: 'Hot Seat', tagline: 'How well do you really know them?', players: '3–12', glyph: '🔥', accent: 'marigold', vibe: 'Friendship' },
  { id: 'scavenger-hunt', name: 'Scavenger Hunt', tagline: 'Run, find, prove it.', players: '2–12', glyph: '🔎', accent: 'parrot', vibe: 'Hunt' },
  { id: 'spin-the-bottle', name: 'Spin the Bottle', tagline: 'Round and round it goes.', players: '3–12', glyph: '🍾', accent: 'peacock', vibe: 'Chance' },
  { id: 'uno', name: 'Colour Clash', tagline: 'The UNO-style card brawl.', players: '2–10', glyph: '🃏', accent: 'gulal', vibe: 'Cards' },
  { id: 'telephone', name: 'Telephone', tagline: 'What started as a cat ends as a car.', players: '4–12', glyph: '📞', accent: 'parrot', vibe: 'Chain' },
  { id: 'freeze-dance', name: 'Freeze Dance', tagline: 'Dance till the beat drops out.', players: '3–20', glyph: '🕺', accent: 'marigold', vibe: 'Movement' },
  { id: 'sardines', name: 'Sardines', tagline: 'Hide-and-seek, squeezed together.', players: '4–12', glyph: '🐟', accent: 'peacock', vibe: 'Physical' },
];

export const catalogEntry = (id) => GAME_CATALOG.find((g) => g.id === id) ?? { id, name: id, glyph: '🎲', accent: 'marigold' };
