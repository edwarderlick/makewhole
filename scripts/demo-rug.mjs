import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import fs from "fs";
import path from "path";

// Usage: node scripts/demo-rug.mjs <pk_alice> <pk_bob> <pk_charlie>

const PK_A = process.argv[2];
const PK_B = process.argv[3];
const PK_C = process.argv[4];

if (!PK_A || !PK_B || !PK_C) {
  console.error("Usage: node scripts/demo-rug.mjs <pk_alice> <pk_bob> <pk_charlie>");
  process.exit(1);
}

const rpcUrl = "https://studio-next.genlayer.com/api";

const clientA = createClient({ chain: studioDevnet, account: PK_A, endpoint: rpcUrl });
const clientB = createClient({ chain: studioDevnet, account: PK_B, endpoint: rpcUrl });
const clientC = createClient({ chain: studioDevnet, account: PK_C, endpoint: rpcUrl });

async function waitSuccessful(client, txId) {
  const wait = client.waitForFinalization || client.waitForTransactionReceipt;
  const tx = await wait.call(client, { hash: txId, status: "ACCEPTED" });
  return tx;
}

async function run() {
  console.log("Deploying contract...");
  const sourceCode = fs.readFileSync(path.join(process.cwd(), "contracts", "makewhole.py"), "utf-8");
  
  const deployCall = {
    sourceCode,
    args: []
  };
  const deployEst = await clientA.estimateTransactionFeesForDeploy(deployCall);
  const contractId = await clientA.deployContract({
    ...deployCall,
    fees: { distribution: deployEst.distribution, feeValue: deployEst.feeValue }
  });
  console.log(`Deploy Tx: ${contractId}`);
  const dTx = await waitSuccessful(clientA, contractId);
  const contractAddress = dTx.contractAddress;
  console.log(`Contract deployed at: ${contractAddress}`);

  console.log("Bob posting bond...");
  const bondCall = {
    address: contractAddress,
    functionName: "post_bond",
    args: [],
    value: 15n * 10n ** 18n
  };
  const bondEst = await clientB.estimateTransactionFeesForWrite(bondCall);
  const bondTxId = await clientB.writeContract({
    ...bondCall,
    fees: { distribution: bondEst.distribution, feeValue: bondEst.feeValue }
  });
  await waitSuccessful(clientB, bondTxId);
  console.log("Bond posted.");

  console.log("Alice creating job...");
  const createCall = {
    address: contractAddress,
    functionName: "create_job",
    args: [
      "https://gist.githubusercontent.com/makewhole/fixtures/raw/brief.md",
      20n * 10n ** 18n,
      12n * 10n ** 18n,
      3n * 10n ** 18n, // premium
      BigInt(Math.floor(Date.now() / 1000) + 86400), // deadline
      clientB.account.address,
      clientC.account.address,
      "write"
    ],
    value: 35n * 10n ** 18n
  };
  const createEst = await clientA.estimateTransactionFeesForWrite(createCall);
  const createTxId = await clientA.writeContract({
    ...createCall,
    fees: { distribution: createEst.distribution, feeValue: createEst.feeValue }
  });
  const cTx = await waitSuccessful(clientA, createTxId);
  
  // Need to get the Job ID. We can call list_ids.
  const ids = await clientA.readContract({ address: contractAddress, functionName: "list_ids", args: [] });
  const jobId = ids[ids.length - 1];
  console.log(`Job Created: ${jobId}`);

  console.log("Bob submitting a rug deliverable...");
  const submitCall = {
    address: contractAddress,
    functionName: "submit",
    args: [jobId, "https://gist.githubusercontent.com/makewhole/fixtures/raw/rug.md", ""]
  };
  const subEst = await clientB.estimateTransactionFeesForWrite(submitCall);
  const subTxId = await clientB.writeContract({
    ...submitCall,
    fees: { distribution: subEst.distribution, feeValue: subEst.feeValue }
  });
  await waitSuccessful(clientB, subTxId);

  console.log("Charlie acking...");
  const ackCall = {
    address: contractAddress,
    functionName: "ack_downstream",
    args: [jobId, "https://gist.githubusercontent.com/makewhole/fixtures/raw/pub.md"]
  };
  const ackEst = await clientC.estimateTransactionFeesForWrite(ackCall);
  const ackTxId = await clientC.writeContract({
    ...ackCall,
    fees: { distribution: ackEst.distribution, feeValue: ackEst.feeValue }
  });
  await waitSuccessful(clientC, ackTxId);

  console.log("Alice adjudicating...");
  const adjCall = {
    address: contractAddress,
    functionName: "adjudicate",
    args: [jobId]
  };
  const adjEst = await clientA.estimateTransactionFeesForWrite(adjCall);
  const adjTxId = await clientA.writeContract({
    ...adjCall,
    fees: { distribution: adjEst.distribution, feeValue: adjEst.feeValue }
  });
  await waitSuccessful(clientA, adjTxId);

  console.log("Getting settlement...");
  const settlement = await clientA.readContract({
    address: contractAddress,
    functionName: "get_settlement",
    args: [jobId]
  });
  const job = await clientA.readContract({
    address: contractAddress,
    functionName: "get_job",
    args: [jobId]
  });

  const out = {
    contractAddress,
    jobId,
    job,
    settlement
  };

  fs.mkdirSync(path.join(process.cwd(), "evidence"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), "evidence", "studio-next.json"), JSON.stringify(out, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  , 2));

  console.log("Done! Evidence saved to evidence/studio-next.json");
}

run().catch(console.error);
