import { NextRequest, NextResponse } from "next/server";
import { getCanonicalNetworkConfig, resolveStudioRpcUrl } from "../../../lib/network";

export const runtime = "nodejs";

export async function GET() {
  const config = getCanonicalNetworkConfig();
  return NextResponse.json({
    ok: true,
    network: config.networkName,
    rpcHost: config.rpcHost,
    chainId: config.chainId,
  });
}

export async function POST(req: NextRequest) {
  const rpc = resolveStudioRpcUrl();
  // Serverless-safe Studio JSON-RPC proxy (no Docker). Same path works on Vercel.
  try {
    const body = await req.json();
    const response = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (text.trim().toLowerCase().startsWith("<!doctype") || text.trim().toLowerCase().startsWith("<html")) {
      return NextResponse.json({ error: { message: "Studio RPC returned HTML (502 Proxy Error)" } }, { status: 502 });
    }
    const data = JSON.parse(text);
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Studio-dev RPC proxy failed" },
      { status: 502 }
    );
  }
}
