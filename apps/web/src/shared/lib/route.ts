export function parsePositiveRouteId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;

  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function hasUnsafeReturnToCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (character === '\\' || codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

function hasUnsafeReturnToShape(value: string): boolean {
  let decoded = value;

  // URLSearchParams decodes once before this helper is called, but checking a
  // few additional layers prevents encoded backslashes, control characters,
  // and protocol-relative URLs from becoming dangerous after another decoder
  // (for example a proxy or router) processes the path.
  for (let depth = 0; depth < 8; depth += 1) {
    if (hasUnsafeReturnToCharacters(decoded) || decoded.startsWith('//')) return true;

    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return true;
    }

    if (next === decoded) return false;
    decoded = next;
  }

  return true;
}

export function safeInternalReturnTo(value: string | null | undefined, origin: string): string {
  if (!value || !value.startsWith('/') || hasUnsafeReturnToShape(value)) return '/';

  try {
    const base = new URL(origin);
    const destination = new URL(value, base);
    if (destination.origin !== base.origin) return '/';

    // Returning the original path keeps its query string, fragment, and safe
    // percent-encoding intact instead of silently rewriting navigation state.
    return value;
  } catch {
    return '/';
  }
}
