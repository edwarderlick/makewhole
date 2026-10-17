"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@/lib/wallet";
import { views, writes, hasLiveContract, CONTRACT_ADDRESS } from "@/lib/contract";
import { formatGen, tryParseGen, shortAddr } from "@/lib/format";
import { PageHero } from "@/components/PageHero";
import { TxButton } from "@/components/TxButton";

export default function VaultPage() {
  const { client, account, connect, connecting } = useWallet();

  const [totalBond, setTotalBond] = useState<string | null>(null);
  const [reservedBond, setReservedBond] = useState<string | null>(null);
  const [availableBond, setAvailableBond] = useState<string | null>(null);
  const [credit, setCredit] = useState<string | null>(null);
  const [rep, setRep] = useState<number | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [postBondVal, setPostBondVal] = useState<string>("1.0");
  const [postBondError, setPostBondError] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isContractReady = hasLiveContract();

  // Clear stale balances immediately upon account or network changes
  useEffect(() => {
    setTotalBond(null);
    setReservedBond(null);
    setAvailableBond(null);
    setCredit(null);
    setRep(null);
    setReadError(null);
    setFeedbackMsg(null);
  }, [account, client, isContractReady]);

  const loadData = useCallback(async () => {
    if (!client || !account || !isContractReady) {
      return;
    }
    setLoading(true);
    setReadError(null);
    try {
      const [tot, res, avail, cred, r] = await Promise.all([
        views.getBond(client, account),
        views.getReservedBond(client, account),
        views.getAvailableBond(client, account),
        views.getCredit(client, account),
        views.getRep(client, account),
      ]);
      setTotalBond(String(tot ?? "0"));
      setReservedBond(String(res ?? "0"));
      setAvailableBond(String(avail ?? "0"));
      setCredit(String(cred ?? "0"));
      setRep(typeof r === "number" ? r : Number(r ?? 0));
    } catch (e: any) {
      console.error("[Vault] loadData failed:", e);
      setReadError(e?.message || "Failed to read live collateral balances from RPC");
    } finally {
      setLoading(false);
    }
  }, [client, account, isContractReady]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePostBondValidation = (val: string) => {
    setPostBondVal(val);
    setFeedbackMsg(null);
    const trimmed = val.trim();
    if (!trimmed) {
      setPostBondError("Enter an amount in GEN");
      return;
    }
    const parsed = tryParseGen(trimmed);
    if (parsed === null) {
      setPostBondError("Invalid GEN amount. Enter a positive decimal number.");
    } else if (parsed <= 0n) {
      setPostBondError("Amount must be greater than 0");
    } else {
      setPostBondError(null);
    }
  };

  const hasAvailableToUnbond = (() => {
    if (availableBond === null) return false;
    try {
      return BigInt(availableBond) > 0n;
    } catch {
      return false;
    }
  })();

  const hasCreditsToWithdraw = (() => {
    if (credit === null) return false;
    try {
      return BigInt(credit) > 0n;
    } catch {
      return false;
    }
  })();

  const parsedPostBond = tryParseGen(postBondVal);
  const isPostBondValid = parsedPostBond !== null && parsedPostBond > 0n;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageHero
        kicker="SURETY COLLATERAL VAULT — PER-JOB RESERVATION MODEL"
        title="Writer Collateral Dashboard"
        lede="Inspect and manage your collateral balances in the Makewhole v2 Surety Vault. In Makewhole v2, bond is reserved per-job in exact alignment with downstream pay_c liabilities. Available collateral can be unbonded at any time without waiting for active jobs to finish."
      />

      {/* Contract not configured banner */}
      {!isContractReady && (
        <div className="mb-8 p-4 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 font-label-code text-sm">
          <strong>CONTRACT_NOT_CONFIGURED:</strong> NEXT_PUBLIC_CONTRACT_ADDRESS is not set to a valid contract address. Collateral vault reads and writes are unavailable until configured.
        </div>
      )}

      {/* Disconnected state banner */}
      {isContractReady && !account && (
        <div className="mb-8 p-6 bg-surface-container-low border border-neutral-300 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-primary">Wallet Disconnected</div>
            <p className="text-sm text-neutral-600 mt-1">
              Connect your Web3 wallet to inspect your total bond, active reservations, unbondable balance, and pull-payment credits.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void connect()}
            disabled={connecting}
            className="px-6 py-2.5 bg-black hover:bg-neutral-800 text-white rounded-md text-xs font-semibold uppercase tracking-wider transition-colors shadow-sm whitespace-nowrap"
          >
            {connecting ? "Connecting..." : "Connect Wallet"}
          </button>
        </div>
      )}

      {/* RPC / Read Error Banner */}
      {readError && (
        <div className="mb-8 p-4 bg-error-container text-on-error-container border border-error/20 rounded-lg font-label-code text-sm flex items-center justify-between gap-4">
          <div>
            <strong>RPC_READ_ERROR:</strong> {readError}
          </div>
          <button
            onClick={loadData}
            className="px-3 py-1 bg-white border border-error text-error text-xs uppercase font-semibold rounded hover:bg-neutral-50 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Transaction Feedback */}
      {feedbackMsg && (
        <div
          className={`mb-6 p-4 rounded-lg font-label-code text-sm ${
            feedbackMsg.type === "success"
              ? "bg-lime-50 border border-lime-300 text-lime-900"
              : "bg-error-container text-on-error-container border border-error/20"
          }`}
        >
          {feedbackMsg.text}
        </div>
      )}

      {/* Live Balances Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="border border-neutral-200 bg-white rounded-xl p-5 shadow-sm">
          <div className="text-[11px] font-mono font-medium tracking-wider text-neutral-500 uppercase">
            Total Bond
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-primary min-h-[32px] flex items-center">
            {!account || !isContractReady ? (
              "—"
            ) : totalBond === null || loading ? (
              <span className="inline-block animate-pulse text-neutral-400 font-mono text-lg">Loading...</span>
            ) : (
              `${formatGen(totalBond, 3)} GEN`
            )}
          </div>
          <div className="mt-1 text-[11px] text-neutral-500 font-mono">
            On-chain total deposited bond
          </div>
        </div>

        <div className="border border-neutral-200 bg-white rounded-xl p-5 shadow-sm">
          <div className="text-[11px] font-mono font-medium tracking-wider text-neutral-500 uppercase">
            Reserved Collateral
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-amber-600 min-h-[32px] flex items-center">
            {!account || !isContractReady ? (
              "—"
            ) : reservedBond === null || loading ? (
              <span className="inline-block animate-pulse text-neutral-400 font-mono text-lg">Loading...</span>
            ) : (
              `${formatGen(reservedBond, 3)} GEN`
            )}
          </div>
          <div className="mt-1 text-[11px] text-neutral-500 font-mono">
            Locked across active jobs
          </div>
        </div>

        <div className="border border-neutral-200 bg-white rounded-xl p-5 shadow-sm">
          <div className="text-[11px] font-mono font-medium tracking-wider text-neutral-500 uppercase">
            Available to Unbond
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-lime-700 min-h-[32px] flex items-center">
            {!account || !isContractReady ? (
              "—"
            ) : availableBond === null || loading ? (
              <span className="inline-block animate-pulse text-neutral-400 font-mono text-lg">Loading...</span>
            ) : (
              `${formatGen(availableBond, 3)} GEN`
            )}
          </div>
          <div className="mt-1 text-[11px] text-neutral-500 font-mono">
            Total minus active reservations
          </div>
        </div>

        <div className="border border-neutral-200 bg-white rounded-xl p-5 shadow-sm">
          <div className="text-[11px] font-mono font-medium tracking-wider text-neutral-500 uppercase">
            Pull-Payment Credits
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-indigo-700 min-h-[32px] flex items-center">
            {!account || !isContractReady ? (
              "—"
            ) : credit === null || loading ? (
              <span className="inline-block animate-pulse text-neutral-400 font-mono text-lg">Loading...</span>
            ) : (
              `${formatGen(credit, 3)} GEN`
            )}
          </div>
          <div className="mt-1 text-[11px] text-neutral-500 font-mono">
            Pending refunds / missed transfers
          </div>
        </div>

        <div className="border border-neutral-200 bg-white rounded-xl p-5 shadow-sm">
          <div className="text-[11px] font-mono font-medium tracking-wider text-neutral-500 uppercase">
            Writer Reputation
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-neutral-800 min-h-[32px] flex items-center">
            {!account || !isContractReady ? (
              "—"
            ) : rep === null || loading ? (
              <span className="inline-block animate-pulse text-neutral-400 font-mono text-lg">Loading...</span>
            ) : (
              rep
            )}
          </div>
          <div className="mt-1 text-[11px] text-neutral-500 font-mono">
            Protocol reputation score
          </div>
          <p className="mt-2 text-[10px] text-neutral-400 font-mono leading-normal">
            Initialized to 1 upon bonding; decremented on writer fault. Does not represent settlement count.
          </p>
        </div>
      </div>

      {/* Account Info and Actions Grid */}
      {account && isContractReady && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
          {/* Action 1: Post Bond */}
          <div className="border border-neutral-200 bg-white rounded-xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-label-status text-xs font-bold text-primary">POST COLLATERAL</span>
                <span className="text-[10px] font-mono text-neutral-400">write: post_bond</span>
              </div>
              <p className="text-xs text-neutral-600 mb-4">
                Deposit native GEN into your writer collateral account. Posted bond becomes immediately available to back incoming jobs.
              </p>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                GEN Amount to Deposit
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={postBondVal}
                  onChange={(e) => handlePostBondValidation(e.target.value)}
                  placeholder="e.g. 1.0"
                  className="w-full px-3 py-2 border border-neutral-300 rounded font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="absolute right-3 top-2.5 text-xs text-neutral-400 font-mono">GEN</span>
              </div>
              {postBondError && (
                <p className="text-[11px] font-mono text-red-600 mt-1">{postBondError}</p>
              )}
            </div>
            <div className="mt-6">
              <TxButton
                label={`Post ${postBondVal || "0"} GEN Bond`}
                disabled={Boolean(postBondError) || !isPostBondValid}
                onClick={async () => {
                  if (!isPostBondValid || !parsedPostBond) throw new Error("Invalid deposit amount");
                  return writes.postBond(client, parsedPostBond);
                }}
              />
            </div>
          </div>

          {/* Action 2: Unbond Available */}
          <div className="border border-neutral-200 bg-white rounded-xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-label-status text-xs font-bold text-primary">UNBOND AVAILABLE</span>
                <span className="text-[10px] font-mono text-neutral-400">write: unbond</span>
              </div>
              <p className="text-xs text-neutral-600 mb-4">
                Withdraw all currently unreserved bond back to your wallet. You do not need to wait for active jobs to complete.
              </p>
              <div className="p-3 bg-neutral-50 rounded border border-neutral-200 font-mono text-xs space-y-1 mb-4">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Unbondable:</span>
                  <span className="font-bold text-lime-700">{formatGen(availableBond, 4)} GEN</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Locked in jobs:</span>
                  <span className="font-bold text-amber-600">{formatGen(reservedBond, 4)} GEN</span>
                </div>
              </div>
            </div>
            <div className="mt-6">
              <TxButton
                label={`Unbond ${formatGen(availableBond, 2)} GEN`}
                variant="ghost"
                disabled={!hasAvailableToUnbond}
                onClick={async () => {
                  if (!hasAvailableToUnbond) throw new Error("No available bond to unbond");
                  return writes.unbond(client);
                }}
              />
            </div>
          </div>

          {/* Action 3: Withdraw Pull-Payment Credits */}
          <div className="border border-neutral-200 bg-white rounded-xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-label-status text-xs font-bold text-primary">PULL-PAYMENT CREDITS</span>
                <span className="text-[10px] font-mono text-neutral-400">write: withdraw</span>
              </div>
              <p className="text-xs text-neutral-600 mb-4">
                Withdraw native GEN stored in the contract’s pull-payment credit ledger (generated when direct native transfer emissions cannot be finalized).
              </p>
              <div className="p-3 bg-neutral-50 rounded border border-neutral-200 font-mono text-xs space-y-1 mb-4">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Credit Balance:</span>
                  <span className="font-bold text-indigo-700">{formatGen(credit, 4)} GEN</span>
                </div>
                <div className="text-[11px] text-neutral-400">
                  Transfers directly to {shortAddr(account)}
                </div>
              </div>
            </div>
            <div className="mt-6">
              <TxButton
                label={`Withdraw ${formatGen(credit, 2)} GEN Credits`}
                variant="primary"
                disabled={!hasCreditsToWithdraw}
                onClick={async () => {
                  if (!hasCreditsToWithdraw) throw new Error("No credits to withdraw");
                  return writes.withdraw(client);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Explanations of v2 Reservation Mechanics */}
      <div className="border border-neutral-200 bg-white rounded-xl p-8 shadow-sm">
        <h2 className="font-headline-sm text-lg font-bold text-primary mb-4">
          Makewhole v2 Collateral Reservation Architecture
        </h2>
        <div className="grid md:grid-cols-2 gap-6 text-sm text-neutral-700">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-mono font-bold text-xs mt-0.5">
                1
              </span>
              <div>
                <strong className="text-primary block mb-1">Exact per-job reservation</strong>
                Each job requires writer B to hold sufficient unreserved collateral to back downstream publisher C. When a job enters BONDED, it reserves exactly its <code>pay_c</code> liability.
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-mono font-bold text-xs mt-0.5">
                2
              </span>
              <div>
                <strong className="text-primary block mb-1">Available collateral is unbondable during active jobs</strong>
                Unlike protocols that lock an account’s entire collateral until all jobs finish, Makewhole allows writers to unbond any collateral in excess of active reservations at any time.
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-mono font-bold text-xs mt-0.5">
                3
              </span>
              <div>
                <strong className="text-primary block mb-1">Reserved collateral is non-withdrawable</strong>
                Collateral reserved for an active job (<code>BONDED</code>, <code>IN_FLIGHT</code>, <code>ACKED</code>, <code>UNDETERMINED</code>) cannot be unbonded until the job completes or expires.
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-mono font-bold text-xs mt-0.5">
                4
              </span>
              <div>
                <strong className="text-primary block mb-1">No collateral multiplexing</strong>
                A single bond reservation cannot back multiple jobs concurrently. Every in-flight obligation has dedicated 1:1 backing, guaranteeing downstream publisher solvency.
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-mono font-bold text-xs mt-0.5">
                5
              </span>
              <div>
                <strong className="text-primary block mb-1">Targeted slashing on fault</strong>
                If writer B rugs a job (<code>SETTLED_RUG</code>), only the affected job’s reserved collateral (<code>pay_c</code>) is slashed to pay publisher C. The writer’s other bond and reservations remain completely untouched.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
