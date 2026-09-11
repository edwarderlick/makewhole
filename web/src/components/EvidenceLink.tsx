export function EvidenceLink({ href, label }: { href?: string; label?: string }) {
  if (!href) return <span className="font-label-code text-[12px] text-on-surface-variant">—</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-pad-2xs bg-surface-container-high hover:bg-secondary-container px-pad-xs py-pad-2xs font-label-status text-[11px]"
    >
      <span>{label || "PUBLIC EVIDENCE"}</span>
      <span>↗</span>
    </a>
  );
}
