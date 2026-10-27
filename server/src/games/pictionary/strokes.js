import { fail } from '../baseGame.js';

/*
 * The drawing protocol shared by Pictionary and Telephone.
 *
 * Coordinates are normalised to the canvas: x and y are 0..1 (0,0 is the
 * top-left corner) and are rounded to 3 decimals. Clients must clamp points
 * to the canvas; anything outside 0..1 is rejected.
 *
 * stroke = {
 *   id:     string, 1–24 chars of [A-Za-z0-9_-], unique within a drawing
 *   color:  one of PALETTE
 *   size:   2..40, the brush width in px on a 1000-px-wide canvas
 *           (so on a 500-px canvas draw it at size / 2), rounded to an integer
 *   tool:   'pen' | 'eraser' (an eraser stroke paints the background colour)
 *   points: [[x, y], ...], 1..200 points per message
 * }
 *
 * While drawing live, a client sends a long stroke as several segments with
 * the same id; the server appends each segment's points to the stored stroke
 * and relays only the new segment, so other clients append by id too.
 * The first segment decides the stroke's colour, size and tool.
 */
export const PALETTE = [
  '#1f1f1f', // ink
  '#ffffff', // white
  '#e53935', // red
  '#fb8c00', // orange
  '#fdd835', // yellow
  '#43a047', // green
  '#1e88e5', // blue
  '#8e24aa', // purple
  '#ec407a', // pink
  '#6d4c41', // brown
];
export const TOOLS = ['pen', 'eraser'];
export const MIN_SIZE = 2;
export const MAX_SIZE = 40;
export const MAX_POINTS_PER_MESSAGE = 200;
const STROKE_ID = /^[A-Za-z0-9_-]{1,24}$/;

const round3 = (n) => Math.round(n * 1000) / 1000;
const isUnit = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;

// Returns a clean copy of a stroke or throws INVALID_STROKE.
export function validateStroke(raw, { maxPoints = MAX_POINTS_PER_MESSAGE } = {}) {
  const bad = (why) => fail('INVALID_STROKE', `That stroke could not be drawn (${why}).`);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) bad('missing stroke');
  if (typeof raw.id !== 'string' || !STROKE_ID.test(raw.id)) bad('bad id');
  if (!PALETTE.includes(raw.color)) bad('colour not in the palette');
  if (typeof raw.size !== 'number' || !Number.isFinite(raw.size) || raw.size < MIN_SIZE || raw.size > MAX_SIZE) bad('bad brush size');
  if (!TOOLS.includes(raw.tool)) bad('unknown tool');
  if (!Array.isArray(raw.points) || raw.points.length === 0) bad('no points');
  if (raw.points.length > maxPoints) bad('too many points in one go');
  const points = raw.points.map((p) => {
    if (!Array.isArray(p) || p.length !== 2 || !isUnit(p[0]) || !isUnit(p[1])) bad('point off the canvas');
    return [round3(p[0]), round3(p[1])];
  });
  return { id: raw.id, color: raw.color, size: Math.round(raw.size), tool: raw.tool, points };
}

// A drawing is { strokes: [stroke], points: total stored points }.
export const emptyDrawing = () => ({ strokes: [], points: 0 });

// Adds one live segment to a drawing. Returns the clean segment to relay.
export function addSegment(drawing, rawStroke, maxTotalPoints) {
  const segment = validateStroke(rawStroke);
  if (drawing.points + segment.points.length > maxTotalPoints) {
    fail('DRAWING_FULL', 'The canvas is full! Clear or undo something first.');
  }
  const existing = drawing.strokes.find((s) => s.id === segment.id);
  if (existing) existing.points.push(...segment.points);
  else drawing.strokes.push(segment);
  drawing.points += segment.points.length;
  // Relay with the stroke's own style so a client that missed the first segment still draws it right.
  return existing ? { ...segment, color: existing.color, size: existing.size, tool: existing.tool } : segment;
}

// Removes the most recent stroke. Returns its id, or null if the canvas was empty.
export function undoLast(drawing) {
  const last = drawing.strokes.pop();
  if (!last) return null;
  drawing.points -= last.points.length;
  return last.id;
}

export function clearDrawing(drawing) {
  drawing.strokes = [];
  drawing.points = 0;
}

// Validates a whole drawing sent in one go (Telephone). Strokes may be longer
// than one live message, but the total is capped.
export function validateDrawing(rawStrokes, { maxTotalPoints, maxStrokes = 400, maxPointsPerStroke = 1000 }) {
  if (!Array.isArray(rawStrokes)) fail('INVALID_STROKE', 'That drawing could not be read.');
  if (rawStrokes.length > maxStrokes) fail('DRAWING_FULL', 'That drawing has too many strokes.');
  const drawing = emptyDrawing();
  const ids = new Set();
  for (const raw of rawStrokes) {
    const stroke = validateStroke(raw, { maxPoints: maxPointsPerStroke });
    if (ids.has(stroke.id)) fail('INVALID_STROKE', 'That drawing has two strokes with the same id.');
    ids.add(stroke.id);
    drawing.points += stroke.points.length;
    if (drawing.points > maxTotalPoints) fail('DRAWING_FULL', 'That drawing is too detailed to send. Try fewer scribbles!');
    drawing.strokes.push(stroke);
  }
  return drawing.strokes;
}
