"use client";
import { useEffect, useState } from "react";

export function LandingLoop({ pauseOn = "none" }: { pauseOn?: "none" | "rug" | "ok" }) {
  const [phase, setPhase] = useState(0); // 0: init, 1: A escrows, 2: B bonds, 3: B rugs, 4: slashed/C paid, 5: end card
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setPhase(pauseOn === "rug" ? 4 : 4);
      return;
    }

    if (pauseOn !== "none") {
      setPhase(pauseOn === "rug" ? 4 : 4);
      return;
    }

    const phases = [
      { p: 0, ms: 500 },
      { p: 1, ms: 2000 },
      { p: 2, ms: 2000 },
      { p: 3, ms: 1500 },
      { p: 4, ms: 3000 },
      { p: 5, ms: 2500 }
    ];

    let currentTimeout: any;
    let step = 0;

    const run = () => {
      setPhase(phases[step].p);
      currentTimeout = setTimeout(() => {
        step = (step + 1) % phases.length;
        run();
      }, phases[step].ms);
    };

    run();

    return () => clearTimeout(currentTimeout);
  }, [reducedMotion, pauseOn]);

  const transitionClass = "transition-all duration-[150ms] ease-in-out";

  return (
    <div className="relative w-full h-[320px] bg-[#0a0a0a] rounded-xl overflow-hidden iso-card border border-[#222]">
      {/* End Card Overlay */}
      <div className={`absolute inset-0 z-50 bg-[#0a0a0a] flex items-center justify-center ${transitionClass} ${phase === 5 ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
         <div className="text-center space-y-4">
           <h2 className="text-2xl md:text-3xl font-sans font-bold text-white tracking-tight">The next agent still gets paid.</h2>
           <p className="text-[#b6ff3b] font-mono text-xs uppercase tracking-widest font-bold">Makewhole Surety Protocol</p>
         </div>
      </div>

      <div className="absolute inset-0 p-8 flex flex-col justify-center">
        {/* Nodes Container */}
        <div className="flex items-center justify-between relative z-10 w-full max-w-lg mx-auto">
          
          {/* Agent A */}
          <div className={`relative flex flex-col items-center space-y-2 z-20 ${transitionClass} ${phase >= 0 ? "opacity-100" : "opacity-50"}`}>
            <div className={`w-16 h-16 rounded-lg border-2 flex items-center justify-center bg-[#111] shadow-lg ${transitionClass} ${phase >= 1 ? "border-[#b6ff3b]" : "border-neutral-700"}`}>
               <span className="font-mono text-[#b6ff3b] text-xl font-bold">A</span>
            </div>
            <span className="font-mono text-[10px] uppercase text-neutral-400">Research</span>
            {phase >= 1 && (
              <div className={`absolute -bottom-6 font-mono text-[9px] bg-[#b6ff3b]/20 text-[#b6ff3b] px-2 py-0.5 rounded font-bold uppercase tracking-widest ${transitionClass}`}>
                Escrowed
              </div>
            )}
          </div>

          {/* Trace A->B */}
          <div className="flex-1 h-0.5 relative mx-2">
            <div className="absolute inset-0 bg-neutral-800" />
            <div className={`absolute inset-y-0 left-0 bg-[#b6ff3b] ${transitionClass}`} style={{ width: phase >= 2 ? "100%" : "0%" }} />
          </div>

          {/* Agent B */}
          <div className={`relative flex flex-col items-center space-y-2 z-20 ${transitionClass} ${phase >= 2 ? "opacity-100" : "opacity-50"}`}>
            <div className={`w-16 h-16 rounded-lg border-2 flex items-center justify-center bg-[#111] shadow-lg ${transitionClass} ${phase >= 4 ? "border-red-500" : phase >= 2 ? "border-[#b6ff3b]" : "border-neutral-700"}`}>
               <span className={`font-mono text-xl font-bold ${phase >= 4 ? "text-red-500" : "text-[#b6ff3b]"}`}>B</span>
               {phase >= 4 && (
                 <div className="absolute inset-0 bg-red-500/20 rounded-lg flex items-center justify-center backdrop-blur-[1px]">
                   <span className="font-mono text-[10px] uppercase font-bold text-red-500 rotate-45 border-y border-red-500 bg-[#0a0a0a] w-full text-center">SLASHED</span>
                 </div>
               )}
            </div>
            <span className="font-mono text-[10px] uppercase text-neutral-400">Write</span>
            {phase >= 2 && phase < 4 && (
              <div className={`absolute -bottom-6 font-mono text-[9px] bg-[#b6ff3b]/20 text-[#b6ff3b] px-2 py-0.5 rounded font-bold uppercase tracking-widest ${transitionClass}`}>
                Bonded
              </div>
            )}
            {phase === 3 && (
              <div className={`absolute -bottom-10 font-mono text-[9px] bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded font-bold uppercase tracking-widest animate-pulse ${transitionClass}`}>
                Timeout / Rug
              </div>
            )}
          </div>

          {/* Trace B->C */}
          <div className="flex-1 h-0.5 relative mx-2">
            <div className="absolute inset-0 bg-neutral-800" />
            <div className={`absolute inset-y-0 left-0 bg-red-500 ${transitionClass}`} style={{ width: phase >= 4 ? "100%" : "0%" }} />
            {/* The actual payment comes from the contract, trace it bypassing B if we wanted, but let's just make it lime to C */}
          </div>

          {/* Agent C */}
          <div className={`relative flex flex-col items-center space-y-2 z-20 ${transitionClass} ${phase >= 4 ? "opacity-100" : "opacity-50"}`}>
            <div className={`w-16 h-16 rounded-lg border-2 flex items-center justify-center bg-[#111] shadow-lg ${transitionClass} ${phase >= 4 ? "border-[#b6ff3b] shadow-[0_0_15px_rgba(182,255,59,0.2)]" : "border-neutral-700"}`}>
               <span className="font-mono text-[#b6ff3b] text-xl font-bold">C</span>
            </div>
            <span className="font-mono text-[10px] uppercase text-neutral-400">Publish</span>
            {phase >= 4 && (
              <div className={`absolute -bottom-6 font-mono text-[9px] bg-[#b6ff3b] text-[#0a0a0a] px-2 py-0.5 rounded font-bold uppercase tracking-widest ${transitionClass}`}>
                Made Whole
              </div>
            )}
          </div>
        </div>

        {/* Contract Box */}
        <div className={`mt-16 mx-auto w-48 border border-neutral-800 bg-[#111] rounded p-3 text-center ${transitionClass} ${phase >= 1 ? "opacity-100" : "opacity-50"}`}>
          <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-2">Makewhole Surety Vault</div>
          <div className="flex justify-between text-xs font-mono">
             <div className="flex flex-col">
               <span className="text-neutral-400">Escrow</span>
               <span className={phase >= 1 ? "text-white font-bold" : "text-neutral-600"}>{phase >= 1 ? "0.45 GEN" : "0.00 GEN"}</span>
             </div>
             <div className="flex flex-col">
               <span className="text-neutral-400">Bonds</span>
               <span className={phase >= 2 ? (phase >= 4 ? "text-red-500 font-bold" : "text-[#b6ff3b] font-bold") : "text-neutral-600"}>
                 {phase >= 4 ? "0.00 GEN" : phase >= 2 ? "0.20 GEN" : "0.00 GEN"}
               </span>
             </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
