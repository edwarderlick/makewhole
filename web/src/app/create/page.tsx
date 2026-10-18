"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { views, writes } from "@/lib/contract";
import { tryParseGen, formatGen } from "@/lib/format";
import {
  computeDeadline,
  validateJobRoles,
  validatePublicBriefUrl,
  DEADLINE_PRESETS,
} from "@/lib/create-preflight";
import { TxButton } from "@/components/TxButton";
import { PageHero } from "@/components/PageHero";
import feeProfiles from "@/lib/fee-profile.json";

export default function CreatePage() {
  const { client, account } = useWallet();
  const router = useRouter();

  if (typeof window !== "undefined") {
    console.log("[create] CONTRACT_ADDRESS =", process.env.NEXT_PUBLIC_CONTRACT_ADDRESS);
  }

  const [brief, setBrief] = useState(
    "https://gist.githubusercontent.com/edwarderlick/2f257c8245678df54a30b4c319469f20/raw/brief.md"
  );
  const [writer, setWriter] = useState("");
  const [publisher, setPublisher] = useState("");
  const [payB, setPayB] = useState("0.2");
  const [payC, setPayC] = useState("0.2");
  const [premium, setPremium] = useState("0.05");
  // Default and minimum selectable preset is 2 Hours (7200 seconds)
  const [deadlineOffset, setDeadlineOffset] = useState<number>(7200);
  const [kind, setKind] = useState("write");

  const parsedB = tryParseGen(payB);
  const parsedC = tryParseGen(payC);
  const parsedP = tryParseGen(premium);

  const bError =
    parsedB === null
      ? "Invalid GEN amount"
      : parsedB <= 0n
      ? "pay_b must be greater than zero"
      : null;

  const cError =
    parsedC === null
      ? "Invalid GEN amount"
      : parsedC <= 0n
      ? "pay_c must be greater than zero"
      : null;

  const pError =
    parsedP === null
      ? "Invalid GEN amount"
      : parsedP < 0n
      ? "premium cannot be negative"
      : null;

  const areAmountsValid =
    parsedB !== null &&
    parsedB > 0n &&
    parsedC !== null &&
    parsedC > 0n &&
    parsedP !== null &&
    parsedP >= 0n;

  const totalEscrow = areAmountsValid ? parsedB! + parsedC! + parsedP! : null;

  // Preflight validation for Brief URL
  const briefCheck = validatePublicBriefUrl(brief);
  const briefError = !brief.trim()
    ? "Brief URL is required"
    : !briefCheck.ok
    ? briefCheck.error
    : null;

  // Preflight validation for Roles & Addresses
  const roleCheck = validateJobRoles(account, writer, publisher);
  const writerError = writer.trim() ? roleCheck.errors.writer : null;
  const publisherError = publisher.trim() ? roleCheck.errors.publisher : null;
  const clientError = roleCheck.errors.client;

  const isFormValid = areAmountsValid && briefCheck.ok && roleCheck.valid;

  const [quoteStr, setQuoteStr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!client || !isFormValid || totalEscrow === null) {
      setQuoteStr(null);
      return;
    }
    (async () => {
      try {
        const opts = (feeProfiles as any)["create_job"]?.distribution;
        if (!opts) return;
        const distOptions = { ...opts };
        if (typeof distOptions.rotations === "string" || typeof distOptions.rotations === "number") {
          distOptions.rotations = [distOptions.rotations];
        }
        const quote = await client.estimateTransactionFees(distOptions);
        if (active && quote) {
          setQuoteStr(`Escrow ${formatGen(totalEscrow)} GEN`);
        }
      } catch {
        if (active) setQuoteStr(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, isFormValid, totalEscrow]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageHero
        kicker="MKW_ORCHESTRATOR / PIPELINE_INIT"
        title="Create job"
        lede="Escrow pay_b + pay_c + premium. Evidence must be public HTTPS. The UI does not assign job IDs - the contract hashes the transaction."
      />
      <div className="grid lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
          <div>
            <Field
              label="Public brief URL"
              value={brief}
              onChange={setBrief}
              placeholder="https://gist.githubusercontent.com/..."
            />
            {briefError && (
              <p className="text-[11px] text-error font-label-code mt-1">{briefError}</p>
            )}
          </div>

          <div>
            <Field
              label="Writer B (0x)"
              value={writer}
              onChange={setWriter}
              placeholder="0x..."
            />
            {writerError && (
              <p className="text-[11px] text-error font-label-code mt-1">{writerError}</p>
            )}
          </div>

          <div>
            <Field
              label="Publisher C (0x)"
              value={publisher}
              onChange={setPublisher}
              placeholder="0x..."
            />
            {publisherError && (
              <p className="text-[11px] text-error font-label-code mt-1">{publisherError}</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-pad-sm">
            <div>
              <Field label="pay_b GEN" value={payB} onChange={setPayB} />
              {bError && <p className="text-[11px] text-error font-label-code mt-1">{bError}</p>}
            </div>
            <div>
              <Field label="pay_c GEN" value={payC} onChange={setPayC} />
              {cError && <p className="text-[11px] text-error font-label-code mt-1">{cError}</p>}
            </div>
            <div>
              <Field label="premium GEN" value={premium} onChange={setPremium} />
              {pError && <p className="text-[11px] text-error font-label-code mt-1">{pError}</p>}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-on-surface mb-1 font-label-code">
              Deadline preset
            </label>
            <select
              suppressHydrationWarning
              className="w-full bg-surface border border-surface-variant rounded-md px-3 py-2 text-on-surface font-label-code focus:outline-none focus:ring-1 focus:ring-primary"
              value={deadlineOffset}
              onChange={(e) => setDeadlineOffset(Number(e.target.value))}
            >
              {DEADLINE_PRESETS.map((preset) => (
                <option key={preset.offsetSeconds} value={preset.offsetSeconds}>
                  {preset.label}
                </option>
              ))}
            </select>
            <p className="mt-1 font-label-code text-[11px] text-on-surface-variant">
              The Intelligent Contract enforces deadline &ge; 1 hour at execution (trusted chain time + 3600s). The UI requires at least 2 hours to provide submission and consensus safety margin.
            </p>
          </div>

          <Field label="Hop label (UI only)" value={kind} onChange={setKind} />
          <p className="font-label-code text-[11px] text-on-surface-variant">
            Hop labels never change payout splits.
          </p>

          {clientError && (
            <div className="p-4 bg-amber-50 text-amber-900 border border-amber-300 rounded-md text-[12px] font-label-code">
              {clientError}
            </div>
          )}

          <TxButton
            label={
              quoteStr ||
              (totalEscrow !== null
                ? `Escrow ${formatGen(totalEscrow)} GEN`
                : "Escrow create_job")
            }
            disabled={!isFormValid}
            onClick={async () => {
              if (
                !areAmountsValid ||
                totalEscrow === null ||
                !parsedB ||
                !parsedC ||
                parsedP === null
              ) {
                throw new Error("Invalid amounts entered");
              }

              const currentBriefCheck = validatePublicBriefUrl(brief);
              if (!currentBriefCheck.ok) {
                throw new Error(currentBriefCheck.error);
              }

              const currentRoleCheck = validateJobRoles(account, writer, publisher);
              if (!currentRoleCheck.valid) {
                const firstErr =
                  currentRoleCheck.errors.writer ||
                  currentRoleCheck.errors.publisher ||
                  currentRoleCheck.errors.client ||
                  "Invalid job roles";
                throw new Error(firstErr);
              }

              const oldIds = await views.listIds(client);
              if (!oldIds || !Array.isArray(oldIds)) {
                throw new Error("Failed to read current job list. Please try again.");
              }
              sessionStorage.setItem("mw:tx_create_old_len", oldIds.length.toString());

              // Calculate deadline immediately at click time (not stale render time)
              const nowSeconds = Math.floor(Date.now() / 1000);
              const deadline = computeDeadline(nowSeconds, deadlineOffset);

              const tx = (await writes.createJob(
                client,
                currentBriefCheck.url,
                parsedB,
                parsedC,
                parsedP,
                deadline,
                writer.trim(),
                publisher.trim(),
                totalEscrow
              )) as any;
              sessionStorage.setItem("mw:tx_action", "create_job");
              return tx?.hash || tx;
            }}
          />
        </div>

        <div className="lg:col-span-5 bg-[#0a0a0a] text-white p-6 rounded-xl">
          <div className="font-label-status text-secondary-container">DAG // 3-HOP</div>
          <ol className="mt-pad-md space-y-pad-md font-body-sm">
            <li>01 RESEARCH - client A (you)</li>
            <li>02 WRITE - bonded writer B</li>
            <li>03 PUBLISH - publisher C still gets paid on rug</li>
          </ol>
          <p className="mt-pad-lg font-label-code text-[12px] text-on-primary-container">
            Cancel is available only before submit. After submit the vault holds until adjudicate or UNDETERMINED retry.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="font-label-code text-[12px] text-on-surface-variant">{label}</span>
      <input
        suppressHydrationWarning
        className="mt-pad-2xs w-full border border-outline-variant px-pad-sm py-pad-xs font-label-code text-[12px] focus:border-primary outline-none"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
