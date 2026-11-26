/** A room number from a URL segment: a positive integer without leading zeros. */
export function parseRoomId(raw: string): number | null {
  if (!/^[1-9]\d{0,15}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}
