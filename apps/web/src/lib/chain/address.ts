// Gno addresses are bech32 with the "g" prefix: g1 + 38 characters.
// Checking the checksum here catches a mistyped invitee before a room is
// opened for the wrong account.

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) chk ^= GENERATOR[i];
    }
  }
  return chk >>> 0;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (const c of hrp) out.push(c.charCodeAt(0) >> 5);
  out.push(0);
  for (const c of hrp) out.push(c.charCodeAt(0) & 31);
  return out;
}

export type AddressCheck = { ok: true; address: string } | { ok: false; reason: string };

/** Checks a gno.land account address, ignoring surrounding spaces and case. */
export function checkAddress(input: string): AddressCheck {
  const text = input.trim();
  if (text === "") return { ok: false, reason: "Enter an address" };
  if (text !== text.toLowerCase() && text !== text.toUpperCase()) {
    return { ok: false, reason: "An address is either all lowercase or all uppercase" };
  }
  const address = text.toLowerCase();
  if (address.startsWith("@")) {
    return { ok: false, reason: "Enter the account address (g1…), not a username" };
  }
  if (!address.startsWith("g1")) return { ok: false, reason: "A gno.land address starts with g1" };
  if (address.length !== 40) return { ok: false, reason: `A gno.land address has 40 characters; this one has ${address.length}` };
  const data: number[] = [];
  for (const c of address.slice(2)) {
    const v = CHARSET.indexOf(c);
    if (v === -1) return { ok: false, reason: `"${c}" cannot appear in an address` };
    data.push(v);
  }
  if (polymod([...hrpExpand("g"), ...data]) !== 1) {
    return { ok: false, reason: "This address has a typo: its checksum does not match" };
  }
  return { ok: true, address };
}
