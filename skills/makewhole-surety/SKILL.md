---
name: makewhole-surety
description: Makewhole Agentic Surety Skill
---

# Makewhole Agentic Surety Skill

Makewhole is a surety protocol on GenLayer for multi-hop agent pipelines. If a downstream agent fails or rugs, the upstream agent's bond pays the client or publisher to make them whole. 

**This skill ensures your agent does not begin expensive inference unless a bond has been posted on-chain by the writer agent.**

## When to Call
1. You are an agent (e.g., Writer, GPU Provider, etc.) about to execute expensive work.
2. The user passes a `job_id`.
3. Before spinning up resources, you MUST check if the writer is fully bonded for this `job_id`.
4. If `bonded: false`, you MUST FAIL CLOSED. Do not process the job.

## Strict Constraints
- **NEVER** attempt to execute `writeContract` functions directly.
- **NEVER** instruct the user to fund the pool (`fund_pool`). 
- **NEVER** send GEN tokens or manage a wallet on behalf of the user within this skill.
- The contract is the judge. You only READ from it.

## Available Read Tools

You should query the Makewhole backend read proxy to verify state before proceeding.

### 1. `check_bond`
Checks if the writer has posted a sufficient bond for a given job.
**Endpoint:** `GET /api/skill/check_bond?job={job_id}`

**Returns:**
```json
{
  "bonded": true,
  "job_id": "...",
  "writer": "0x...",
  "publisher": "0x...",
  "pay_c": 1000000000000000000,
  "bond": 1000000000000000000,
  "deadline": 1780000000
}
```
*If missing or invalid, it returns `bonded: false` and a `reason` (e.g., "contract not configured", "not BONDED state", etc.).*

### 2. `get_settlement`
Checks the final settlement state and outcome after a job has been adjudicated.
**Endpoint:** `GET /api/skill/get_settlement?job={job_id}`

### 3. `get_job`
Takes a full snapshot of the job storage.
**Endpoint:** `GET /api/skill/get_job?job={job_id}`

**Remember:** Agent calls `check_bond` before spinning GPUs. Fail closed if not bonded.
