import { useEffect, useState } from 'react';
import { useRoom } from './useRoom.js';

// Seconds left until a server deadline, corrected for clock drift between
// this device and the server so every player sees the same countdown.
export function useGameTimer(deadline) {
  const { serverNow } = useRoom();
  const compute = () => (deadline ? Math.max(0, Math.ceil((deadline - serverNow()) / 1000)) : null);
  const [left, setLeft] = useState(compute);

  useEffect(() => {
    setLeft(compute());
    if (!deadline) return undefined;
    const id = setInterval(() => setLeft(compute()), 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline]);

  return left;
}
