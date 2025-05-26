// Small normaliser utilities used by provider normalisers

export function toIsoDate(input) {
  if (!input && input !== 0) return null;
  try {
    const maybeNum = Number(input);
    const d = isNaN(maybeNum) ? new Date(input) : new Date(maybeNum);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch (e) {
    // swallow and return null
  }
  return null;
}

export default toIsoDate;
