"use client";

import { createClient } from "genlayer-js";
import {
  TARGET,
  TARGET_CHAIN_HEX,
  TARGET_CHAIN_ID,
  TARGET_EXPLORER,
  TARGET_RPC,
  addChainParams,
  assertWalletContext,
  chainLabel,
  targetFromEnv,
} from "./network";

export const STUDIO_DEV_CHAIN_ID = TARGET_CHAIN_ID;
export const STUDIO_DEV_CHAIN_HEX = TARGET_CHAIN_HEX;
export const STUDIO_DEV_RPC = TARGET_RPC;
export const STUDIO_DEV_EXPLORER = TARGET_EXPLORER;

export const studioDevChain = {
  id: TARGET.chainIdDec,
  name: TARGET.chainName,
  rpcUrls: { default: { http: [...TARGET.rpcUrls] } },
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  blockExplorers: { default: { name: "Explorer", url: TARGET.blockExplorerUrls[0] } },
};

export function browserRpc(): string {
  if (typeof window !== "undefined") return "/api/genlayer";
  return TARGET.rpcUrls[0];
}

export function buildClient(account?: string | null, provider?: unknown) {
  const http = browserRpc();
  let chain: any = { ...studioDevChain, rpcUrls: { default: { http: [http] } } };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const chains = require("genlayer-js/chains");
    if (TARGET_CHAIN_ID === 61997 && chains.studioDevnet) {
      chain = {
        ...chains.studioDevnet,
        id: TARGET.chainIdDec,
        rpcUrls: { default: { http: [http] } },
        blockExplorers: { default: { name: "Explorer", url: TARGET.blockExplorerUrls[0] } },
      };
    } else if (TARGET_CHAIN_ID === 61999 && chains.studionet) {
      chain = {
        ...chains.studionet,
        id: TARGET.chainIdDec,
        rpcUrls: { default: { http: [http] } },
        blockExplorers: { default: { name: "Explorer", url: TARGET.blockExplorerUrls[0] } },
      };
    }
  } catch {
    /* keep local definition */
  }
  return createClient({
    chain,
    ...(account ? { account: account as `0x${string}` } : {}),
    ...(provider ? { provider } : {}),
    endpoint: http,
  } as any);
}

export async function addOrSwitchStudioDev(eth: any) {
  const target = targetFromEnv();
  const blocked = assertWalletContext(target);
  if (blocked) throw new Error(blocked);
  if (!eth?.request) throw new Error("Wallet has no request()");
  const current = await eth.request({ method: "eth_chainId", params: [] });
  if (String(current).toLowerCase() === target.chainIdHex.toLowerCase()) return;
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: target.chainIdHex }],
    });
  } catch (err: any) {
    const code = err?.code ?? err?.data?.originalError?.code;
    if (code === 4902 || /unrecognized chain/i.test(String(err?.message || ""))) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [addChainParams(target)],
      });
    } else if (code === 4001) {
      throw new Error("User rejected network switch");
    } else {
      throw err;
    }
  }
}

export async function waitSuccessful(client: any, txId: string) {
  const wait =
    client.waitForFinalization ||
    client.waitForTransactionReceipt ||
    (async ({ hash }: { hash: string }) => client.getTransaction?.(hash));
  const tx = await wait.call(client, { hash: txId, status: "FINALIZED" });
  let ok: boolean | undefined;
  try {
    const m: any = await import("genlayer-js");
    if (typeof m.isSuccessful === "function") ok = m.isSuccessful(tx);
  } catch {
    ok = undefined;
  }
  const exec = String(tx?.txExecutionResultName || tx?.execution_result || "");
  const status = String(tx?.statusName || tx?.status || "").toUpperCase();
  const statusOk = status.includes("ACCEPTED") || status.includes("FINALIZED");
  const execOk = exec.includes("FINISHED_WITH_RETURN") || exec.includes("SUCCESS");
  if (ok === false || (ok === undefined && (!statusOk || (exec && !execOk)))) {
    throw new Error(
      `Write failed: ${tx?.statusName || tx?.status} / ${tx?.txExecutionResultName || "no execution result"}`
    );
  }
  return tx;
}

export { chainLabel };
