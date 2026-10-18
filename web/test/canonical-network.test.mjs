import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CANONICAL_CHAIN_ID,
  CANONICAL_CHAIN_HEX,
  CANONICAL_NETWORK_NAME,
  CANONICAL_STUDIO_DEV_RPC,
  CANONICAL_STUDIO_DEV_EXPLORER,
  normalizeUrl,
  resolveStudioRpcUrl,
  resolveStudioExplorerUrl,
  getRpcHost,
  getCanonicalNetworkConfig,
} from "../src/lib/network.ts";
import { GET as genlayerGet, POST as genlayerPost } from "../src/app/api/genlayer/route.ts";
import { createCheckBondClient } from "../src/app/api/skill/check_bond/core.ts";

test("Canonical network resolver: environment precedence rules", () => {
  // 1. GENLAYER_STUDIO_URL has first precedence
  const envWithBoth = {
    GENLAYER_STUDIO_URL: "https://primary.genlayer.com/api",
    NEXT_PUBLIC_STUDIO_RPC: "https://secondary.genlayer.com/api",
  };
  assert.strictEqual(
    resolveStudioRpcUrl(envWithBoth),
    "https://primary.genlayer.com/api"
  );

  // 2. NEXT_PUBLIC_STUDIO_RPC has second precedence when GENLAYER_STUDIO_URL is missing or empty
  const envWithNextPublicOnly = {
    GENLAYER_STUDIO_URL: "",
    NEXT_PUBLIC_STUDIO_RPC: "https://secondary.genlayer.com/api",
  };
  assert.strictEqual(
    resolveStudioRpcUrl(envWithNextPublicOnly),
    "https://secondary.genlayer.com/api"
  );

  const envWithWhitespaceGenlayer = {
    GENLAYER_STUDIO_URL: "   ",
    NEXT_PUBLIC_STUDIO_RPC: "https://secondary.genlayer.com/api",
  };
  assert.strictEqual(
    resolveStudioRpcUrl(envWithWhitespaceGenlayer),
    "https://secondary.genlayer.com/api"
  );

  // 3. Fallback is the canonical Studio-dev RPC
  assert.strictEqual(
    resolveStudioRpcUrl({}),
    CANONICAL_STUDIO_DEV_RPC
  );
  assert.strictEqual(
    resolveStudioRpcUrl({ GENLAYER_STUDIO_URL: "", NEXT_PUBLIC_STUDIO_RPC: "" }),
    "https://studio-dev.genlayer.com/api"
  );
});

test("Canonical network resolver: trailing-slash and whitespace normalization", () => {
  assert.strictEqual(normalizeUrl("https://studio-dev.genlayer.com/api/"), "https://studio-dev.genlayer.com/api");
  assert.strictEqual(normalizeUrl("https://studio-dev.genlayer.com/api///"), "https://studio-dev.genlayer.com/api");
  assert.strictEqual(normalizeUrl("   https://studio-dev.genlayer.com/api/   "), "https://studio-dev.genlayer.com/api");
  assert.strictEqual(normalizeUrl(""), "");
  assert.strictEqual(normalizeUrl(null), "");
  assert.strictEqual(normalizeUrl(undefined), "");

  // Combined with resolveStudioRpcUrl
  assert.strictEqual(
    resolveStudioRpcUrl({ GENLAYER_STUDIO_URL: "https://custom.rpc/api//" }),
    "https://custom.rpc/api"
  );
  assert.strictEqual(
    resolveStudioRpcUrl({ NEXT_PUBLIC_STUDIO_RPC: "  https://custom2.rpc/api/  " }),
    "https://custom2.rpc/api"
  );

  // Combined with resolveStudioExplorerUrl
  assert.strictEqual(
    resolveStudioExplorerUrl({ NEXT_PUBLIC_STUDIO_EXPLORER: "https://explorer.test/  " }),
    "https://explorer.test"
  );
  assert.strictEqual(
    resolveStudioExplorerUrl({}),
    CANONICAL_STUDIO_DEV_EXPLORER
  );
});

test("Canonical network resolver: getCanonicalNetworkConfig metadata", () => {
  const config = getCanonicalNetworkConfig({});
  assert.strictEqual(config.chainId, CANONICAL_CHAIN_ID);
  assert.strictEqual(config.chainId, 61997);
  assert.strictEqual(config.chainIdHex, CANONICAL_CHAIN_HEX);
  assert.strictEqual(config.chainIdHex, "0xf22d");
  assert.strictEqual(config.networkName, CANONICAL_NETWORK_NAME);
  assert.strictEqual(config.networkName, "GenLayer Studio-dev");
  assert.strictEqual(config.rpcUrl, "https://studio-dev.genlayer.com/api");
  assert.strictEqual(config.rpcHost, "studio-dev.genlayer.com");
  assert.strictEqual(config.explorerUrl, "https://explorer-studio-dev.genlayer.com");

  // Custom RPC host parsing
  assert.strictEqual(getRpcHost("https://custom-host.example.com/api"), "custom-host.example.com");
  assert.strictEqual(getRpcHost("not-a-url"), "studio-dev.genlayer.com");
});

test("API proxy: GET /api/genlayer reports canonical Studio-dev metadata", async () => {
  const res = await genlayerGet();
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.deepStrictEqual(data, {
    ok: true,
    network: "GenLayer Studio-dev",
    rpcHost: "studio-dev.genlayer.com",
    chainId: 61997,
  });
});

test("API proxy: POST /api/genlayer forwards to resolved canonical RPC", async () => {
  const originalFetch = globalThis.fetch;
  let interceptedUrl = null;
  let interceptedBody = null;

  globalThis.fetch = async (url, options) => {
    interceptedUrl = url;
    interceptedBody = options?.body;
    return new Response(JSON.stringify({ jsonrpc: "2.0", result: "0xf22d", id: 1 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const mockReq = {
      json: async () => ({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
    };

    const res = await genlayerPost(mockReq);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.result, "0xf22d");
    assert.strictEqual(interceptedUrl, resolveStudioRpcUrl());
    assert.match(interceptedUrl, /studio-dev\.genlayer\.com/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Bond-check endpoint: uses centralized canonical network configuration", () => {
  const client = createCheckBondClient();
  assert.strictEqual(client.chain.id, 61997);
  assert.strictEqual(client.chain.name, "GenLayer Studio-dev");
  assert.strictEqual(client.chain.rpcUrls.default.http[0], resolveStudioRpcUrl());
  assert.match(client.chain.rpcUrls.default.http[0], /studio-dev\.genlayer\.com/);
});

test("Static audit: no functional tracked runtime in corrected scope references studio-next URL", () => {
  const correctedFiles = [
    resolve(process.cwd(), "web/src/app/api/genlayer/route.ts"),
    resolve(process.cwd(), "web/src/app/api/skill/check_bond/route.ts"),
    resolve(process.cwd(), "scripts/verify_payout.mjs"),
    resolve(process.cwd(), "scripts/demo-rug.mjs"),
  ];

  const obsoleteTarget = "https://studio-next.genlayer.com/api";

  for (const filePath of correctedFiles) {
    const content = readFileSync(filePath, "utf8");
    assert.strictEqual(
      content.includes(obsoleteTarget),
      false,
      `File ${filePath} contains obsolete URL: ${obsoleteTarget}`
    );
  }
});
