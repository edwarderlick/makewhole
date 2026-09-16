import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbi } from "viem";

const TARGET_CHAIN_ID = 61997;
const TARGET_RPC = "https://studio-next.genlayer.com/api";
const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "").trim() as `0x${string}`;

const ABI = parseAbi([
  "function get_job(string job_id) returns (string)",
  "function check_bond(string job_id) returns (string)",
]);

const publicClient = createPublicClient({
  chain: {
    id: TARGET_CHAIN_ID,
    name: "GenLayer Studio Next",
    nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
    rpcUrls: { default: { http: [TARGET_RPC] } },
  },
  transport: http(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("job");

    if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === "0x") {
      return NextResponse.json({ bonded: false, reason: "contract not configured" });
    }

    if (!jobId) {
      return NextResponse.json({ bonded: false, reason: "Missing job ID" });
    }

    try {
      const res = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: "check_bond",
        args: [jobId],
      });
      const data = JSON.parse(res as string);
      
      // We expect the contract to return bonded: true/false.
      // E.g., { bonded: true, bond: 1000, pay_c: 1000, state: 2, writer: "0x..." }
      if (!data.bonded) {
         return NextResponse.json({ bonded: false, reason: "Writer is not bonded or job state invalid" });
      }

      return NextResponse.json({
        bonded: true,
        job_id: jobId,
        writer: data.writer,
        pay_c: data.pay_c,
        bond: data.bond,
        state: data.state,
      });
    } catch (e: any) {
      return NextResponse.json({ bonded: false, reason: `RPC check failed: ${e.message}` });
    }
  } catch (err: any) {
    return NextResponse.json({ bonded: false, reason: err.message }, { status: 500 });
  }
}
