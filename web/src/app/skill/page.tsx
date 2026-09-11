"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet";
import { views, writes } from "@/lib/contract";
import { TxButton } from "@/components/TxButton";
import { PageHero } from "@/components/PageHero";

export default function SkillPage() {
  const { client } = useWallet();
  const [jobId, setJobId] = useState("");
  const [url, setUrl] = useState("");
  const [out, setOut] = useState<string>("");
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageHero
        kicker="SKILL // makewhole-surety"
        title="Surety Skill"
        lede="Four tools. The skill never sends GEN. Preflight: if not check_bond(job).bonded: raise SystemExit(1)."
      />
      <pre className="bg-[#0a0a0a] text-lime-400 p-6 rounded-xl font-label-code text-label-code overflow-x-auto">
{`# copy skills/makewhole-surety/ into your agent skills dir
from makewhole import check_bond, ack_hop, adjudicate, get_settlement

info = check_bond(job_id)
if not info.get("bonded"):
    raise SystemExit(1)  # do not burn compute
# empty MAKEWHOLE_CONTRACT → bonded=false, reason=NO_CONTRACT
`}
      </pre>
      <div className="grid md:grid-cols-2 gap-6 mt-8">
        <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-3">
          <label className="font-label-code text-[12px]">job_id</label>
          <input className="w-full border border-outline-variant px-pad-sm py-pad-xs font-label-code text-[12px]" value={jobId} onChange={(e) => setJobId(e.target.value)} />
          <label className="font-label-code text-[12px]">deliverable / publish URL</label>
          <input className="w-full border border-outline-variant px-pad-sm py-pad-xs font-label-code text-[12px]" value={url} onChange={(e) => setUrl(e.target.value)} />
          <div className="flex flex-wrap gap-pad-sm">
            <button className="px-pad-sm py-pad-xs bg-white border border-primary font-label-code text-[12px]" onClick={async () => setOut(JSON.stringify(await views.checkBond(client, jobId), null, 2))}>
              check_bond
            </button>
            <TxButton label="ack_hop" onClick={() => writes.ack(client, jobId, url)} />
            <TxButton label="adjudicate" onClick={() => writes.adjudicate(client, jobId)} />
            <button className="px-pad-sm py-pad-xs bg-white border border-primary font-label-code text-[12px]" onClick={async () => setOut(JSON.stringify(await views.getSettlement(client, jobId), null, 2))}>
              get_settlement
            </button>
          </div>
        </div>
        <pre className="bg-surface-container-low p-pad-md font-label-code text-[12px] min-h-[240px] overflow-auto">{out || "view output"}</pre>
      </div>
    </div>
  );
}
