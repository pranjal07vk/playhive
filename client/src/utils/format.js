export const AVATAR_COLORS = ['#FF9F00', '#E60067', '#00B4D8', '#38B000', '#FFC65C', '#FF4D94', '#7DD8EC', '#9BE36B', '#F2711C', '#B44CFF', '#FFE066', '#2EC4B6'];
export const AVATAR_GLYPHS = ['🪁', '🌼', '🦚', '🥭', '🪔', '🐘', '🌶️', '☕', '🎺', '🛺', '🍬', '🌙'];

export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export const inviteUrl = (code) => `${window.location.origin}/join/${code}`;

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
