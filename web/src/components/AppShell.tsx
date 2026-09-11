"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { shortAddr } from "@/lib/format";
import { CONTRACT_ADDRESS, hasLiveContract } from "@/lib/contract";
import { TARGET_CHAIN_ID, TARGET_RPC, chainLabel } from "@/lib/network";

const NAV = [
  { href: "/how", label: "How" },
  { href: "/create", label: "Create Job" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/browse", label: "Browse" },
  { href: "/vault", label: "My Vault" },
  { href: "/economics", label: "Economics" },
  { href: "/skill", label: "Skill" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const w = useWallet();

  return (
    <div className="min-h-screen blueprint-grid bg-background text-on-surface font-body-md">
      {!hasLiveContract() && (
        <div className="w-full bg-primary text-on-primary px-4 sm:px-6 lg:px-8 py-1.5">
          <div className="max-w-7xl mx-auto font-label-code text-label-code tracking-wide">
            Studio-dev 61997 · runner registry down · demo mode · test GEN only
          </div>
        </div>
      )}
      {hasLiveContract() && TARGET_CHAIN_ID === 61999 && (
        <div className="w-full bg-secondary-container text-on-secondary-fixed px-4 sm:px-6 lg:px-8 py-1.5">
          <div className="max-w-7xl mx-auto font-label-code text-label-code">
            Live on Studionet 61999 — Studio-dev 61997 runner registry down
          </div>
        </div>
      )}
      {w.wrongNetwork && (
        <div className="w-full bg-error text-on-error px-4 sm:px-6 lg:px-8 py-1.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between font-label-code text-label-code gap-4">
            <span>
              WRONG_NETWORK_DETECTED: Target chain ID [{TARGET_CHAIN_ID}] required ({chainLabel(TARGET_CHAIN_ID)}).
              Writes paused.
            </span>
            <button
              className="bg-white text-on-surface px-2 py-1 uppercase tracking-wider text-[10px] font-label-status"
              onClick={() => w.switchNetwork()}
            >
              Add / switch to {chainLabel(TARGET_CHAIN_ID)} {TARGET_CHAIN_ID}
            </button>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <Link href="/" className="flex items-center space-x-3 group">
              <img src="/logo.png" alt="MAKEWHOLE" className="h-8 w-auto object-contain rounded" />
              <div className="hidden sm:flex flex-col">
                <span className="font-headline-sm text-headline-sm tracking-tight text-primary uppercase font-bold">
                  MAKEWHOLE
                </span>
                <span className="text-[10px] font-mono tracking-wider text-gray-500 uppercase">Surety protocol</span>
              </div>
              <span className="font-label-status text-label-status px-1 py-[1px] bg-secondary-container text-on-secondary-fixed font-semibold tracking-wider">
                v2.4
              </span>
            </Link>
            <nav className="hidden md:flex items-center space-x-8 text-sm font-medium text-gray-600">
              {NAV.map((n) => {
                const active = path === n.href || path.startsWith(n.href + "/");
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={
                      active
                        ? "text-primary font-semibold border-b-2 border-primary py-5"
                        : "hover:text-black transition-colors py-5"
                    }
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center space-x-3">
            <div className="hidden lg:flex items-center space-x-2 text-xs font-mono text-gray-500 px-3 py-1.5 border border-gray-200 rounded-full">
              <span className={`w-2 h-2 rounded-full ${w.wrongNetwork ? "bg-red-500" : "bg-lime-500 animate-pulse"}`} />
              <span>
                {chainLabel(w.chainId ?? TARGET_CHAIN_ID)} · {w.chainId ?? TARGET_CHAIN_ID}
              </span>
            </div>
            {w.account ? (
              <button
                onClick={w.disconnect}
                className="flex items-center bg-surface-container-low border border-outline-variant font-label-code text-label-code text-on-surface"
                title="Disconnect"
              >
                <span className="px-3 py-1.5 border-r border-outline-variant text-on-surface-variant">WALLET</span>
                <span className="px-3 py-1.5 font-semibold">{shortAddr(w.account)}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  void w.connect();
                }}
                className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold tracking-wide uppercase bg-black hover:bg-neutral-800 text-white rounded-md transition-all shadow-sm"
              >
                {w.connecting ? "Connecting…" : "Connect wallet"}
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="w-full min-h-[70vh]">{children}</main>
      <footer className="bg-[#0a0a0a] text-white border-t border-neutral-800 pt-16 pb-12 font-sans mt-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 pb-16 border-b border-neutral-800">
            <div className="lg:col-span-4 space-y-4">
              <div className="flex items-center space-x-3">
                <img src="/logo.png" alt="MAKEWHOLE" className="h-7 w-auto object-contain" />
                <span className="font-headline-sm uppercase font-bold tracking-tight">MAKEWHOLE</span>
              </div>
              <p className="text-xs font-mono text-neutral-400 tracking-wide">The next agent still gets paid.</p>
              <p className="text-xs text-neutral-500 max-w-sm">
                Surety vault for a 3-hop agent pipeline on GenLayer Studio-dev. Not a court. Not Internet Court. Test
                GEN only.
              </p>
              <div className="pt-2">
                <span className="inline-flex items-center space-x-2 px-3 py-1 rounded bg-neutral-900 border border-neutral-800 text-[11px] font-mono text-lime-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />
                  <span>ALL SYSTEMS — SURETY VAULT</span>
                </span>
              </div>
            </div>
            <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-8 text-xs font-mono">
              <div className="space-y-3">
                <div className="font-bold text-neutral-200 uppercase tracking-wider text-[11px]">Product</div>
                <ul className="space-y-2 text-neutral-400">
                  <li>
                    <Link className="hover:text-white" href="/pipeline">
                      Pipeline
                    </Link>
                  </li>
                  <li>
                    <Link className="hover:text-white" href="/how">
                      How it works
                    </Link>
                  </li>
                  <li>
                    <Link className="hover:text-white" href="/create">
                      Create Job
                    </Link>
                  </li>
                  <li>
                    <Link className="hover:text-white" href="/skill">
                      Surety Skill
                    </Link>
                  </li>
                </ul>
              </div>
              <div className="space-y-3">
                <div className="font-bold text-neutral-200 uppercase tracking-wider text-[11px]">Vault</div>
                <ul className="space-y-2 text-neutral-400">
                  <li>
                    <Link className="hover:text-white" href="/vault">
                      My Vault
                    </Link>
                  </li>
                  <li>
                    <Link className="hover:text-white" href="/economics">
                      Economics
                    </Link>
                  </li>
                  <li>
                    <Link className="hover:text-white" href="/browse">
                      Ledger
                    </Link>
                  </li>
                  <li className="text-neutral-600">Audit receipts</li>
                </ul>
              </div>
              <div className="space-y-3">
                <div className="font-bold text-neutral-200 uppercase tracking-wider text-[11px]">Skill</div>
                <ul className="space-y-2 text-neutral-400">
                  <li>
                    <Link className="hover:text-white" href="/skill">
                      check_bond()
                    </Link>
                  </li>
                  <li>
                    <Link className="hover:text-white" href="/skill">
                      adjudicate()
                    </Link>
                  </li>
                  <li className="text-neutral-600">Python SDK</li>
                  <li className="text-neutral-600">TypeScript SDK</li>
                </ul>
              </div>
              <div className="space-y-3">
                <div className="font-bold text-neutral-200 uppercase tracking-wider text-[11px]">Network</div>
                <ul className="space-y-2 text-neutral-400">
                  <li>
                    CHAIN {TARGET_CHAIN_ID} ({chainLabel(TARGET_CHAIN_ID)})
                  </li>
                  <li>IC {hasLiveContract() ? `${CONTRACT_ADDRESS.slice(0, 10)}…` : "(undeployed)"}</li>
                  <li className="break-all">{TARGET_RPC.replace("https://", "")}</li>
                  <li>LATEST BUILD: V2.4.0</li>
                </ul>
              </div>
            </div>
          </div>
          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-neutral-500 space-y-4 sm:space-y-0">
            <div>© 2026 MAKEWHOLE. All rights reserved.</div>
            <div className="flex items-center space-x-6">
              <span className="text-neutral-400">GenLayer · Studio-dev 61997 · Test GEN</span>
            </div>
          </div>
        </div>
      </footer>
      {w.error && (
        <div className="fixed bottom-4 right-4 bg-error-container text-on-error-container px-4 py-3 font-label-code text-label-code shadow-hard z-[90]">
          {w.error}
        </div>
      )}
    </div>
  );
}
