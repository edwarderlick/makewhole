"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet";
import { hasLiveContract } from "@/lib/contract";
import { ConfirmModal, NO_CONTRACT_COPY } from "./ConfirmModal";

export function TxButton({
  label,
  onClick,
  disabled,
  variant = "primary",
  allowDisconnected,
}: {
  label: string;
  onClick: () => Promise<unknown>;
  disabled?: boolean;
  variant?: "primary" | "lime" | "ghost" | "danger";
  allowDisconnected?: boolean;
}) {
  const w = useWallet();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const cls =
    variant === "lime"
      ? "bg-secondary-container text-on-secondary-fixed"
      : variant === "ghost"
        ? "bg-white border border-primary text-primary"
        : variant === "danger"
          ? "bg-error text-on-error"
          : "bg-primary text-on-primary";
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
          setMsg("Waiting on consensus");
          try {
            const tx = await onClick();
            setMsg(tx ? `Settling GEN · ${String(tx).slice(0, 10)}…` : "Done");
          } catch (e: any) {
            setMsg(e?.message || "Failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Waiting on consensus" : label}
      </button>
      {msg && <span className="font-label-code text-[11px] text-on-surface-variant">{msg}</span>}
      <ConfirmModal open={modal} title="Writes paused" body={NO_CONTRACT_COPY} onClose={() => setModal(false)} />
    </div>
  );
}
