import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, rpc: "studio-dev", chainId: 61997 });
}

export async function POST(req: NextRequest) {
  const rpc =
    process.env.GENLAYER_STUDIO_URL ||
    process.env.NEXT_PUBLIC_STUDIO_RPC ||
    "https://studio-dev.genlayer.com/api";
  // Serverless-safe Studio JSON-RPC proxy (no Docker). Same path works on Vercel.
  try {
    const body = await req.json();
    const response = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Studio-dev RPC proxy failed" },
      { status: 502 }
    );
  }
}
