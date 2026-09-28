// Keep published links from the previous hash router working, including anchors.
export function legacyTarget(hash, base) {
  const match = hash.match(/^#\/(embedding|notation|requirements)(?:\/([^?]*))?$/);
  if (!match) return null;
  const url = new URL(`${match[1]}/`, base);
  if (match[2]) url.hash = match[2];
  return url.href;
}

if (typeof window !== 'undefined') {
  const target = legacyTarget(window.location.hash, new URL('../', import.meta.url));
  if (target) window.location.replace(target);
}
