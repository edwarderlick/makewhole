import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contractFile = resolve(root, "contracts/makewhole.py");
const envLocal = resolve(root, "web/.env.local");

async function deploy() {
  const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  
  const client = createClient({
    chain: studioDevnet,
    account: account,
    endpoint: "https://studio-next.genlayer.com/api"
  });

  const code = readFileSync(contractFile, "utf8");

  console.log("Estimating fees...");
  const estParams = {
    code,
    args: [],
    leaderOnly: false
  };

  let quote;
  try {
     const raw = await client.estimateTransactionFees(estParams);
     quote = raw?.fees ?? raw?.data?.fees ?? raw;
     if (!quote?.distribution) {
       // fallback, try with rotations
       const raw2 = await client.estimateTransactionFees({ ...estParams, rotations: [0n] });
       quote = raw2?.fees ?? raw2?.data?.fees ?? raw2;
     }
  } catch(e) {
     console.error("estimateTransactionFees failed:", e);
     process.exit(1);
  }

  let feeValue = quote.feeValue ?? quote.fee_value;
  if (!feeValue || feeValue === 1n || feeValue === "1") {
      feeValue = "100000000000000000"; // non 1n
  }
  
  const feesObj = {
    distribution: quote.distribution,
    feeValue: feeValue
  };
  
  if (Array.isArray(quote.messageAllocations) && quote.messageAllocations.length > 0) {
      feesObj.messageAllocations = quote.messageAllocations;
  }

  console.log("Fees obj:", feesObj);
  
  console.log("Deploying contract...");
  const txHash = await client.deployContract({
    code,
    args: [],
    leaderOnly: false,
    fees: feesObj
  });
  
  console.log("Tx sent:", txHash, "Waiting for receipt...");
  const receipt = await client.waitForTransactionReceipt({ hash: txHash, waitUntil: "finalized", retries: 60 });
  const execRes = receipt.txExecutionResultName || receipt.executionResult || receipt?.data?.execution_result || receipt?.execution_data?.execution_result;
  if (execRes !== "SUCCESS" && execRes !== "FINISHED_WITH_RETURN") {
    console.error("Deploy failed:", receipt);
    process.exit(1);
  }
  
  const address = receipt.contractAddress;
  console.log("Deployed", address);

  const lines = existsSync(envLocal) ? readFileSync(envLocal, "utf8").split(/\r?\n/) : [];
  const next = [
    `NEXT_PUBLIC_CONTRACT_ADDRESS=${address}`,
    "NEXT_PUBLIC_CHAIN_ID=61997",
    "NEXT_PUBLIC_STUDIO_RPC=https://studio-next.genlayer.com/api",
    "NEXT_PUBLIC_STUDIO_EXPLORER=https://explorer-studio-dev.genlayer.com",
    "GENLAYER_STUDIO_URL=https://studio-next.genlayer.com/api",
  ];
  const kept = lines.filter((l) => l && !l.startsWith("NEXT_PUBLIC_") && !l.startsWith("GENLAYER_STUDIO_URL"));
  writeFileSync(envLocal, [...next, ...kept, ""].join("\n"));
  console.log("Wrote web/.env.local");
}

deploy().catch(console.error);
