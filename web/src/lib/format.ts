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

export function parseGen(input: string): bigint {
  const t = input.trim();
  if (!t) return 0n;
  const [w, f = ""] = t.split(".");
  const frac = (f + "000000000000000000").slice(0, 18);
  return BigInt(w || "0") * ATTO + BigInt(frac || "0");
}

export function explorerTx(hash: string) {
  const base = process.env.NEXT_PUBLIC_STUDIO_EXPLORER || "https://explorer-studio-dev.genlayer.com";
  return `${base}/tx/${hash}`;
}

export function explorerAddr(addr: string) {
  const base = process.env.NEXT_PUBLIC_STUDIO_EXPLORER || "https://explorer-studio-dev.genlayer.com";
  return `${base}/address/${addr}`;
}
