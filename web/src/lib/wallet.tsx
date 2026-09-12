"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { buildClient } from "./genlayer";
import {
  TARGET_CHAIN_ID,
  addChainParams,
  assertWalletContext,
  targetFromEnv,
  type TargetChain,
} from "./network";

export type Injected = {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: any;
};

type WalletCtx = {
  client: any | null;
  account: string | null;
  chainId: number | null;
  balance: string | null;
  wrongNetwork: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
};

const Ctx = createContext<WalletCtx | null>(null);
const LS_ACCOUNT = "makewhole.account";
const LS_PROVIDER = "makewhole.provider.rdns";

function pageReady(): string | null {
  if (typeof window === "undefined") return "Connect only runs in the browser.";
  if (typeof window.location?.origin !== "string") return "Page origin is missing. Refresh and try again.";
  return null;
}

function walletRequest(provider: any, method: string, params: unknown[] = []) {
  if (!provider?.request) throw new Error("Wallet has no request()");
  const originErr = pageReady();
  if (originErr) throw new Error(originErr);
  return provider.request({ method, params });
}

function discoverInjected(): Promise<Injected[]> {
  if (typeof window === "undefined") return Promise.resolve([]);
  const found = new Map<string, Injected>();

  const add = (item: Injected) => {
    if (!item?.info?.uuid || !item.provider) return;
    for (const v of found.values()) {
      if (v.provider === item.provider) return;
    }
    found.set(item.info.uuid, item);
  };

  const onAnnounce = (e: Event) => {
    const d = (e as CustomEvent).detail;
    if (d?.info?.uuid && d?.provider) add(d);
  };

  window.addEventListener("eip6963:announceProvider", onAnnounce as EventListener);
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  return new Promise((resolve) => {
    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce as EventListener);
      const eth = (window as any).ethereum;
      if (Array.isArray(eth?.providers)) {
        eth.providers.forEach((p: any, i: number) => {
          add({
            info: {
              uuid: `legacy-providers-${i}`,
              name: p?.isMetaMask ? "MetaMask" : p?.isRabby ? "Rabby" : p?.isCoinbaseWallet ? "Coinbase Wallet" : "Injected wallet",
              icon: "",
              rdns: p?.isMetaMask ? "io.metamask" : "injected",
            },
            provider: p,
          });
        });
      }
      if (found.size === 0 && eth) {
        add({
          info: { uuid: "legacy", name: "Injected wallet", icon: "", rdns: "injected" },
          provider: eth,
        });
      }
      resolve([...found.values()]);
    }, 100);
  });
}

