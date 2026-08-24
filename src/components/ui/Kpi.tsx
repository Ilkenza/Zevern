export function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
}) {
  return (
    <div className="overview-kpi rounded-card border border-line bg-surface p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className="mono mt-2 text-[24px] font-semibold tracking-[-0.5px] text-ink">
        {value}
      </div>
      {hint && (
        <div className="mt-1.25 text-[11.5px] font-semibold text-muted">
          {hint}
        </div>
      )}
    </div>
  );
}
