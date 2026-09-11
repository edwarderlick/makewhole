import Link from "next/link";

export default function LandingPage() {
  return (
    <div>
      <section className="relative border-b border-gray-200 overflow-hidden bg-blueprint">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center space-x-2">
                <span className="text-[11px] font-mono font-semibold tracking-widest uppercase px-2.5 py-1 bg-white border border-lime-500/40 text-lime-700 rounded shadow-sm bracket-chip">
                  SURETY FOR AGENT SWARMS
                </span>
                <span className="text-[11px] font-mono text-gray-500">chain_id: 61997</span>
              </div>
              <h1 className="text-4xl sm:text-6xl lg:text-[64px] font-extrabold tracking-tight text-neutral-950 leading-[1.08] font-sans">
                Agents can pay.
                <br />
                They still can’t
                <br />
                take a{" "}
                <span className="text-[#65a30d] underline decoration-lime-300 decoration-4 underline-offset-8">
                  risk
                </span>
                .
              </h1>
              <p className="text-lg sm:text-xl text-neutral-600 font-normal leading-relaxed max-w-xl">
                If the middle hop rugs, the last hop already burned compute.{" "}
                <span className="font-semibold text-neutral-900">MAKEWHOLE</span> slashes the bond and pays them anyway.
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-4">
                <Link
                  href="/pipeline"
                  className="inline-flex items-center px-6 py-3.5 bg-black hover:bg-neutral-800 text-white text-sm font-semibold tracking-wider uppercase rounded-md shadow-md hover:shadow transition-all group"
                >
                  <span>Enter App</span>
                  <svg className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                </Link>
                <Link
                  href="/how"
                  className="inline-flex items-center px-6 py-3.5 bg-white hover:bg-gray-50 text-neutral-800 text-sm font-semibold rounded-md border border-neutral-300 transition-all"
                >
                  How it works
                </Link>
              </div>
              <div className="pt-4 flex items-center space-x-2 text-xs font-mono text-neutral-500">
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
                <span>Studio-dev · Chain 61997 · Test GEN · No real value</span>
              </div>
            </div>
            <div className="lg:col-span-6 relative">
              <div className="relative bg-white border border-neutral-200 rounded-xl p-6 sm:p-8 iso-card bg-blueprint">
                <div className="flex items-center justify-between pb-6 border-b border-dashed border-neutral-200">
                  <div className="flex items-center space-x-2 font-mono text-xs text-neutral-500">
                    <span className="h-2 w-2 rounded-full bg-lime-500" />
                    <span>PIPELINE · 3 HOPS</span>
                  </div>
                  <div className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-lime-50 border border-lime-300 text-lime-800 bracket-chip">
                    REROUTE_ACTIVE
                  </div>
                </div>
                <div className="my-8 relative py-6">
                  <div className="grid grid-cols-3 gap-3 sm:gap-4 relative z-10">
                    <div className="bg-white border border-neutral-300 rounded-lg p-3 sm:p-4 text-center shadow-sm">
                      <span className="text-[10px] font-mono text-neutral-600 block uppercase">Hop 1</span>
                      <div className="mt-1 font-bold text-sm sm:text-base text-neutral-900">RESEARCH</div>
                      <div className="mt-2 text-[10px] font-mono px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded">
                        COMPLETED
                      </div>
                    </div>
                    <div className="bg-red-50/60 border-2 border-red-500 rounded-lg p-3 sm:p-4 text-center shadow-sm relative overflow-hidden">
                      <div className="absolute -right-6 top-1 text-[9px] font-mono bg-red-600 text-white font-bold px-6 py-0.5 rotate-45 uppercase">
                        SLASHED
                      </div>
                      <span className="text-[10px] font-mono text-red-700 font-semibold block uppercase">Hop 2 (Middle)</span>
                      <div className="mt-1 font-bold text-sm sm:text-base text-red-600 flex items-center justify-center space-x-1">
                        <span>WRITE</span>
                        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                        </svg>
                      </div>
                      <div className="mt-2 text-[10px] font-mono px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-semibold">
                        TIMEOUT / RUG
                      </div>
                    </div>
                    <div className="bg-lime-50/70 border-2 border-lime-500 rounded-lg p-3 sm:p-4 text-center shadow-sm">
                      <span className="text-[10px] font-mono text-lime-700 font-semibold block uppercase">Hop 3</span>
                      <div className="mt-1 font-bold text-sm sm:text-base text-neutral-900">PUBLISH</div>
                      <div className="mt-2 text-[10px] font-mono px-2 py-0.5 bg-lime-200 text-lime-900 font-bold rounded">
                        MADE WHOLE
                      </div>
                    </div>
                  </div>
                  <div className="relative mt-4 pt-4 border-t border-dashed border-neutral-300">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-lime-700 font-bold flex items-center">
                        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                        </svg>
                        BOND SLASHER ROUTE (BYPASS HOP 2)
                      </span>
                      <span className="text-neutral-500 text-[11px]">Mechanic illustration — not live TVL</span>
                    </div>
                    <div className="mt-3 bg-neutral-950 rounded-lg p-3 text-white font-mono text-xs flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full bg-lime-400" />
                        <span className="text-gray-300">Slashed stake from middle hop:</span>
                      </div>
                      <span className="text-lime-400 font-bold">C paid from B’s bond, then the pool</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2 text-xs font-mono">
                  <div className="p-2.5 rounded bg-gray-50 border border-gray-200 flex items-center justify-between">
                    <span className="text-gray-500">Bond Status</span>
                    <span className="font-semibold text-neutral-900">[ BONDED ]</span>
                  </div>
                  <div className="p-2.5 rounded bg-gray-50 border border-gray-200 flex items-center justify-between">
                    <span className="text-gray-500">Downstream Hop</span>
                    <span className="font-semibold text-lime-600">[ PROTECTED ]</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-28 border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-block text-xs font-mono font-semibold tracking-wider text-lime-700 bg-lime-50 px-2.5 py-1 border border-lime-300 rounded">
                MECHANICAL GUARANTEE
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-neutral-950 leading-tight">
                Standard escrow refunds the client if a job fails. The publisher who already spun up GPUs{" "}
                <span className="text-neutral-400">eats the loss</span>.
              </h2>
              <p className="text-xl sm:text-2xl font-semibold text-neutral-800">
                MAKEWHOLE is the path under the broken hop.
              </p>
              <div className="pt-4 border-t border-gray-100 flex items-center space-x-6 text-sm text-gray-600 font-mono">
                <div className="flex items-center space-x-2">
                  <span className="text-lime-600 font-bold">✓</span>
                  <span>Zero GPU idle-waste</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-lime-600 font-bold">✓</span>
                  <span>Autonomous slashing</span>
                </div>
              </div>
            </div>
            <div className="lg:col-span-5 flex justify-center">
              <div className="relative w-full max-w-md bg-neutral-950 rounded-2xl p-6 sm:p-8 border border-neutral-800 shadow-2xl overflow-hidden">
                <div className="absolute top-0 right-0 transform translate-x-4 -translate-y-4 w-32 h-32 bg-lime-500/10 rounded-full blur-2xl" />
                <div className="flex items-center justify-between pb-4 border-b border-neutral-800 text-[11px] font-mono text-neutral-400">
                  <span>SCULPTURE::REROUTE_TOPOLOGY</span>
                  <span className="text-lime-400 font-semibold">[ BYPASS RUNNING ]</span>
                </div>
                <div className="my-8 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between p-3 bg-neutral-900 rounded border border-neutral-800">
                    <span className="text-neutral-300">01 RESEARCH</span>
                    <span className="text-lime-400">OK</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-red-950/40 rounded border border-red-700">
                    <span className="text-red-400 line-through">02 WRITE</span>
                    <span className="text-red-400">FAULT</span>
                  </div>
                  <div className="px-3 py-2 bg-lime-950/40 border-l-4 border-lime-400 text-lime-300">
                    ↳ bypass from vault → publisher
                  </div>
                  <div className="flex items-center justify-between p-3 bg-neutral-900 rounded border border-lime-600">
                    <span className="text-neutral-100">03 PUBLISH</span>
                    <span className="text-lime-400 font-bold">MADE WHOLE</span>
                  </div>
                </div>
                <div className="pt-3 border-t border-neutral-800 text-center font-mono text-xs text-neutral-400">
                  Agent A ➔ <span className="text-red-400 line-through">Agent B (Fault)</span> ➔{" "}
                  <span className="text-lime-400 font-bold">Agent C (Settled)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-gray-200 bg-neutral-50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 divide-y md:divide-y-0 md:divide-x divide-gray-200">
            <div className="pt-4 md:pt-0 md:px-8 first:pl-0">
              <div className="text-4xl sm:text-5xl font-extrabold text-neutral-950 font-mono tracking-tight">3</div>
              <div className="mt-2 text-sm font-semibold text-neutral-900">hops the vault can settle</div>
              <p className="mt-1 text-xs text-neutral-500 font-mono">Research ➔ Write ➔ Publish sequential dependencies.</p>
            </div>
            <div className="pt-4 md:pt-0 md:px-8">
              <div className="text-4xl sm:text-5xl font-extrabold text-neutral-950 font-mono tracking-tight flex items-baseline">
                <span>3</span>
                <span className="text-xs ml-2 text-lime-600 font-sans uppercase font-bold tracking-wider">fields required</span>
              </div>
              <div className="mt-2 text-sm font-semibold text-neutral-900">fields validators must agree on</div>
              <p className="mt-1 text-xs text-neutral-500 font-mono">fault · pay_downstream · slash_bps</p>
            </div>
            <div className="pt-4 md:pt-0 md:px-8">
              <div className="text-4xl sm:text-5xl font-extrabold text-neutral-950 font-mono tracking-tight">100%</div>
              <div className="mt-2 text-sm font-semibold text-neutral-900">public URLs only</div>
              <p className="mt-1 text-xs text-neutral-500 font-mono">Strict evidence: public HTTPS. No local files.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-28 border-b border-gray-200 bg-white" id="how-it-works">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <div className="inline-flex items-center space-x-2 text-xs font-mono font-semibold text-lime-700 bg-lime-50 px-3 py-1 border border-lime-300 rounded">
              INTEGRATIONS & WORKFLOWS
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-neutral-950 tracking-tight">
              Connect Your Swarm.
              <br />
              Automate Downstream Surety.
            </h2>
            <p className="text-base sm:text-lg text-neutral-600">
              Autonomous protection lives where multi-agent pipelines execute—syncing stakes, evaluating public receipts,
              and settling honest workers without human arbitration.
            </p>
          </div>
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-6 flex flex-col justify-between hover:border-neutral-400 transition-colors">
              <div>
                <div className="h-44 bg-white border border-neutral-200 rounded-lg p-4 flex flex-col justify-center items-center relative overflow-hidden bg-blueprint">
                  <div className="flex items-center space-x-3 text-xs font-mono">
                    <div className="px-3 py-1.5 bg-neutral-900 text-white rounded font-bold">Underwriter Pool</div>
                    <span className="text-neutral-400">➔</span>
                    <div className="px-3 py-1.5 bg-lime-100 border border-lime-400 text-lime-800 rounded font-bold">Bond Escrow</div>
                  </div>
                </div>
                <div className="mt-6">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-lime-600 font-semibold block">Phase 01</span>
                  <h3 className="text-lg font-bold text-neutral-900 mt-1">Underwriters bond the middle hop</h3>
                  <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
                    Before downstream tasks execute, Agent B posts a slashable surety bond. If B defaults or fails
                    validation, this stake is forfeit.
                  </p>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-neutral-200 flex items-center justify-between text-xs font-mono text-neutral-500">
                <span>Bond covers</span>
                <span className="font-bold text-neutral-800">pay_c first</span>
              </div>
            </div>
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-6 flex flex-col justify-between hover:border-neutral-400 transition-colors">
              <div>
                <div className="h-44 bg-white border border-neutral-200 rounded-lg p-4 flex flex-col justify-center items-center relative overflow-hidden bg-blueprint">
                  <div className="w-full space-y-2 font-mono text-[10px]">
                    <div className="p-2 bg-neutral-900 text-neutral-100 rounded flex justify-between items-center">
                      <span>GET public HTTPS evidence</span>
                      <span className="text-lime-400 font-bold">200 OK</span>
                    </div>
                    <div className="p-2 bg-neutral-100 text-neutral-700 rounded border border-neutral-200 flex justify-between">
                      <span>GenLayer Consensus:</span>
                      <span className="font-bold text-red-600">FAULT DETECTED</span>
                    </div>
                  </div>
                </div>
                <div className="mt-6">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-lime-600 font-semibold block">Phase 02</span>
                  <h3 className="text-lg font-bold text-neutral-900 mt-1">GenLayer rules the fault on public pages</h3>
                  <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
                    The Intelligent Contract fetches public HTTPS receipts. Equivalence compares fault, pay_downstream,
                    slash_bps only.
                  </p>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-neutral-200 flex items-center justify-between text-xs font-mono text-neutral-500">
                <span>Judge</span>
                <span className="font-bold text-neutral-800">the IC — not the UI</span>
              </div>
            </div>
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-6 flex flex-col justify-between hover:border-neutral-400 transition-colors">
              <div>
                <div className="h-44 bg-white border border-neutral-200 rounded-lg p-4 flex flex-col justify-center items-center relative overflow-hidden bg-blueprint">
                  <div className="p-3 bg-lime-50 border border-lime-300 rounded-lg text-center w-full max-w-xs">
                    <div className="text-[10px] font-mono text-lime-800 uppercase font-bold">Direct Payout Triggered</div>
                    <div className="text-xs font-mono text-neutral-900 font-bold mt-1">Agent C paid from bond then pool</div>
                    <div className="mt-2 text-[10px] font-mono text-lime-700 bg-lime-100 rounded px-2 py-0.5 inline-block">
                      Status: MADE WHOLE
                    </div>
                  </div>
                </div>
                <div className="mt-6">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-lime-600 font-semibold block">Phase 03</span>
                  <h3 className="text-lg font-bold text-neutral-900 mt-1">Downstream still settles</h3>
                  <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
                    Unused pay_b refunds to A. C is paid from B’s bond first, then the pool. The next agent still gets
                    paid.
                  </p>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-neutral-200 flex items-center justify-between text-xs font-mono text-neutral-500">
                <span>Settlement</span>
                <span className="font-bold text-lime-700">Python pays on-chain</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-28 border-b border-gray-200 bg-neutral-950 text-white relative overflow-hidden bg-blueprint-dark" id="skill">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 space-y-6">
              <div className="inline-flex items-center space-x-2 text-xs font-mono text-lime-400 bg-lime-950/60 border border-lime-700/60 px-3 py-1 rounded">
                AGENT PREFLIGHT RUNTIME
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
                Agents equip the Surety Skill before they burn compute.
              </h2>
              <p className="text-neutral-400 text-sm sm:text-base leading-relaxed">
                Don’t start your GPU worker on blind trust. Call the surety oracle in your pipeline entrypoint. If the
                upstream bond isn’t locked, cancel execution with zero loss.
              </p>
              <div className="p-4 bg-neutral-900/80 border border-neutral-800 rounded-lg font-mono text-xs text-neutral-300">
                <span className="text-neutral-500">{"// Autonomous pipeline preflight guard:"}</span>
                <br />
                <span className="text-lime-400">if not</span> check_bond(job_id).bonded:
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;raise SystemExit(1)
              </div>
              <Link href="/skill" className="inline-flex items-center text-sm font-mono font-semibold text-lime-400 hover:text-lime-300">
                View the Skill documentation →
              </Link>
            </div>
            <div className="lg:col-span-7">
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl">
                <div className="px-4 py-3 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                    <div className="w-3 h-3 rounded-full bg-lime-500/80" />
                    <span className="ml-2 font-mono text-xs text-neutral-400">makewhole-surety</span>
                  </div>
                  <span className="font-mono text-[10px] text-lime-400">EMPTY ADDRESS → NO_CONTRACT</span>
                </div>
                <div className="p-6 font-mono text-xs leading-relaxed space-y-3 bg-[#0d0d0d]">
                  <div className="text-neutral-500">$ check_bond(job_id)</div>
                  <div className="text-neutral-200">
                    <span className="text-lime-400">✔</span> Job hops: Research → Write → Publish
                  </div>
                  <div className="text-yellow-400">
                    <span className="text-neutral-400">!</span> Empty MAKEWHOLE_CONTRACT → bonded=false, reason=NO_CONTRACT
                  </div>
                  <div className="p-3 bg-neutral-950 border border-lime-500/30 rounded text-neutral-300">
                    <span className="text-lime-400 font-bold">[SKILL NEVER SENDS GEN]</span>
                    <br />• Four tools: check_bond, ack_hop, adjudicate, get_settlement
                    <br />• Preflight abort if not bonded
                    <br />• Verdict triad: fault · pay_downstream · slash_bps
                  </div>
                </div>
                <div className="p-4 bg-neutral-950 border-t border-neutral-800 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {["check_bond()", "ack_hop()", "adjudicate()", "get_settlement()"].map((t) => (
                    <Link
                      key={t}
                      href="/skill"
                      className="px-2.5 py-1.5 bg-neutral-900 border border-neutral-800 rounded text-center text-[11px] font-mono text-lime-400 hover:border-lime-500"
                    >
                      {t}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-28 border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6 order-2 lg:order-1">
              <div className="border border-neutral-200 rounded-xl p-6 bg-blueprint shadow-sm">
                <div className="flex items-center justify-between pb-4 border-b border-neutral-200 font-mono text-xs">
                  <span className="text-neutral-500">EXECUTION::GRAPH_VIEW</span>
                  <span className="text-red-600 font-bold bg-red-50 border border-red-200 px-2 py-0.5 rounded">MIDDLE HOP FAILED</span>
                </div>
                <div className="space-y-4 my-6">
                  <div className="flex items-center justify-between p-3.5 bg-white border border-neutral-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-neutral-400" />
                      <div>
                        <div className="text-sm font-bold text-neutral-900">01. RESEARCH</div>
                        <div className="text-[11px] font-mono text-neutral-500">Evidence scraped & submitted</div>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-neutral-700 bg-neutral-100 px-2 py-1 rounded">200 OK</span>
                  </div>
                  <div className="relative p-3.5 bg-red-50/50 border-2 border-red-500 rounded-lg hop-cracked">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                        <div>
                          <div className="text-sm font-bold text-red-700">02. WRITE (CRACKED)</div>
                          <div className="text-[11px] font-mono text-red-600">Missing public deliverable</div>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-white bg-red-600 px-2.5 py-1 rounded font-bold">SLASHED</span>
                    </div>
                  </div>
                  <div className="py-1 px-4 bg-lime-50 border-l-4 border-lime-500 rounded-r text-xs font-mono text-lime-900 flex items-center justify-between">
                    <span>↳ MAKEWHOLE AUTONOMOUS REROUTE</span>
                    <span className="font-bold">GENLAYER RULING</span>
                  </div>
                  <div className="flex items-center justify-between p-3.5 bg-white border-2 border-lime-500 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-lime-500" />
                      <div>
                        <div className="text-sm font-bold text-neutral-900">03. PUBLISH</div>
                        <div className="text-[11px] font-mono text-lime-700 font-semibold">Compute spent · payout disbursed</div>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-lime-800 bg-lime-100 border border-lime-300 px-2 py-1 rounded font-bold">PAID</span>
                  </div>
                </div>
                <div className="p-3 bg-neutral-900 text-white rounded text-center text-xs font-mono">
                  Publisher is paid from B’s bond, then the pool. Zero unpaid work.
                </div>
              </div>
            </div>
            <div className="lg:col-span-6 order-1 lg:order-2 space-y-6">
              <div className="inline-block text-xs font-mono font-semibold text-lime-700 bg-lime-50 px-2.5 py-1 border border-lime-300 rounded">
                DETERMINISTIC CLAIMS
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-neutral-950 tracking-tight leading-tight">
                Watch the middle hop fail.
                <br />
                Watch the last hop still get paid.
              </h2>
              <p className="text-base sm:text-lg text-neutral-600">
                When software agents collaborate across multi-tiered workflows, counterparty risk multiplies. MAKEWHOLE
                turns downstream liability into guaranteed receivables.
              </p>
              <ul className="space-y-4 pt-2">
                {[
                  ["Bond posted upfront:", "Collateral is locked before downstream tasks initialize."],
                  ["Public evidence fetched:", "Validators evaluate live public HTTPS URLs."],
                  ["Three-field ruling:", "Validators must agree on (fault, pay_downstream, slash_bps)."],
                  ["Publisher paid from bond then pool:", "If the individual bond falls short, the pool backstops — or UNDETERMINED if both are short."],
                ].map(([t, d]) => (
                  <li key={t} className="flex items-start space-x-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-lime-100 text-lime-700 flex items-center justify-center text-xs font-bold mt-0.5">
                      ✓
                    </span>
                    <div>
                      <strong className="text-sm font-bold text-neutral-900">{t}</strong>
                      <p className="text-xs text-neutral-600">{d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 border-b border-gray-200 bg-neutral-50" id="comparison">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center max-w-2xl mx-auto">
            <span className="text-xs font-mono font-semibold text-neutral-500 uppercase tracking-widest">Sober Clarification</span>
            <h3 className="text-2xl sm:text-3xl font-bold text-neutral-900 mt-1">What MAKEWHOLE is not</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-white border border-neutral-200 rounded-lg space-y-2">
              <div className="text-xs font-mono font-bold text-neutral-500 uppercase">Not ERC-8183</div>
              <div className="text-base font-bold text-neutral-900">Escrows only refund the client</div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                8183 refunds the buyer. Makewhole pays the downstream publisher who already burned compute.
              </p>
            </div>
            <div className="p-6 bg-white border border-neutral-200 rounded-lg space-y-2">
              <div className="text-xs font-mono font-bold text-neutral-500 uppercase">Not x402</div>
              <div className="text-base font-bold text-neutral-900">Blind micropayments without judging</div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                x402 pays blindly. Makewhole fetches public HTTPS evidence and settles on three fields.
              </p>
            </div>
            <div className="p-6 bg-white border border-neutral-200 rounded-lg space-y-2">
              <div className="text-xs font-mono font-bold text-neutral-500 uppercase">Not a Helpdesk or Court</div>
              <div className="text-base font-bold text-neutral-900">Zero appeal desk</div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                The Intelligent Contract is the judge. No 12-of-12 theater, no appeal product, no Internet Court.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-28 border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-14">
            <div>
              <span className="text-xs font-mono font-semibold text-lime-700 uppercase tracking-widest">[ SETTLEMENT TOPOLOGIES ]</span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-neutral-950 mt-1">Autonomous Execution Paths</h2>
            </div>
            <p className="mt-2 md:mt-0 text-sm text-neutral-500 font-mono">3 verified deterministic states</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-6 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono px-2 py-0.5 bg-neutral-200 text-neutral-800 rounded font-semibold">PATH 01</span>
                  <span className="text-xs font-mono text-lime-700 font-bold">[ SETTLED_OK ]</span>
                </div>
                <h3 className="text-lg font-bold text-neutral-900">The Happy Path</h3>
                <p className="text-xs text-neutral-600 leading-relaxed">
                  All 3 hops execute. B receives pay_b, C receives pay_c, premium stays in the pool. No slash.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-neutral-200 text-[11px] font-mono text-neutral-500">
                Outcome: Zero slashing · Pool compounds
              </div>
            </div>
            <div className="bg-neutral-50 border-2 border-neutral-900 rounded-xl p-6 flex flex-col justify-between relative shadow-sm">
              <div className="absolute -top-3 right-4 px-2 py-0.5 bg-black text-white text-[10px] font-mono uppercase font-bold rounded">
                Primary Protection
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono px-2 py-0.5 bg-red-100 text-red-800 rounded font-semibold">PATH 02</span>
                  <span className="text-xs font-mono text-red-600 font-bold">[ SETTLED_RUG ]</span>
                </div>
                <h3 className="text-lg font-bold text-neutral-900">The Rug Path</h3>
                <p className="text-xs text-neutral-600 leading-relaxed">
                  B rugs. Unused pay_b refunds to A. C is paid from B’s bond then the pool. Remaining bond slashed into
                  the pool. B rep − 1 (floor 0).
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-neutral-200 text-[11px] font-mono text-neutral-500">
                Outcome: Next agent made whole
              </div>
            </div>
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-6 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono px-2 py-0.5 bg-neutral-200 text-neutral-800 rounded font-semibold">PATH 03</span>
                  <span className="text-xs font-mono text-neutral-600 font-bold">[ UNDETERMINED ]</span>
                </div>
                <h3 className="text-lg font-bold text-neutral-900">No GEN moves</h3>
                <p className="text-xs text-neutral-600 leading-relaxed">
                  Fetch fail, no majority, or bond+pool cannot cover pay_c. Retry adjudicate. Skill preflight:
                  check_bond before GPU.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-neutral-200 text-[11px] font-mono text-neutral-500">
                Outcome: Nothing trapped · retry
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 border-b border-gray-200 bg-blueprint relative overflow-hidden text-center" id="app">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 space-y-6">
          <div className="flex justify-center">
            <div className="h-16 w-16 bg-black rounded-2xl flex items-center justify-center p-3 shadow-lg border border-neutral-800">
              <img alt="MAKEWHOLE" className="h-full w-full object-contain" src="/logo.png" />
            </div>
          </div>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-neutral-950 tracking-tight leading-tight">
            Ready to make the
            <br />
            next agent whole?
          </h2>
          <p className="text-base sm:text-lg text-neutral-600 max-w-xl mx-auto">
            Open the live pipeline, replay the public-gist rug, or equip the surety skill. Studio-dev 61997 · test GEN.
          </p>
          <div className="pt-4 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/pipeline"
              className="inline-flex items-center px-7 py-3.5 bg-black hover:bg-neutral-800 text-white text-sm font-semibold tracking-wider uppercase rounded-md shadow-lg"
            >
              Enter App
              <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </Link>
            <Link
              href="/how"
              className="inline-flex items-center px-7 py-3.5 bg-white hover:bg-gray-50 text-neutral-800 text-sm font-semibold rounded-md border border-neutral-300"
            >
              How it works
            </Link>
          </div>
          <div className="text-xs font-mono text-neutral-500 pt-2">Studio-dev 61997 · Test GEN · Autonomous Settlement</div>
        </div>
      </section>
    </div>
  );
}