async function ensureChain(provider: any, target: TargetChain = targetFromEnv()) {
  const blocked = assertWalletContext(target);
  if (blocked) throw new Error(blocked);
  const current = await walletRequest(provider, "eth_chainId", []);
  if (String(current).toLowerCase() === target.chainIdHex.toLowerCase()) return;
  try {
    await walletRequest(provider, "wallet_switchEthereumChain", [{ chainId: target.chainIdHex }]);
  } catch (err: any) {
    const code = err?.code ?? err?.data?.originalError?.code;
    if (code === 4902 || /unrecognized chain/i.test(String(err?.message || ""))) {
      const again = assertWalletContext(target);
      if (again) throw new Error(again);
      await walletRequest(provider, "wallet_addEthereumChain", [addChainParams(target)]);
      await walletRequest(provider, "wallet_switchEthereumChain", [{ chainId: target.chainIdHex }]);
    } else if (code === 4001) {
      throw new Error("User rejected network switch");
    } else {
      throw err;
    }
  }
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<any | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [wallets, setWallets] = useState<Injected[]>([]);
  const providerRef = useRef<any>(null);

  useEffect(() => {
    if (client && account && chainId === TARGET_CHAIN_ID) {
      walletRequest(providerRef.current, "eth_getBalance", [account, "latest"])
        .then((hex) => {
          setBalance(BigInt(hex).toString());
        })
        .catch(() => setBalance(null));
    } else {
      setBalance(null);
    }
  }, [client, account, chainId]);

  const detach = useCallback((p: any, onAcc: any, onChain: any) => {
    p?.removeListener?.("accountsChanged", onAcc);
    p?.removeListener?.("chainChanged", onChain);
    p?.off?.("accountsChanged", onAcc);
    p?.off?.("chainChanged", onChain);
  }, []);

  const onAcc = useCallback((accs: string[]) => setAccount(accs?.[0] ?? null), []);
  const onChain = useCallback((hex: string) => {
    try {
      setChainId(parseInt(String(hex), 16));
    } catch {
      setChainId(null);
    }
  }, []);

  const attach = useCallback(
    (provider: any) => {
      if (providerRef.current && providerRef.current !== provider) {
        detach(providerRef.current, onAcc, onChain);
      }
      providerRef.current = provider;
      provider?.on?.("accountsChanged", onAcc);
      provider?.on?.("chainChanged", onChain);
    },
    [detach, onAcc, onChain]
  );

  useEffect(() => {
    setClient(buildClient(account, providerRef.current));
    if (account) {
      try {
        localStorage.setItem(LS_ACCOUNT, account);
      } catch {
        /* ignore */
      }
    }
  }, [account]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (pageReady()) {
        setClient(buildClient(null));
        return;
      }
      const list = await discoverInjected();
      if (cancelled) return;
      let provider = list[0]?.provider ?? null;
      try {
        const rdns = localStorage.getItem(LS_PROVIDER);
        if (rdns) {
          const hit = list.find((w) => w.info.rdns === rdns);
          if (hit) provider = hit.provider;
        }
      } catch {
        /* ignore */
      }
      if (!provider) {
        setClient(buildClient(null));
        return;
      }
      attach(provider);
      try {
        const accs: string[] = await walletRequest(provider, "eth_accounts", []);
        if (cancelled) return;
        if (accs?.[0]) setAccount(accs[0]);
        else {
          try {
            const saved = localStorage.getItem(LS_ACCOUNT);
            if (saved) setAccount(saved);
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* silent restore only */
      }
      try {
        const hex: string = await walletRequest(provider, "eth_chainId", []);
        if (!cancelled) setChainId(parseInt(String(hex), 16));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      if (providerRef.current) detach(providerRef.current, onAcc, onChain);
    };
  }, [attach, detach, onAcc, onChain]);

  const connectWith = useCallback(
    async (provider: any, info?: Injected["info"]) => {
      if (!provider?.request) throw new Error("Wallet has no request()");
      const originErr = pageReady();
      if (originErr) throw new Error(originErr);
      const accounts: string[] = await walletRequest(provider, "eth_requestAccounts", []);
      const address = accounts?.[0];
      if (!address) throw new Error("No account");
      await ensureChain(provider);
      attach(provider);
      setAccount(address);
      const hex: string = await walletRequest(provider, "eth_chainId", []);
      setChainId(parseInt(String(hex), 16));
      if (info?.rdns) {
        try {
          localStorage.setItem(LS_PROVIDER, info.rdns);
        } catch {
          /* ignore */
        }
      }
      return address;
    },
    [attach]
  );

  const connect = useCallback(async () => {
    const originErr = pageReady();
    if (originErr) {
      setError(originErr);
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const list = await discoverInjected();
      setWallets(list);
      setPickerOpen(true);
    } catch (e: any) {
      setError(e?.message || "Wallet discovery failed");
    } finally {
      setConnecting(false);
    }
  }, []);

  const pickWallet = useCallback(
    async (w: Injected) => {
      setConnecting(true);
      setError(null);
      try {
        await connectWith(w.provider, w.info);
        setPickerOpen(false);
      } catch (e: any) {
        const code = e?.code ?? e?.data?.originalError?.code;
        if (code === 4001 || /user rejected/i.test(String(e?.message || ""))) {
          setError("User rejected the request");
        } else {
          setError(e?.message || "Wallet connect failed");
        }
      } finally {
        setConnecting(false);
      }
    },
    [connectWith]
  );

  const switchNetwork = useCallback(async () => {
    const provider = providerRef.current;
    if (!provider) {
      setError("Connect a wallet first, then add / switch network.");
      return;
    }
    setError(null);
    try {
      await ensureChain(provider);
      const hex: string = await walletRequest(provider, "eth_chainId", []);
      setChainId(parseInt(String(hex), 16));
    } catch (e: any) {
      const code = e?.code ?? e?.data?.originalError?.code;
      if (code === 4001 || /user rejected/i.test(String(e?.message || ""))) {
        setError("User rejected network switch");
      } else {
        setError(e?.message || "Network switch failed");
      }
    }
  }, []);

  const disconnect = useCallback(() => {
    if (providerRef.current) detach(providerRef.current, onAcc, onChain);
    setAccount(null);
    setError(null);
    try {
      localStorage.removeItem(LS_ACCOUNT);
    } catch {
      /* ignore */
    }
  }, [detach, onAcc, onChain]);

  const value = useMemo<WalletCtx>(
    () => ({
      client,
      account,
      chainId,
      balance,
      wrongNetwork: chainId !== null && chainId !== TARGET_CHAIN_ID,
      connecting,
      error,
      connect,
      disconnect,
      switchNetwork,
    }),
    [client, account, chainId, balance, connecting, error, connect, disconnect, switchNetwork]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <ConfirmModal
        open={pickerOpen}
        title="Connect wallet"
        body={
          wallets.length === 0
            ? "No injected wallet. Install MetaMask or Rabby, then refresh."
            : "Pick the extension to use. MAKEWHOLE will request accounts, then Studio-dev 61997."
        }
        onClose={() => setPickerOpen(false)}
        closeLabel="Cancel"
      >
        {wallets.length > 0 && (
          <div className="mt-4 space-y-2">
            {wallets.map((w) => (
              <button
                key={w.info.uuid}
                type="button"
                disabled={connecting}
                onClick={() => pickWallet(w)}
                className="w-full flex items-center gap-3 px-3 py-3 border border-neutral-200 rounded-lg hover:bg-neutral-50 text-left disabled:opacity-50"
              >
                {w.info.icon ? (
                  <img src={w.info.icon} alt="" className="w-8 h-8 rounded" />
                ) : (
                  <span className="w-8 h-8 rounded bg-neutral-900 text-white text-xs flex items-center justify-center">
                    {w.info.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="font-headline-sm text-sm">{w.info.name}</span>
              </button>
            ))}
          </div>
        )}
      </ConfirmModal>
    </Ctx.Provider>
  );
}

export function useWallet() {
  const v = useContext(Ctx);
  if (!v) throw new Error("WalletProvider missing");
  return v;
}


