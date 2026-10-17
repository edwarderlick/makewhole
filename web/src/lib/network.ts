export const STUDIO_DEV = {
  chainIdDec: 61997,
  // 61997 = 0xf22d. 0xf21d is 61981 and must not be sent to MetaMask.
  chainIdHex: "0xf22d",
  chainName: "GenLayer Studio-dev",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: ["https://studio-dev.genlayer.com/api"],
  blockExplorerUrls: ["https://explorer-studio-dev.genlayer.com"],
} as const;

export const STUDIONET_FALLBACK = {
  chainIdDec: 61999,
  chainIdHex: "0xf22f",
  chainName: "GenLayer Studionet",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: ["https://studio.genlayer.com/api"],
  blockExplorerUrls: ["https://explorer-studio.genlayer.com"],
} as const;

export type TargetChain = typeof STUDIO_DEV | typeof STUDIONET_FALLBACK;

export function targetFromEnv(): TargetChain {
  const id = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "61997");
  if (id === 61999) return STUDIONET_FALLBACK;
  return STUDIO_DEV;
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
