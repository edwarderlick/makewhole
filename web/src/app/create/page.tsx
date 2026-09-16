"use client";

function getAddress(addr: string) {
  if (!addr) return "";
  return addr.toLowerCase();
}
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { views, writes } from "@/lib/contract";
import { parseGen, formatGen } from "@/lib/format";
import { TxButton } from "@/components/TxButton";
import { PageHero } from "@/components/PageHero";
import feeProfiles from "@/lib/fee-profile.json";

export default function CreatePage() {
  const { client, account } = useWallet();
  const router = useRouter();
  // Log contract address so we can verify which deployment is live
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
  const [deadlineOffset, setDeadlineOffset] = useState(900);
  const [kind, setKind] = useState("write");
  const b = parseGen(payB);
  const c = parseGen(payC);
  const p = parseGen(premium);

  const isWriter = account && writer && getAddress(account) === getAddress(writer);
  const isPublisher = account && publisher && getAddress(account) === getAddress(publisher);
  const conflict = isWriter || isPublisher;


  const [quoteStr, setQuoteStr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!client) return;
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
          const total = b + c + p;
          setQuoteStr(`Escrow ${formatGen(total)} GEN`);
        }
      } catch(e) {}
    })();
    return () => { active = false; };
  }, [client, payB, payC, premium]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageHero
        kicker="MKW_ORCHESTRATOR / PIPELINE_INIT"
        title="Create job"
        lede="Escrow pay_b + pay_c + premium. Evidence must be public HTTPS. The UI does not assign job IDs - the contract hashes the transaction."
      />
      <div className="grid lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
          <Field label="Public brief URL" value={brief} onChange={setBrief} placeholder="https://gist.githubusercontent.com/..." />
          <Field label="Writer B (0x)" value={writer} onChange={setWriter} />
          <Field label="Publisher C (0x)" value={publisher} onChange={setPublisher} />
          <div className="grid grid-cols-3 gap-pad-sm">
            <Field label="pay_b GEN" value={payB} onChange={setPayB} />
            <Field label="pay_c GEN" value={payC} onChange={setPayC} />
            <Field label="premium GEN" value={premium} onChange={setPremium} />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-on-surface mb-1 font-label-code">deadline preset</label>
            <select
              suppressHydrationWarning
              className="w-full bg-surface border border-surface-variant rounded-md px-3 py-2 text-on-surface font-label-code focus:outline-none focus:ring-1 focus:ring-primary"
              value={deadlineOffset}
              onChange={(e) => setDeadlineOffset(Number(e.target.value))}
            >
              <option value={900}>15 Minutes</option>
              <option value={3600}>1 Hour</option>
              <option value={86400}>1 Day</option>
            </select>
          </div>
          <Field label="Hop label (UI only)" value={kind} onChange={setKind} />
          <p className="font-label-code text-[11px] text-on-surface-variant">Hop labels never change payout splits.</p>

          {conflict ? (
            <div className="p-4 bg-error/10 text-error rounded-md text-[12px] font-label-code">
              You are connected as Account A, but you pasted your own address into B or C. A, B, and C must be distinct. Switch MetaMask to Client A, or paste different addresses.
            </div>
          ) : (
            <TxButton
              label={quoteStr || "Escrow create_job"}
              onClick={async () => {
              // Ban makewhole/fixtures URLs
              if (brief.includes("/makewhole/fixtures") || brief.includes("makewhole/fixtures")) {
                throw new Error("[EXPECTED] Use a real public gist URL. The makewhole/fixtures URL is banned.");
              }

              const oldIds = await views.listIds(client);
              if (!oldIds || !Array.isArray(oldIds)) {
                 throw new Error("Failed to read current job list. Please try again.");
              }
              sessionStorage.setItem("mw:tx_create_old_len", oldIds.length.toString());
              const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineOffset);
              const tx = await writes.createJob(client, brief, b, c, p, deadline, writer, publisher, b + c + p) as any;
              sessionStorage.setItem("mw:tx_action", "create_job");
              return tx?.hash || tx;
            }}
          />
          )}
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

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
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
