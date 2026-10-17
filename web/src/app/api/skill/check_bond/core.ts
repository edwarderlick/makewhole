export const EXACT_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/i;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const APPROVED_BONDED_STATES = new Set([
  "BONDED",
  "IN_FLIGHT",
  "ACKED",
  "UNDETERMINED",
]);

export interface CheckBondApiResponse {
  bonded: boolean;
  job_id?: string;
  writer?: string;
  state?: string;
  bond?: string;
  total_bond?: string;
  reserved_bond?: string;
  available_bond?: string;
  job_reserved_bond?: string;
  pay_c?: string;
  rep?: number;
  error?: string;
  reason?: string;
}

export interface CheckBondFailureResult {
  status: 400 | 503;
  body: CheckBondApiResponse;
}

export interface CheckBondSuccessResult {
  status: 200;
  body: CheckBondApiResponse;
}

export function isExactAddress(addr: unknown): addr is `0x${string}` {
  if (typeof addr !== "string") return false;
  const trimmed = addr.trim();
  if (!EXACT_ADDRESS_REGEX.test(trimmed)) return false;
  if (trimmed.toLowerCase() === ZERO_ADDRESS.toLowerCase()) return false;
  return true;
}

export function parseWeiAmount(val: unknown): string | null {
  if (val === null || val === undefined || typeof val === "boolean") {
    return null;
  }
  if (typeof val === "bigint") {
    if (val < 0n) return null;
    return val.toString();
  }
  if (typeof val === "number") {
    if (!Number.isSafeInteger(val) || val < 0) {
      return null;
    }
    return BigInt(val).toString();
  }
  if (typeof val === "string") {
    const s = val.trim();
    if (!/^\d+$/.test(s)) {
      return null;
    }
    try {
      const b = BigInt(s);
      if (b < 0n) return null;
      return b.toString();
    } catch {
      return null;
    }
  }
  return null;
}

