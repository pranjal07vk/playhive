// A small per-socket budget so one client cannot flood the room.
// Drawing sends batched strokes, so it gets its own, larger bucket.
export function createEventLimiter({ perSecond = 12, drawPerSecond = 40 } = {}) {
  let windowStart = Date.now();
  let counts = { normal: 0, draw: 0 };
  return (kind) => {
    const now = Date.now();
    if (now - windowStart >= 1000) {
      windowStart = now;
      counts = { normal: 0, draw: 0 };
    }
    counts[kind] += 1;
    return counts[kind] <= (kind === 'draw' ? drawPerSecond : perSecond);
  };
}
