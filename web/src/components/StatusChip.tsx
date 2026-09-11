import type { JobState } from "@/lib/contract";

const styles: Record<string, string> = {
  OPEN: "bg-surface-container text-on-surface border border-outline-variant",
  BONDED: "bg-secondary-container text-on-secondary-fixed",
  IN_FLIGHT: "bg-amber-100 text-amber-900 border border-amber-400",
  ACKED: "bg-cyan-50 text-cyan-900 border border-cyan-400",
  SETTLED_OK: "bg-secondary-fixed text-on-secondary-fixed",
  SETTLED_RUG: "bg-error-container text-on-error-container",
  CANCELED: "bg-surface-container-high text-on-surface-variant",
  UNDETERMINED: "bg-surface-container-highest text-on-surface",
};

export function StatusChip({ state }: { state: JobState | string }) {
  return (
    <span
      className={`inline-flex items-center font-label-status text-[11px] tracking-[0.08em] uppercase px-pad-xs py-pad-2xs ${styles[state] || styles.OPEN}`}
    >
      [ {state} ]
    </span>
  );
}
