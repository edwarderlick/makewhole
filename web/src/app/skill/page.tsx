"use client";
import { useEffect, useState } from "react";
import { PageHero } from "@/components/PageHero";

export default function SkillPage() {
  const [demoUrl, setDemoUrl] = useState("");
  const [demoResponse, setDemoResponse] = useState<string | null>(null);

  useEffect(() => {
    // In a real app we'd fetch from /proofs to get a demo ID. 
    // Here we'll just use a placeholder to show the shape if none found,
    // or you could replace this with a real id from the chain.
    const base = typeof window !== "undefined" && window.location.hostname !== "localhost"
      ? window.location.origin
      : "https://makewhole.vercel.app";
    const url = `${base}/api/skill/check_bond?job=1`;
    setDemoUrl(url);
  }, []);

  const testDemo = async () => {
    try {
      setDemoResponse("Fetching...");
      const r = await fetch(demoUrl);
      const data = await r.json();
      setDemoResponse(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setDemoResponse(`Error: ${e.message}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pb-24">
      <PageHero
        kicker="AGENT_DOCS // SKILL"
        title="Agentic Surety Skill"
        lede="Before spinning up your GPUs or executing expensive inference, your agent MUST call this endpoint. Fail closed if not bonded."
      />

      <div className="space-y-12 text-on-surface mt-8">
        <section className="bg-white border border-neutral-200 rounded-xl p-6 shadow-sm">
          <h2 className="font-headline-sm tracking-widest uppercase mb-4 text-[#65a30d]">Read-Only Endpoint</h2>
          <p className="font-body-md text-neutral-600 mb-6">
            The intelligent contract is the ultimate judge. The agent only reads from it. NEVER send GEN to a client or try to execute <code className="bg-gray-100 text-red-600 px-1 rounded">writeContract</code> via the skill. 
          </p>
          
          <div className="bg-[#0a0a0a] rounded-lg overflow-hidden border border-neutral-800">
             <div className="bg-neutral-900 px-4 py-2 flex items-center border-b border-neutral-800">
               <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-400">cURL Example</span>
             </div>
             <div className="p-4 overflow-x-auto text-sm font-mono text-[#b6ff3b]">
               <pre><code>curl -X GET "{demoUrl || 'https://.../api/skill/check_bond?job=...'}"</code></pre>
             </div>
          </div>
        </section>

        <section className="bg-white border border-neutral-200 rounded-xl p-6 shadow-sm">
          <h2 className="font-headline-sm tracking-widest uppercase mb-4 text-[#65a30d]">Live Test</h2>
          <div className="flex items-center space-x-4 mb-4">
             <input type="text" value={demoUrl} onChange={(e) => setDemoUrl(e.target.value)} className="flex-1 font-mono text-sm px-3 py-2 border border-neutral-300 rounded" />
             <button onClick={testDemo} className="bg-black hover:bg-neutral-800 text-white uppercase tracking-wider text-xs px-4 py-2 rounded font-bold">Test</button>
          </div>
          
          {demoResponse && (
            <div className="bg-[#0a0a0a] rounded-lg overflow-hidden border border-neutral-800">
               <div className="bg-neutral-900 px-4 py-2 flex items-center border-b border-neutral-800">
                 <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-400">Response</span>
               </div>
               <div className="p-4 overflow-x-auto text-sm font-mono text-white">
                 <pre><code>{demoResponse}</code></pre>
               </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
