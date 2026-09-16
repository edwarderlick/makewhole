"use client";
import { useEffect, useState, useRef } from "react";
import { formatGlError } from "@/lib/formatError";
import { useWallet } from "@/lib/wallet";

/* ─── GenLayer consensus stages (real) ─── */
const STAGES = [
  "PENDING",
  "PROPOSING",
  "COMMITTING",
  "REVEALING",
  "ACCEPTED",
  "FINALIZED",
] as const;

type Stage = (typeof STAGES)[number];

function stageIndex(s: string): number {
  const upper = (s || "").toUpperCase();
  // Appeal states map to COMMITTING/REVEALING
  if (upper.includes("APPEAL_COMMITTING")) return 2;
  if (upper.includes("APPEAL_REVEALING")) return 3;
  if (upper.includes("LEADER_REVEALING")) return 3;
  if (upper.includes("LEADER_TIMEOUT") || upper.includes("VALIDATORS_TIMEOUT")) return 4;
  if (upper === "CANCELED") return 5; // treat as final
  const idx = STAGES.indexOf(upper as Stage);
  return idx >= 0 ? idx : 0;
}

function isTerminal(s: string): boolean {
  const upper = (s || "").toUpperCase();
  return ["FINALIZED", "UNDETERMINED", "CANCELED"].includes(upper);
}

/* Vote badge */
function VoteBadge({ vote }: { vote: string }) {
  const v = (vote || "").toUpperCase();
  if (v === "AGREE")
    return <span className="px-2 py-0.5 rounded text-[10px] bg-[#b6ff3b]/20 text-[#b6ff3b] border border-[#b6ff3b]/30">AGREE</span>;
  if (v === "DISAGREE")
    return <span className="px-2 py-0.5 rounded text-[10px] bg-red-500/20 text-red-400 border border-red-500/30">DISAGREE</span>;
  if (v === "TIMEOUT")
    return <span className="px-2 py-0.5 rounded text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">TIMEOUT</span>;
  return <span className="px-2 py-0.5 rounded text-[10px] bg-gray-700/50 text-gray-500 border border-gray-700">IDLE</span>;
}

