"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { views, writes } from "@/lib/contract";
import { parseGen } from "@/lib/format";
import { TxButton } from "@/components/TxButton";
import { PageHero } from "@/components/PageHero";

export default function CreatePage() {
  const { client } = useWallet();
  const router = useRouter();
  const [brief, setBrief] = useState(
    "https://gist.githubusercontent.com/edwarderlick/2f257c8245678df54a30b4c319469f20/raw/brief.md"
  );
  const [writer, setWriter] = useState("");
  const [publisher, setPublisher] = useState("");
  const [payB, setPayB] = useState("20");
  const [payC, setPayC] = useState("12.5");
  const [premium, setPremium] = useState("2.5");
  const [deadlineOffset, setDeadlineOffset] = useState(86400);
  const [kind, setKind] = useState("write");
  const b = parseGen(payB);
  const c = parseGen(payC);
  const p = parseGen(premium);
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageHero
        kicker="MKW_ORCHESTRATOR / PIPELINE_INIT"
        title="Create job"
        lede="Escrow pay_b + pay_c + premium. Evidence must be public HTTPS. The UI does not assign job IDs — the contract hashes the transaction."
      />
      <div className="grid lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
          <Field label="Public brief URL" value={brief} onChange={setBrief} placeholder="https://gist.githubusercontent.com/…" />
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
              className="w-full bg-surface border border-surface-variant rounded-md px-3 py-2 text-on-surface font-label-code focus:outline-none focus:ring-1 focus:ring-primary"
              value={deadlineOffset}
              onChange={(e) => setDeadlineOffset(Number(e.target.value))}
            >
              <option value={300}>5 Minutes</option>
              <option value={3600}>1 Hour</option>
              <option value={86400}>1 Day</option>
            </select>
          </div>
          <Field label="Hop label (UI only)" value={kind} onChange={setKind} />
          <p className="font-label-code text-[11px] text-on-surface-variant">Hop labels never change payout splits.</p>
          <TxButton
            label="Escrow create_job"
            onClick={async () => {
              const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineOffset);
              const tx = await writes.createJob(client, brief, b, c, p, deadline, writer, publisher, kind, b + c + p);
              try {
                const ids: string[] = (await views.listIds(client)) || [];
                const last = ids[ids.length - 1];
                if (last) {
                  router.push(`/job/${last}`);
                  return tx;
                }
              } catch {
                /* fall through */
              }
              router.push("/browse");
              return tx;
            }}
          />
        </div>
        <div className="lg:col-span-5 bg-[#0a0a0a] text-white p-6 rounded-xl">
          <div className="font-label-status text-secondary-container">DAG // 3-HOP</div>
          <ol className="mt-pad-md space-y-pad-md font-body-sm">
            <li>01 RESEARCH — client A (you)</li>
            <li>02 WRITE — bonded writer B</li>
            <li>03 PUBLISH — publisher C still gets paid on rug</li>
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
        className="mt-pad-2xs w-full border border-outline-variant px-pad-sm py-pad-xs font-label-code text-[12px] focus:border-primary outline-none"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