export function parseRepAmount(val: unknown): number | null {
  if (val === null || val === undefined || typeof val === "boolean") {
    return null;
  }
  if (typeof val === "number") {
    if (!Number.isSafeInteger(val) || val < 0) return null;
    return val;
  }
  if (typeof val === "bigint") {
    if (val < 0n || val > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(val);
  }
  if (typeof val === "string") {
    const s = val.trim();
    if (!/^\d+$/.test(s)) return null;
    try {
      const b = BigInt(s);
      if (b < 0n || b > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      return Number(b);
    } catch {
      return null;
    }
  }
  return null;
}

export function validateCheckBondRequest(
  contractAddress: string | undefined | null,
  jobId: string | undefined | null
): { ok: true; jobId: string; contractAddress: `0x${string}` } | { ok: false; failure: CheckBondFailureResult } {
  if (!jobId || !jobId.trim()) {
    return {
      ok: false,
      failure: {
        status: 400,
        body: {
          bonded: false,
          error: "MISSING_JOB_ID",
          reason: "Missing job parameter",
        },
      },
    };
  }

  const cleanedJobId = jobId.trim();
  if (!isExactAddress(contractAddress)) {
    return {
      ok: false,
      failure: {
        status: 503,
        body: {
          bonded: false,
          job_id: cleanedJobId,
          error: "CONTRACT_NOT_CONFIGURED",
          reason: "Contract address is not configured",
        },
      },
    };
  }

  return {
    ok: true,
    jobId: cleanedJobId,
    contractAddress: contractAddress.trim() as `0x${string}`,
  };
}

export function mapContractCheckBondResult(
  jobId: string,
  rawResult: unknown
): CheckBondSuccessResult | CheckBondFailureResult {
  let parsed: any;
  try {
    if (typeof rawResult === "string") {
      parsed = JSON.parse(rawResult);
    } else if (rawResult && typeof rawResult === "object" && !Array.isArray(rawResult)) {
      parsed = rawResult;
    } else {
      return {
        status: 503,
        body: {
          bonded: false,
          job_id: jobId,
          error: "INVALID_CONTRACT_RESPONSE",
          reason: "Contract returned invalid or malformed bond status",
        },
      };
    }
  } catch {
    return {
      status: 503,
      body: {
        bonded: false,
        job_id: jobId,
        error: "INVALID_CONTRACT_RESPONSE",
        reason: "Contract returned invalid or malformed bond status",
      },
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      status: 503,
      body: {
        bonded: false,
        job_id: jobId,
        error: "INVALID_CONTRACT_RESPONSE",
        reason: "Contract returned invalid or malformed bond status",
      },
    };
  }

  if (typeof parsed.bonded !== "boolean") {
    return {
      status: 503,
      body: {
        bonded: false,
        job_id: jobId,
        error: "INVALID_CONTRACT_RESPONSE",
        reason: "Contract returned invalid or malformed bond status",
      },
    };
  }

  if (!isExactAddress(parsed.writer)) {
    return {
      status: 503,
      body: {
        bonded: false,
        job_id: jobId,
        error: "INVALID_CONTRACT_RESPONSE",
        reason: "Contract returned invalid or malformed bond status",
      },
    };
  }

  if (typeof parsed.state !== "string" || !parsed.state.trim()) {
    return {
      status: 503,
      body: {
        bonded: false,
        job_id: jobId,
        error: "INVALID_CONTRACT_RESPONSE",
        reason: "Contract returned invalid or malformed bond status",
      },
    };
  }

  // Parse all 6 collateral wei amounts
  const normBond = parseWeiAmount(parsed.bond);
  const normTotalBond = parseWeiAmount(parsed.total_bond);
  const normReservedBond = parseWeiAmount(parsed.reserved_bond);
  const normAvailableBond = parseWeiAmount(parsed.available_bond);
  const normJobReservedBond = parseWeiAmount(parsed.job_reserved_bond);
  const normPayC = parseWeiAmount(parsed.pay_c);

  if (
    normBond === null ||
    normTotalBond === null ||
    normReservedBond === null ||
    normAvailableBond === null ||
    normJobReservedBond === null ||
    normPayC === null
  ) {
    return {
      status: 503,
      body: {
        bonded: false,
        job_id: jobId,
        error: "INVALID_CONTRACT_RESPONSE",
        reason: "Contract returned invalid or malformed bond status",
      },
    };
  }

  const normRep = parseRepAmount(parsed.rep);
  if (normRep === null) {
    return {
      status: 503,
      body: {
        bonded: false,
        job_id: jobId,
        error: "INVALID_CONTRACT_RESPONSE",
        reason: "Contract returned invalid or malformed bond status",
      },
    };
  }

  // Verify BigInt collateral invariants on every valid response
  const bBond = BigInt(normBond);
  const bTotalBond = BigInt(normTotalBond);
  const bReservedBond = BigInt(normReservedBond);
  const bAvailableBond = BigInt(normAvailableBond);
  const bJobReservedBond = BigInt(normJobReservedBond);
  const bPayC = BigInt(normPayC);

  // Invariant 1: bond == total_bond
  if (bBond !== bTotalBond) {
    return {
      status: 503,
      body: {
        bonded: false,
        job_id: jobId,
        error: "INVALID_CONTRACT_RESPONSE",
        reason: "Contract returned invalid or malformed bond status",
      },
    };
  }

  // Invariant 2: reserved_bond <= total_bond
  if (bReservedBond > bTotalBond) {
    return {
      status: 503,
      body: {
        bonded: false,
        job_id: jobId,
        error: "INVALID_CONTRACT_RESPONSE",
        reason: "Contract returned invalid or malformed bond status",
      },
    };
  }

  // Invariant 3: available_bond == total_bond - reserved_bond
  if (bAvailableBond !== bTotalBond - bReservedBond) {
    return {
      status: 503,
      body: {
        bonded: false,
        job_id: jobId,
        error: "INVALID_CONTRACT_RESPONSE",
        reason: "Contract returned invalid or malformed bond status",
      },
    };
  }

  // Invariant 4: job_reserved_bond <= reserved_bond
  if (bJobReservedBond > bReservedBond) {
    return {
      status: 503,
      body: {
        bonded: false,
        job_id: jobId,
        error: "INVALID_CONTRACT_RESPONSE",
        reason: "Contract returned invalid or malformed bond status",
      },
    };
  }

  const cleanState = parsed.state.trim();
  const cleanWriter = parsed.writer.trim();

  // If bonded == true, check additional invariants
  if (parsed.bonded === true) {
    if (!APPROVED_BONDED_STATES.has(cleanState)) {
      return {
        status: 503,
        body: {
          bonded: false,
          job_id: jobId,
          error: "INVALID_CONTRACT_RESPONSE",
          reason: "Contract returned invalid or malformed bond status",
        },
      };
    }
    if (bPayC <= 0n) {
      return {
        status: 503,
        body: {
          bonded: false,
          job_id: jobId,
          error: "INVALID_CONTRACT_RESPONSE",
          reason: "Contract returned invalid or malformed bond status",
        },
      };
    }
    if (bJobReservedBond !== bPayC) {
      return {
        status: 503,
        body: {
          bonded: false,
          job_id: jobId,
          error: "INVALID_CONTRACT_RESPONSE",
          reason: "Contract returned invalid or malformed bond status",
        },
      };
    }
    if (bJobReservedBond > bReservedBond) {
      return {
        status: 503,
        body: {
          bonded: false,
          job_id: jobId,
          error: "INVALID_CONTRACT_RESPONSE",
          reason: "Contract returned invalid or malformed bond status",
        },
      };
    }

    return {
      status: 200,
      body: {
        bonded: true,
        job_id: jobId,
        writer: cleanWriter,
        state: cleanState,
        bond: normBond,
        total_bond: normTotalBond,
        reserved_bond: normReservedBond,
        available_bond: normAvailableBond,
        job_reserved_bond: normJobReservedBond,
        pay_c: normPayC,
        rep: normRep,
      },
    };
  }

  // For bonded == false, still validate and return well-formed collateral amounts
  return {
    status: 200,
    body: {
      bonded: false,
      job_id: jobId,
      writer: cleanWriter,
      state: cleanState,
      bond: normBond,
      total_bond: normTotalBond,
      reserved_bond: normReservedBond,
      available_bond: normAvailableBond,
      job_reserved_bond: normJobReservedBond,
      pay_c: normPayC,
      rep: normRep,
      error: "NOT_BONDED",
      reason: "Writer is not bonded or job state invalid",
    },
  };
}

export function mapRpcReadError(jobId?: string): CheckBondFailureResult {
  return {
    status: 503,
    body: {
      bonded: false,
      ...(jobId ? { job_id: jobId } : {}),
      error: "RPC_READ_FAILED",
      reason: "Failed to read bond status from contract",
    },
  };
}