export function ConsensusOverlay() {
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [txData, setTxData] = useState<any>(null);
  const [actionName, setActionName] = useState<string | null>(null);
  const w = useWallet();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ─── Pick up tx hash from sessionStorage ─── */
  useEffect(() => {
    const checkStorage = () => {
      if (hash || error || done) return;
      const keys = Object.keys(sessionStorage).filter((k) => k.startsWith("mw:"));
      const targetKey = keys.find((k) => {
        const v = sessionStorage.getItem(k);
        return v && v.startsWith("0x");
      });
      if (targetKey) {
        const activeHash = sessionStorage.getItem(targetKey)!;
        const inferred = targetKey.split(":")[1] || null;
        const explicit = sessionStorage.getItem("mw:tx_action");
        setActionName(explicit || inferred);
        setHash(activeHash);
        startTracking(activeHash, targetKey);
      }
    };
    checkStorage();
    const iv = setInterval(checkStorage, 1000);
    return () => clearInterval(iv);
  }, [hash, error, done]);

  /* ─── Poll real tx status from GenLayer ─── */
  const startTracking = async (txHash: string, keyName: string) => {
    // Poll getTransaction every 3 seconds for real status
    const poll = async () => {
      try {
        const resp = await fetch("/api/genlayer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getTransactionByHash",
            params: [txHash],
          }),
        });
        const json = await resp.json();
        const tx = json?.result;
        if (tx) {
          setTxData(tx);
          const status = String(tx.status || tx.statusName || "").toUpperCase();
          if (isTerminal(status)) {
            handleTerminal(tx, txHash, keyName);
          }
        }
      } catch (e) {
        // keep polling
      }
    };

    // Initial poll
    await poll();

    // Set up interval
    pollRef.current = setInterval(poll, 3000);
  };

  const handleTerminal = (tx: any, txHash: string, keyName: string) => {
    // Stop polling
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    const status = String(tx.status || tx.statusName || "").toUpperCase();
    const exec = String(
      tx.txExecutionResultName ||
      tx.consensus_data?.leader_receipt?.execution_result ||
      tx.execution_result ||
      ""
    ).toUpperCase();

    const isSuccess =
      (status === "FINALIZED" || status === "CANCELED") &&
      (exec.includes("SUCCESS") || exec.includes("FINISHED_WITH_RETURN") || exec === "");

    if (status === "UNDETERMINED") {
      setError("Transaction was UNDETERMINED — validators could not reach consensus.");
      cleanupStorage();
      return;
    }

    if (!isSuccess && status !== "FINALIZED") {
      setError(`Write failed: ${status} / ${exec}`);
      cleanupStorage();
      return;
    }

    // Go straight to success and reload
    const finalize = async () => {
      setDone(true);

      // 2 seconds to show success, then reload
      setTimeout(async () => {
        const action = sessionStorage.getItem("mw:tx_action");
        if (action === "create_job") {
          cleanupStorage(["mw:tx_action", "mw:tx_create_old_len"]);
          const checkIds = async (attempts = 0): Promise<void> => {
            if (attempts > 15) {
              cleanupStorage();
              window.location.href = "/browse";
              return;
            }
            try {
              const { views } = await import("@/lib/contract");
              const ids = await views.listIds(w.client);
              const oldLenStr = sessionStorage.getItem("mw:tx_create_old_len");
              const oldLen = oldLenStr ? parseInt(oldLenStr, 10) : 0;
              if (ids && ids.length > oldLen) {
                cleanupStorage();
                window.location.href = `/job/${ids[ids.length - 1]}`;
                return;
              }
            } catch (e) {}
            setTimeout(() => checkIds(attempts + 1), 2000);
          };
          checkIds();
          return;
        }
        cleanupStorage();
        window.location.reload();
      }, 2000);
    };
    finalize();
  };

  const cleanupStorage = (keep?: string[]) => {
    const allKeys = Object.keys(sessionStorage).filter((k) => k.startsWith("mw:"));
    allKeys.forEach((k) => {
      if (!keep || !keep.includes(k)) sessionStorage.removeItem(k);
    });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  if (!hash) return null;

  const isSimpleTx = actionName !== "adjudicate";

  const getSimpleTitle = () => {
    switch (actionName) {
      case "create_job": return "Creating your escrow...";
      case "bond": return "Bonding to job...";
      case "submit": return "Submitting deliverable...";
      case "ack": return "Acknowledging downstream...";
      case "cancel": return "Canceling job...";
      default: return "Processing transaction...";
    }
  };

  const getSimpleDone = () => {
    switch (actionName) {
      case "create_job": return "Escrow Created";
      case "bond": return "Bonded Successfully";
      case "submit": return "Deliverable Submitted";
      case "ack": return "Acknowledged";
      case "cancel": return "Job Canceled";
      default: return "Transaction Confirmed";
    }
  };

  if (isSimpleTx) {
    return (
      <div className="fixed inset-0 z-[9999] bg-[#0a0a0a]/90 backdrop-blur flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#0a0a0a] border border-[#b6ff3b]/30 rounded-lg p-8 font-mono text-[#b6ff3b] shadow-[0_0_40px_rgba(182,255,59,0.1)] text-center relative">
          <button
            onClick={() => {
              if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
              }
              cleanupStorage();
              setHash(null);
              setError(null);
              setDone(false);
              setTxData(null);
              setActionName(null);
            }}
            className="absolute top-4 right-4 w-6 h-6 flex items-center justify-center rounded border border-[#b6ff3b]/30 text-[#b6ff3b]/50 hover:text-[#b6ff3b] hover:border-[#b6ff3b]/60 transition-colors text-xs"
            title="Close"
          >
            ✕
          </button>
          
          <div className="mb-6 flex justify-center mt-4">
            {done ? (
              <div className="w-12 h-12 rounded-full border-2 border-[#b6ff3b] flex items-center justify-center text-xl">
                ✓
              </div>
            ) : error ? (
              <div className="w-12 h-12 rounded-full border-2 border-error flex items-center justify-center text-xl text-error">
                ✕
              </div>
            ) : (
              <div className="flex space-x-2 items-center h-12">
                <div className="w-3 h-3 rounded-full bg-[#b6ff3b] animate-bounce" />
                <div className="w-3 h-3 rounded-full bg-[#b6ff3b] animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-3 h-3 rounded-full bg-[#b6ff3b] animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            )}
          </div>
          <h2 className="text-lg tracking-widest uppercase mb-2 font-bold">
            {error ? "Error" : done ? getSimpleDone() : getSimpleTitle()}
          </h2>
          <p className="text-[#b6ff3b]/60 text-sm mb-6">
            {error ? error : done ? (actionName === "create_job" ? "Redirecting to job page..." : "Reloading page...") : (
              <>
                Please wait while the transaction is finalized.<br/>
                <span className="text-[#b6ff3b] mt-2 block text-xs">
                  Network Status: {String(txData?.status || txData?.statusName || "PENDING").toUpperCase()}
                </span>
              </>
            )}
          </p>
          <div className="bg-[#b6ff3b]/5 border border-[#b6ff3b]/20 p-3 rounded text-xs break-all text-left">
            <span className="text-[#b6ff3b]/50 block mb-1">TX HASH:</span>
            {hash}
          </div>
        </div>
      </div>
    );
  }

  /* ─── Derive display data from real tx ─── */
  const statusName = String(txData?.status || txData?.statusName || "PENDING").toUpperCase();
  const currentStage = stageIndex(statusName);
  const isAppeal = statusName.includes("APPEAL");
  const round = txData?.last_round;
  const numRounds = parseInt(txData?.num_of_rounds || "0");
  const resultName = txData?.result_name || "";
  const validatorVotes: string[] = round?.validator_votes_name || [];
  const validatorAddrs: string[] = round?.round_validators || [];
  const votesCommitted = parseInt(round?.votes_committed || "0");
  const votesRevealed = parseInt(round?.votes_revealed || "0");
  const totalValidators = validatorAddrs.length || 5;

  // Leader receipt info
  const leaderReceipt = txData?.consensus_data?.leader_receipt;
  const leaderExecResult = leaderReceipt?.execution_result || "";

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0a0a0a]/90 backdrop-blur flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-[#0a0a0a] border border-[#b6ff3b]/30 rounded-lg p-6 font-mono text-[#b6ff3b] shadow-[0_0_40px_rgba(182,255,59,0.1)] max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 border-b border-[#b6ff3b]/20 pb-4">
          <div className="font-bold tracking-widest uppercase text-sm">
            {isAppeal ? "Appeal Round" : "Consensus"}
            {numRounds > 0 && <span className="text-[#b6ff3b]/50 ml-2">Round {numRounds + 1}</span>}
          </div>
          <div className="flex items-center gap-3">
            {!done && !error && (
              <div className="flex space-x-1">
                <div className="w-2 h-2 rounded-full bg-[#b6ff3b] animate-pulse" />
                <div className="w-2 h-2 rounded-full bg-[#b6ff3b] animate-pulse delay-75" />
                <div className="w-2 h-2 rounded-full bg-[#b6ff3b] animate-pulse delay-150" />
              </div>
            )}
            {done && <span className="text-[#b6ff3b] text-sm">✓</span>}
            <button
              onClick={() => {
                if (pollRef.current) {
                  clearInterval(pollRef.current);
                  pollRef.current = null;
                }
                cleanupStorage();
                setHash(null);
                setError(null);
                setDone(false);
                setTxData(null);
                setActionName(null);
              }}
              className="w-6 h-6 flex items-center justify-center rounded border border-[#b6ff3b]/30 text-[#b6ff3b]/50 hover:text-[#b6ff3b] hover:border-[#b6ff3b]/60 transition-colors text-xs"
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Real Stage Progress */}
        <div className="space-y-3 mb-6">
          {STAGES.map((stage, idx) => {
            const active = idx === currentStage && !error && !done;
            const past = idx < currentStage || done;
            return (
              <div key={stage} className="flex items-center space-x-3">
                <div
                  className={`w-5 h-5 flex items-center justify-center rounded-full border text-[10px] ${
                    active
                      ? "border-[#b6ff3b] bg-[#b6ff3b]/20 animate-pulse"
                      : past
                        ? "border-[#b6ff3b] bg-[#b6ff3b]"
                        : "border-gray-800"
                  }`}
                >
                  {past && (
                    <svg className="w-3 h-3 text-[#0a0a0a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div
                  className={`${
                    active ? "text-[#b6ff3b] font-bold" : past ? "text-[#b6ff3b]/70" : "text-gray-700"
                  } uppercase text-xs tracking-wider`}
                >
                  {stage}
                </div>
                {/* Show progress for COMMITTING */}
                {stage === "COMMITTING" && active && votesCommitted > 0 && (
                  <span className="text-[10px] text-[#b6ff3b]/50">
                    {votesCommitted}/{totalValidators} committed
                  </span>
                )}
                {/* Show progress for REVEALING */}
                {stage === "REVEALING" && active && votesRevealed > 0 && (
                  <span className="text-[10px] text-[#b6ff3b]/50">
                    {votesRevealed}/{totalValidators} revealed
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Validator Votes — show when we have data and past COMMITTING */}
        {currentStage >= 3 && validatorVotes.length > 0 && (
          <div className="mb-5 bg-[#b6ff3b]/5 border border-[#b6ff3b]/10 rounded p-3">
            <div className="text-[10px] uppercase tracking-widest text-[#b6ff3b]/50 mb-2">
              Validator Votes {resultName && `• ${resultName.replace(/_/g, " ")}`}
            </div>
            <div className="space-y-1.5">
              {validatorAddrs.map((addr, i) => (
                <div key={addr} className="flex items-center justify-between text-[11px]">
                  <span className="text-[#b6ff3b]/60 font-mono">
                    {i === 0 ? "Leader " : `Val ${i}  `}
                    {addr.slice(0, 6)}…{addr.slice(-4)}
                  </span>
                  <VoteBadge vote={validatorVotes[i] || "IDLE"} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hash */}
        <div className="bg-[#b6ff3b]/5 border border-[#b6ff3b]/20 rounded p-3 text-xs break-all mb-4 flex flex-col gap-2">
          <span>{hash}</span>
          <a
            href={`https://explorer-Studio Next.genlayer.com/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] uppercase underline opacity-70 hover:opacity-100"
          >
            View in Explorer ↗
          </a>
        </div>

        {!done && !error && (
          <div className="text-center text-[10px] text-[#b6ff3b]/50 mb-4 uppercase">
            Do not close this window
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded text-sm break-words">
            <span className="font-bold block mb-1">FINISHED_WITH_ERROR</span>
            {error}
            <div className="mt-4 text-center">
              <button
                className="px-4 py-2 border border-red-400 text-red-400 hover:bg-red-400/10 uppercase tracking-widest text-xs rounded"
                onClick={() => {
                  cleanupStorage();
                  setHash(null);
                  setError(null);
                  setDone(false);
                  setTxData(null);
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Success */}
        {done && (
          <div className="text-center">
            <div className="inline-flex items-center space-x-2 bg-[#b6ff3b]/20 text-[#b6ff3b] px-4 py-2 rounded">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-bold tracking-widest uppercase">Finalized</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
