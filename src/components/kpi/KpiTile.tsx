import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export interface KpiTileProps {
  label: string;
  value: string;
  deltaPct?: number;
  deltaGoodDirection?: "up" | "down";
  caption?: string;
}

export function KpiTile({ label, value, deltaPct, deltaGoodDirection = "up", caption }: KpiTileProps) {
  const isPositive = deltaPct !== undefined && deltaPct >= 0;
  const isGood = deltaPct === undefined ? null : deltaGoodDirection === "up" ? isPositive : !isPositive;

  return (
    <div className="bg-card border border-border p-3.5 flex flex-col gap-1 min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">{label}</div>
      <div className="font-heading font-bold text-2xl tabular-figures leading-none">{value}</div>
      <div className="flex items-center justify-between mt-1">
        {deltaPct !== undefined ? (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-medium tabular-figures ${
              isGood ? "text-good" : "text-critical"
            }`}
          >
            {isPositive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(deltaPct).toFixed(1)}%
          </span>
        ) : (
          <span />
        )}
        {caption && <span className="text-[11px] text-muted-foreground truncate">{caption}</span>}
      </div>
    </div>
  );
}
