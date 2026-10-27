// One pending deadline per room. Games put the deadline in their state;
// the engine asks this service to call back when it passes.
const timers = new Map();

export function schedule(roomCode, at, callback) {
  cancel(roomCode);
  const delay = Math.max(0, at - Date.now());
  const handle = setTimeout(() => {
    timers.delete(roomCode);
    callback();
  }, delay);
  handle.unref?.();
  timers.set(roomCode, handle);
}

export function cancel(roomCode) {
  clearTimeout(timers.get(roomCode));
  timers.delete(roomCode);
}
