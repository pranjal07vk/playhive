// Collapse whitespace and strip control characters from user text.
// React escapes output, so this is about tidiness and size limits, not HTML.
export function cleanText(raw, maxLength) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

// For comparing guesses: lowercase, letters and digits only.
export const normalizeGuess = (raw) =>
  cleanText(raw, 80).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
