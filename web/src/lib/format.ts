export const ATTO = 10n ** 18n;

export function shortAddr(addr?: string | null) {
  if (!addr) return "—";
  const a = addr.startsWith("0x") ? addr : `0x${addr}`;
  if (a.length < 12) return a;
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

export function shortId(id?: string | null) {
  if (!id) return "—";
  if (id.length <= 18) return id;
  return `${id.slice(0, 10)}...${id.slice(-6)}`;
}

export function formatGen(value: bigint | number | string | null | undefined, digits = 2) {
  if (value === null || value === undefined || value === "") return "0";
  const n = typeof value === "bigint" ? value : BigInt(value);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const whole = abs / ATTO;
  const frac = abs % ATTO;
  const fracStr = frac.toString().padStart(18, "0").slice(0, digits);
  return `${neg ? "-" : ""}${whole.toString()}.${fracStr}`;
}

export const MAX_U256 = (1n << 256n) - 1n;

export function tryParseGen(input: string): bigint | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;

  // Ordinary decimal notation only (no leading +/- signs, no scientific notation, no hex, no multiple dots)
  if (!/^\d+(\.\d+)?$/.test(s)) {
    return null;
  }

  const [wholeStr, fracStr = ""] = s.split(".");
  // Reject more than 18 fractional digits (do not silently truncate)
  if (fracStr.length > 18) {
    return null;
  }

  try {
    const paddedFrac = fracStr.padEnd(18, "0");
    const wholeVal = BigInt(wholeStr);
    const fracVal = BigInt(paddedFrac);
    const total = wholeVal * ATTO + fracVal;
    if (total < 0n || total > MAX_U256) {
      return null;
    }
    return total;
  } catch {
    return null;
  }
}

export function parseGen(input: string): bigint {
  const parsed = tryParseGen(input);
  if (parsed === null) {
    throw new Error(
      `Invalid GEN amount: "${input}". Expected non-negative decimal string with at most 18 decimal places fitting unsigned u256.`
    );
  }
  return parsed;
}

export function explorerTx(hash: string) {
  const base = process.env.NEXT_PUBLIC_STUDIO_EXPLORER || "https://explorer-studio-dev.genlayer.com";
  return `${base}/tx/${hash}`;
}

export function explorerAddr(addr: string) {
  const base = process.env.NEXT_PUBLIC_STUDIO_EXPLORER || "https://explorer-studio-dev.genlayer.com";
  return `${base}/address/${addr}`;
}
