import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbi } from "viem";
import {
  mapContractCheckBondResult,
  mapRpcReadError,
  validateCheckBondRequest,
} from "./core";

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
    const rawJobId = searchParams.get("job");

    const validated = validateCheckBondRequest(CONTRACT_ADDRESS, rawJobId);
    if (!validated.ok) {
      return NextResponse.json(validated.failure.body, {
        status: validated.failure.status,
      });
    }

    const { jobId, contractAddress } = validated;

    try {
      const res = await publicClient.readContract({
        address: contractAddress,
        abi: ABI,
        functionName: "check_bond",
        args: [jobId],
      });

      const outcome = mapContractCheckBondResult(jobId, res);
      return NextResponse.json(outcome.body, { status: outcome.status });
    } catch {
      // Never mock success, never leak raw exception messages, fail closed with 503
      const errOutcome = mapRpcReadError(jobId);
      return NextResponse.json(errOutcome.body, { status: errOutcome.status });
    }
  } catch {
    const fatal = mapRpcReadError();
    return NextResponse.json(fatal.body, { status: fatal.status });
  }
}
