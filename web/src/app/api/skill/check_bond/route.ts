import { NextResponse } from "next/server";
import { parseAbi } from "viem";
import {
  createCheckBondClient,
  mapContractCheckBondResult,
  mapRpcReadError,
  validateCheckBondRequest,
} from "./core";
import { getCanonicalNetworkConfig } from "../../../../lib/network";

const ABI = parseAbi([
  "function get_job(string job_id) returns (string)",
  "function check_bond(string job_id) returns (string)",
]);

let cachedClient: ReturnType<typeof createCheckBondClient> | null = null;
let cachedRpcUrl: string | null = null;

function getPublicClient() {
  const config = getCanonicalNetworkConfig();
  if (!cachedClient || cachedRpcUrl !== config.rpcUrl) {
    cachedRpcUrl = config.rpcUrl;
    cachedClient = createCheckBondClient();
  }
  return cachedClient;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawJobId = searchParams.get("job");
    const contractAddress = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "").trim() as `0x${string}`;

    const validated = validateCheckBondRequest(contractAddress, rawJobId);
    if (!validated.ok) {
      return NextResponse.json(validated.failure.body, {
        status: validated.failure.status,
      });
    }

    const { jobId, contractAddress: validAddress } = validated;

    try {
      const client = getPublicClient();
      const res = await client.readContract({
        address: validAddress,
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
