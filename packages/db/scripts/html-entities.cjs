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

/**
 * Cloudflare Email Protection stores the visible email as an obfuscated
 * `data-cfemail` hex string. Decode it before the HTML is converted to text;
 * otherwise the legacy page's `[email protected]` placeholder gets persisted.
 */
function decodeCloudflareEmail(value) {
  const encoded = String(value ?? '').trim();
  if (!/^[0-9a-f]+$/i.test(encoded) || encoded.length < 4 || encoded.length % 2 !== 0) {
    return null;
  }

  const key = Number.parseInt(encoded.slice(0, 2), 16);
  if (!Number.isInteger(key)) return null;

  let decoded = '';
  for (let index = 2; index < encoded.length; index += 2) {
    const byte = Number.parseInt(encoded.slice(index, index + 2), 16);
    if (!Number.isInteger(byte)) return null;
    decoded += String.fromCharCode(byte ^ key);
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
  decodeCloudflareEmail,
  decodeJsonStrings,
};
