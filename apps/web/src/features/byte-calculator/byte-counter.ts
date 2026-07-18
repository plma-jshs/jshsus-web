/**
 * Browsers expose textarea line endings as LF. The school byte rule counts a
 * line break as CRLF (2 bytes), so line endings are normalized before UTF-8
 * encoding.
 */
export function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n|\r|\n/g, '\r\n');
}

export function countUtf8Bytes(value: string): number {
  return new TextEncoder().encode(normalizeLineEndings(value)).byteLength;
}

export type ByteUsage = {
  bytes: number;
  limit: number;
  remaining: number;
  exceeded: number;
  percentage: number;
};

export function getByteUsage(value: string, requestedLimit: number): ByteUsage {
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.floor(requestedLimit)) : 1500;
  const bytes = countUtf8Bytes(value);
  return {
    bytes,
    limit,
    remaining: Math.max(limit - bytes, 0),
    exceeded: Math.max(bytes - limit, 0),
    percentage: Math.min((bytes / limit) * 100, 100),
  };
}
