const NAMED_ENTITIES = Object.freeze({
  amp: '&',
  apos: "'",
  bull: '•',
  gt: '>',
  hellip: '…',
  ldquo: '“',
  lsquo: '‘',
  lt: '<',
  mdash: '—',
  middot: '·',
  nbsp: ' ',
  ndash: '–',
  quot: '"',
  rdquo: '”',
  rsquo: '’',
});

function codePointOrOriginal(match, value, radix) {
  const codePoint = Number.parseInt(value, radix);
  if (
    !Number.isInteger(codePoint) ||
    codePoint < 0 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    return match;
  }
  return String.fromCodePoint(codePoint);
}

function decodeHtmlEntities(value) {
  let decoded = String(value ?? '');
  for (let pass = 0; pass < 3; pass += 1) {
    const next = decoded
      .replace(/&#x([0-9a-f]{1,6});?/gi, (match, hex) => codePointOrOriginal(match, hex, 16))
      .replace(/&#(\d{1,7});?/g, (match, decimal) => codePointOrOriginal(match, decimal, 10))
      .replace(
        /&([a-z][a-z0-9]+)(?:;|(?![a-z0-9]))/gi,
        (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match,
      );
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function decodeJsonStrings(value) {
  if (typeof value === 'string') return decodeHtmlEntities(value);
  if (Array.isArray(value)) return value.map(decodeJsonStrings);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, decodeJsonStrings(nestedValue)]),
  );
}

module.exports = {
  decodeHtmlEntities,
  decodeJsonStrings,
};
