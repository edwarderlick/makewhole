"use client";
import { formatGlError } from "@/lib/formatError";
import { useState, useEffect } from "react";
import { useWallet } from "@/lib/wallet";
import { hasLiveContract } from "@/lib/contract";
import { ConfirmModal, NO_CONTRACT_COPY } from "./ConfirmModal";

function extractHash(tx: unknown): string | null {
  if (!tx) return null;
  if (typeof tx === "string" && tx.startsWith("0x")) return tx;
  if (typeof tx === "object" && tx !== null && "hash" in tx) {
    const h = String((tx as any).hash || "");
    return h.startsWith("0x") ? h : null;
  }
  return null;
}

export function TxButton({
  label,
  onClick,
  disabled,
  variant = "primary",
  allowDisconnected,
  onSuccess,
}: {
  label: string;
  onClick: () => Promise<unknown>;
  disabled?: boolean;
  variant?: "primary" | "lime" | "ghost" | "danger";
  allowDisconnected?: boolean;
  onSuccess?: () => void;
}) {
  const w = useWallet();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [phase, setPhase] = useState<"idle" | "estimate" | "waiting">("idle");
  const cls =
    variant === "lime"
      ? "bg-secondary-container text-on-secondary-fixed"
      : variant === "ghost"
        ? "bg-white border border-primary text-primary"
        : variant === "danger"
          ? "bg-error text-on-error"
          : "bg-primary text-on-primary";

  const storageKey = `mw:${label.split(" ")[0].toLowerCase()}:`;
  const legacyStorageKey = `tx_${label}`;

  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey) || sessionStorage.getItem(legacyStorageKey);
    if (saved) {
      if (sessionStorage.getItem(legacyStorageKey)) {
        sessionStorage.setItem(storageKey, saved);
        sessionStorage.removeItem(legacyStorageKey);
      }
      resumeWait(saved);
    }
  }, []);

  const resumeWait = async (hash: string) => {
    // The ConsensusOverlay now handles the actual waiting UI
    setPhase("idle");
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-pad-2xs">
      <button
        disabled={disabled || busy || (!allowDisconnected && (!w.account || w.wrongNetwork))}
        className={`${cls} px-4 py-2 font-headline-sm text-[14px] uppercase tracking-wide rounded-md disabled:opacity-40 hover:shadow-hard`}
        onClick={async () => {
          if (!hasLiveContract()) {
            setModal(true);
            setMsg("No live Intelligent Contract");
            return;
          }
          setBusy(true);
          setPhase("estimate");
          setMsg("Estimating fees");
          try {
            const tx = await onClick();
            if (tx === null) return;
            const hash = extractHash(tx);
            if (!hash) {
              setMsg("No transaction hash — estimate failed or wallet rejected");
              setBusy(false);
              setPhase("idle");
              return;
            }
            sessionStorage.setItem(storageKey, hash);
            setMsg(null);
            await resumeWait(hash);
          } catch (e: any) {
            setMsg(`Write failed: ${formatGlError(e)}`);
            setBusy(false);
            setPhase("idle");
          }
        }}
      >
        {busy && phase === "estimate" ? "Estimating fees" : label}
      </button>
      {msg && <span className="font-label-code text-[11px] text-on-surface-variant break-words">{msg}</span>}
      <ConfirmModal open={modal} title="Writes paused" body={NO_CONTRACT_COPY} onClose={() => setModal(false)} />
    </div>
  );
}
