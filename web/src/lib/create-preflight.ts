import { isExactAddress, ZERO_ADDRESS } from "./contract";

export const MIN_UI_DEADLINE_OFFSET_SECONDS = 7200; // 2 hours

export const DEADLINE_PRESETS = [
  { label: "2 Hours (Minimum)", offsetSeconds: 7200 },
  { label: "1 Day", offsetSeconds: 86400 },
  { label: "3 Days", offsetSeconds: 259200 },
  { label: "7 Days", offsetSeconds: 604800 },
] as const;

/**
 * Pure helper to compute an integer-safe absolute deadline timestamp.
 *
 * The Intelligent Contract enforces: deadline >= trusted chain time + 3600 seconds.
 * The UI enforces selectedOffsetSeconds >= 7200 seconds (2 hours) to provide
 * safety margin for wallet confirmation, consensus leader selection, and block inclusion.
 *
 * @param nowSeconds - Integer Unix timestamp in seconds at click time.
 * @param selectedOffsetSeconds - Selected offset in seconds (must be >= 7200).
 */
export function computeDeadline(nowSeconds: number, selectedOffsetSeconds: number): bigint {
  if (typeof nowSeconds !== "number" || !Number.isSafeInteger(nowSeconds) || nowSeconds <= 0) {
    throw new Error(`nowSeconds must be a positive safe integer: ${nowSeconds}`);
  }
  if (
    typeof selectedOffsetSeconds !== "number" ||
    !Number.isSafeInteger(selectedOffsetSeconds)
  ) {
    throw new Error(`selectedOffsetSeconds must be a safe integer: ${selectedOffsetSeconds}`);
  }
  if (selectedOffsetSeconds < MIN_UI_DEADLINE_OFFSET_SECONDS) {
    throw new Error(
      `Selected deadline offset (${selectedOffsetSeconds}s) is below the minimum required UI safety margin of ${MIN_UI_DEADLINE_OFFSET_SECONDS}s (2 hours)`
    );
  }
  return BigInt(nowSeconds) + BigInt(selectedOffsetSeconds);
}

export interface RoleValidationErrors {
  client?: string;
  writer?: string;
  publisher?: string;
  general?: string;
}

export interface RoleValidationResult {
  valid: boolean;
  errors: RoleValidationErrors;
}

/**
 * Validates Writer B, Publisher C, and connected Client A before creating a job.
 * Reuses the authoritative isExactAddress check and enforces pairwise uniqueness.
 */
export function validateJobRoles(
  client?: string | null,
  writer?: string | null,
  publisher?: string | null
): RoleValidationResult {
  const errors: RoleValidationErrors = {};

  const cleanClient = typeof client === "string" ? client.trim() : "";
  const cleanWriter = typeof writer === "string" ? writer.trim() : "";
  const cleanPublisher = typeof publisher === "string" ? publisher.trim() : "";

  // 1. Client check
  if (!cleanClient) {
    errors.client = "Client wallet not connected";
  } else if (cleanClient.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
    errors.client = "Client cannot be the zero address";
  } else if (!isExactAddress(cleanClient)) {
    errors.client = "Connected Client is not a valid 20-byte address";
  }

  // 2. Writer check
  if (!cleanWriter) {
    errors.writer = "Writer address is required";
  } else if (cleanWriter.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
    errors.writer = "Writer cannot be the zero address";
  } else if (!isExactAddress(cleanWriter)) {
    errors.writer = "Writer must be a valid 20-byte hex address (0x followed by 40 hex characters)";
  }

  // 3. Publisher check
  if (!cleanPublisher) {
    errors.publisher = "Publisher address is required";
  } else if (cleanPublisher.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
    errors.publisher = "Publisher cannot be the zero address";
  } else if (!isExactAddress(cleanPublisher)) {
    errors.publisher = "Publisher must be a valid 20-byte hex address (0x followed by 40 hex characters)";
  }

  // 4. Pairwise distinctness (case-insensitive)
  const isWriterExact = isExactAddress(cleanWriter);
  const isPublisherExact = isExactAddress(cleanPublisher);
  const isClientExact = isExactAddress(cleanClient);

  if (isWriterExact && isPublisherExact) {
    if (cleanWriter.toLowerCase() === cleanPublisher.toLowerCase()) {
      errors.writer = errors.writer || "Writer and Publisher cannot be the same address";
      errors.publisher = errors.publisher || "Writer and Publisher cannot be the same address";
    }
  }

  if (isClientExact && isWriterExact) {
    if (cleanClient.toLowerCase() === cleanWriter.toLowerCase()) {
      errors.writer = errors.writer || "Connected Client and Writer cannot be the same address";
    }
  }

  if (isClientExact && isPublisherExact) {
    if (cleanClient.toLowerCase() === cleanPublisher.toLowerCase()) {
      errors.publisher = errors.publisher || "Connected Client and Publisher cannot be the same address";
    }
  }

  const valid = Object.keys(errors).length === 0;
  return { valid, errors };
}

