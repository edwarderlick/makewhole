export const CANONICAL_CHAIN_ID = 61997;
export const CANONICAL_CHAIN_HEX = "0xf22d";
export const CANONICAL_NETWORK_NAME = "GenLayer Studio-dev";
export const CANONICAL_STUDIO_DEV_RPC = "https://studio-dev.genlayer.com/api";
export const CANONICAL_STUDIO_DEV_EXPLORER = "https://explorer-studio-dev.genlayer.com";

/**
 * Normalizes an RPC or Explorer URL:
 * - Trims leading/trailing whitespace
 * - Strips harmless trailing slashes
 */
export function normalizeUrl(url?: string | null): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  return trimmed.replace(/\/+$/, "");
}

/**
 * Resolves the canonical Studio RPC URL according to strict environment precedence:
 * 1. GENLAYER_STUDIO_URL
 * 2. NEXT_PUBLIC_STUDIO_RPC
 * 3. Canonical default: https://studio-dev.genlayer.com/api
 */
export function resolveStudioRpcUrl(env: Record<string, string | undefined> = process.env): string {
  const fromGenlayer = normalizeUrl(env?.GENLAYER_STUDIO_URL);
  if (fromGenlayer) return fromGenlayer;

  const fromNextPublic = normalizeUrl(env?.NEXT_PUBLIC_STUDIO_RPC);
  if (fromNextPublic) return fromNextPublic;

  return CANONICAL_STUDIO_DEV_RPC;
}

/**
 * Resolves the canonical Studio block explorer URL according to environment precedence:
 * 1. NEXT_PUBLIC_STUDIO_EXPLORER
 * 2. Canonical default: https://explorer-studio-dev.genlayer.com
 */
export function resolveStudioExplorerUrl(env: Record<string, string | undefined> = process.env): string {
  const fromNextPublic = normalizeUrl(env?.NEXT_PUBLIC_STUDIO_EXPLORER);
  if (fromNextPublic) return fromNextPublic;

  return CANONICAL_STUDIO_DEV_EXPLORER;
}

/**
 * Extracts the RPC hostname safely from a URL string.
 */
export function getRpcHost(rpcUrl: string): string {
  try {
    const parsed = new URL(rpcUrl);
    return parsed.hostname || parsed.host || "studio-dev.genlayer.com";
  } catch {
    return "studio-dev.genlayer.com";
  }
}

export interface CanonicalNetworkConfig {
  chainId: number;
  chainIdHex: string;
  networkName: string;
  rpcUrl: string;
  rpcHost: string;
  explorerUrl: string;
}

/**
 * Returns the effective canonical network configuration.
 * Server-safe, exposes only public network constants (no secrets).
 */
export function getCanonicalNetworkConfig(env: Record<string, string | undefined> = process.env): CanonicalNetworkConfig {
  const rpcUrl = resolveStudioRpcUrl(env);
  const explorerUrl = resolveStudioExplorerUrl(env);
  return {
    chainId: CANONICAL_CHAIN_ID,
    chainIdHex: CANONICAL_CHAIN_HEX,
    networkName: CANONICAL_NETWORK_NAME,
    rpcUrl,
    rpcHost: getRpcHost(rpcUrl),
    explorerUrl,
  };
}

export const STUDIO_DEV = {
  chainIdDec: CANONICAL_CHAIN_ID,
  // 61997 = 0xf22d. 0xf21d is 61981 and must not be sent to MetaMask.
  chainIdHex: CANONICAL_CHAIN_HEX,
  chainName: CANONICAL_NETWORK_NAME,
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: [CANONICAL_STUDIO_DEV_RPC],
  blockExplorerUrls: [CANONICAL_STUDIO_DEV_EXPLORER],
} as const;

export const STUDIONET_FALLBACK = {
  chainIdDec: 61999,
  chainIdHex: "0xf22f",
  chainName: "GenLayer Studionet",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: ["https://studio.genlayer.com/api"],
  blockExplorerUrls: ["https://explorer-studio.genlayer.com"],
} as const;

export interface TargetChain {
  readonly chainIdDec: number;
  readonly chainIdHex: string;
  readonly chainName: string;
  readonly nativeCurrency: {
    readonly name: string;
    readonly symbol: string;
    readonly decimals: number;
  };
  readonly rpcUrls: readonly string[];
  readonly blockExplorerUrls: readonly string[];
}

export function targetFromEnv(): TargetChain {
  const id = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "61997");
  if (id === 61999) return STUDIONET_FALLBACK;
  const resolvedRpc = resolveStudioRpcUrl();
  const resolvedExplorer = resolveStudioExplorerUrl();
  return {
    ...STUDIO_DEV,
    rpcUrls: [resolvedRpc],
    blockExplorerUrls: [resolvedExplorer],
  };
}

export const TARGET = targetFromEnv();
export const TARGET_CHAIN_ID = TARGET.chainIdDec;
export const TARGET_CHAIN_HEX = TARGET.chainIdHex;
export const TARGET_RPC = TARGET.rpcUrls[0];
export const TARGET_EXPLORER = TARGET.blockExplorerUrls[0];

export function chainHex(id: number): `0x${string}` {
  return `0x${id.toString(16)}` as `0x${string}`;
}

export function chainLabel(id: number): string {
  if (id === 61999) return STUDIONET_FALLBACK.chainName;
  if (id === 61997) return STUDIO_DEV.chainName;
  return `chain ${id}`;
}

export const FALLBACK_CHAIN_ID = STUDIONET_FALLBACK.chainIdDec;
export const FALLBACK_RPC = STUDIONET_FALLBACK.rpcUrls[0];

export function assertWalletContext(target: TargetChain): string | null {
  if (typeof window === "undefined") return "Connect only runs in the browser.";
  if (typeof window.location?.origin !== "string") return "Page origin is missing. Refresh and try again.";
  if (!Number.isInteger(target.chainIdDec)) return "Chain id is not an integer.";
  if (typeof target.chainIdHex !== "string" || !target.chainIdHex.startsWith("0x")) {
    return "Chain hex is missing.";
  }
  if (!Array.isArray(target.rpcUrls) || target.rpcUrls.length < 1) return "RPC list is empty.";
  if (typeof target.rpcUrls[0] !== "string" || !target.rpcUrls[0].startsWith("http")) {
    return "RPC URL is not http(s).";
  }
  if (!Array.isArray(target.blockExplorerUrls) || typeof target.blockExplorerUrls[0] !== "string") {
    return "Block explorer URL is missing.";
  }
  return null;
}

export function addChainParams(target: TargetChain) {
  return {
    chainId: target.chainIdHex,
    chainName: target.chainName,
    nativeCurrency: {
      name: target.nativeCurrency.name,
      symbol: target.nativeCurrency.symbol,
      decimals: target.nativeCurrency.decimals,
    },
    rpcUrls: [...target.rpcUrls],
    blockExplorerUrls: [...target.blockExplorerUrls],
  };
}
