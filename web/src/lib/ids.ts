/** Job IDs are assigned by the Intelligent Contract (tx-correlated SHA-256). The UI never mints or remaps them. */

export function isJobId(value: string) {
  return /^0x[0-9a-fA-F]{64}$/.test(value.trim());
}
