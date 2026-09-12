"use client";

import type { ReactNode } from "react";

export const NO_CONTRACT_COPY =
  "No Intelligent Contract on this network yet. Connect a wallet to see the network chip. Replay the public-gist rug below — that path is local + fixtures until an address is set.";

export function ConfirmModal({
  open,
  title,
  body,
  onClose,
  children,
  closeLabel = "Close",
}: {
  open: boolean;
  title: string;
  body?: string;
  onClose: () => void;
  children?: ReactNode;
  closeLabel?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4 modal-enter">
      <div className="max-w-lg w-full bg-white border border-neutral-200 shadow-xl rounded-xl p-6">
        <div className="font-label-status text-label-status text-on-surface-variant">CONFIRM</div>
        <h2 className="font-headline-md text-headline-md mt-2">{title}</h2>
        {body ? (
          <p className="font-body-md text-body-md mt-3 text-on-surface-variant whitespace-pre-wrap">{body}</p>
        ) : null}
        {children}
        <button
          className="mt-6 inline-flex items-center px-4 py-2 bg-black text-white text-xs font-semibold tracking-wide uppercase rounded-md"
          onClick={onClose}
        >
          {closeLabel}
        </button>
      </div>
    </div>
  );
}
