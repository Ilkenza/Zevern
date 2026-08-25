import { cn } from "@/lib/utils";

/** One figure beside a page title — how many, how much, how many are overdue. */
export type HeaderStat = { label: string; value: string; tone?: "gold" | "danger" };

/**
 * The top of a page.
 *
 * Before this, the money screens opened with a kicker, a 38px title and a line of
 * context, and the business screens opened with a bare 22px heading and a button.
 * They were the same app and did not look like it. This is the money treatment made
 * general, so Clients and Goals are recognisably two pages of one product.
 *
 * The stats are optional and deliberately small: a page title is not a dashboard, and
 * two figures beside it are the most that can be read without becoming one.
 */
export function PageHeader({
  kicker,
  title,
  lede,
  stats,
  actions,
  className,
}: {
  kicker?: string;
  title: string;
  lede?: string;
  stats?: HeaderStat[];
  actions?: React.ReactNode;
  className?: string;
}) {
  const shown = (stats ?? []).filter((s) => s.value);

  return (
    <div className={cn("zv-pagehead", className)}>
      <div className="min-w-0">
        {kicker && <span className="zv-pagehead-kicker">{kicker}</span>}
        <h1 className="zv-pagehead-title">{title}</h1>
        {lede && <p className="zv-pagehead-lede">{lede}</p>}
      </div>

      {(shown.length > 0 || actions) && (
        <div className="zv-pagehead-actions">
          {shown.length > 0 && (
            <div className="zv-pagehead-stats" aria-label={`${title} summary`}>
              {shown.map((s) => (
                <span key={s.label}>
                  <small>{s.label}</small>
                  <b
                    className={cn(
                      s.tone === "gold" && "text-gold",
                      s.tone === "danger" && "text-danger",
                    )}
                  >
                    {s.value}
                  </b>
                </span>
              ))}
            </div>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}