/**
 * Validates that the brief URL is a valid public HTTPS URL.
 * Rejects non-HTTPS schemes, embedded credentials, localhost, loopback / private IP ranges,
 * and the banned test fixture path.
 */
export function validatePublicBriefUrl(
  urlStr: string
): { ok: true; url: string } | { ok: false; error: string } {
  if (typeof urlStr !== "string" || !urlStr.trim()) {
    return { ok: false, error: "Brief URL cannot be empty" };
  }
  const trimmed = urlStr.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "Malformed URL format" };
  }

  // 1. Protocol must be HTTPS
  if (parsed.protocol !== "https:") {
    return { ok: false, error: `Invalid protocol "${parsed.protocol}". Brief URL must use HTTPS.` };
  }

  // 2. Reject embedded credentials
  if (parsed.username || parsed.password) {
    return { ok: false, error: "Brief URL must not contain username or password credentials" };
  }

  // 3. Reject banned makewhole fixture path
  if (trimmed.includes("/makewhole/fixtures") || trimmed.includes("makewhole/fixtures")) {
    return {
      ok: false,
      error: "The makewhole/fixtures test fixture path is banned. Use a real public gist or document URL.",
    };
  }

  // 4. Hostname checks
  let hostname = parsed.hostname.toLowerCase();
  // Strip IPv6 brackets if any
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    hostname = hostname.slice(1, -1);
  }

  // Check localhost
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { ok: false, error: "Brief URL cannot point to localhost" };
  }

  // Check IPv6 loopback and private/local
  if (hostname === "::1" || hostname === "0:0:0:0:0:0:0:1" || hostname === "::") {
    return { ok: false, error: "Brief URL cannot point to loopback address" };
  }
  if (hostname.startsWith("fe80:") || hostname.startsWith("fc00:") || hostname.startsWith("fd00:")) {
    return { ok: false, error: "Brief URL cannot point to local or private IPv6 address" };
  }

  // Check IPv4 loopback and private literals
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (ipv4Match) {
    const octets = [
      Number(ipv4Match[1]),
      Number(ipv4Match[2]),
      Number(ipv4Match[3]),
      Number(ipv4Match[4]),
    ];
    if (octets.some((o) => o < 0 || o > 255)) {
      return { ok: false, error: "Malformed IPv4 address in brief URL" };
    }
    const [o0, o1] = octets;
    if (o0 === 0) {
      return { ok: false, error: "Brief URL cannot point to 0.0.0.0/8 network" };
    }
    if (o0 === 127) {
      return { ok: false, error: "Brief URL cannot point to loopback address (127.0.0.0/8)" };
    }
    if (o0 === 10) {
      return { ok: false, error: "Brief URL cannot point to private network (10.0.0.0/8)" };
    }
    if (o0 === 172 && o1 >= 16 && o1 <= 31) {
      return { ok: false, error: "Brief URL cannot point to private network (172.16.0.0/12)" };
    }
    if (o0 === 192 && o1 === 168) {
      return { ok: false, error: "Brief URL cannot point to private network (192.168.0.0/16)" };
    }
    if (o0 === 169 && o1 === 254) {
      return { ok: false, error: "Brief URL cannot point to link-local network (169.254.0.0/16)" };
    }
  }

  // Check hostname format (must contain at least one dot or be a valid public hostname)
  if (!hostname.includes(".") && !hostname.includes(":")) {
    return { ok: false, error: `Invalid hostname "${hostname}". Public domain required.` };
  }

  return { ok: true, url: parsed.toString() };
}

export { isExactAddress, ZERO_ADDRESS };
