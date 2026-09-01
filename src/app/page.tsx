import { loadDashboardData } from "@/lib/dashboard/queries";
import { computePnl } from "@/lib/engine/pnl";
import { addDays } from "@/lib/ids";
import { getStore } from "@/lib/store";
import { DEMO_OWNER_UID } from "@/lib/owner";
import { KpiTile } from "@/components/kpi/KpiTile";
import { CashFlowChart } from "@/components/charts/CashFlowChart";
import { MatchDonut } from "@/components/charts/MatchDonut";
import { IngestionBars } from "@/components/charts/IngestionBars";
import { AgingStack } from "@/components/charts/AgingStack";
import { InOutBars } from "@/components/charts/InOutBars";
import { GstBars } from "@/components/charts/GstBars";
import { formatCompactINR, formatINR } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Landmark, Smartphone, FileText, Mic } from "lucide-react";
import { ScrollHint } from "@/components/shell/ScrollHint";

export const dynamic = "force-dynamic";

export default async function ControlPage() {
  const data = await loadDashboardData();
  const store = getStore();
  const transactions = await store.listTransactions(DEMO_OWNER_UID);
  const products = await store.listProducts(DEMO_OWNER_UID);
  const pnl = computePnl(transactions, products, addDays(data.asOfDate, -29), data.asOfDate);

  const panel = "bg-card border border-border";
  const panelTitle = "text-[11px] uppercase tracking-wide text-muted-foreground px-3.5 pt-3";

  return (
    <div className="p-4 space-y-3 max-w-[1600px]">
      <div className="flex items-baseline justify-between">
        <h1 className="font-heading font-bold text-lg">Control</h1>
        <span className="text-xs text-muted-foreground tabular-figures">as of {data.asOfDate}</span>
      </div>

      {/* Row 1: KPI strip */}
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
        <KpiTile label="Cash position" value={formatCompactINR(data.kpis.cashPaise)} caption="in hand" />
        <KpiTile label="Bank balance" value={formatCompactINR(data.kpis.bankPaise)} caption="settled" />
        <KpiTile label="Receivables" value={formatCompactINR(data.kpis.receivablesPaise)} caption="udhaar out" />
        <KpiTile label="Payables" value={formatCompactINR(data.kpis.payablesPaise)} caption="owed to suppliers" />
        <KpiTile label="Match rate" value={`${data.kpis.matchRatePct.toFixed(1)}%`} caption="settlements" />
        <KpiTile label="Open exceptions" value={String(data.kpis.openExceptionsCount)} caption="need review" />
        <KpiTile label="Net GST payable" value={formatCompactINR(data.kpis.netGstPayablePaise)} caption="this period" />
        <KpiTile label="30-day net profit" value={formatCompactINR(pnl.netProfitPaise)} caption={`${pnl.grossMarginPct.toFixed(1)}% margin`} />
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-12 gap-2">
        <div className={`${panel} col-span-12 lg:col-span-6`}>
          <div className={panelTitle}>Cash position, projected 21 days</div>
          <div className="p-2">
            <CashFlowChart data={data.cashFlowSeries} shortfallDate={data.shortfallDate} />
          </div>
          {data.shortfallDate && (
            <div className="px-3.5 pb-3 text-xs text-critical">
              Projected shortfall of {formatINR(data.shortfallPaise)} around {data.shortfallDate}, driven by{" "}
              {data.forecastDrivers[0]?.label.toLowerCase()}.
            </div>
          )}
        </div>
        <div className={`${panel} col-span-6 lg:col-span-3`}>
          <div className={panelTitle}>Reconciliation</div>
          <div className="p-2">
            <MatchDonut matched={data.matchSummary.matched} review={data.matchSummary.review} exception={data.matchSummary.exception} />
          </div>
          {/* P/R/F1 micro-table */}
          <div className="px-3.5 pb-3 border-t border-border pt-2">
            <div className="grid grid-cols-3 gap-1 text-center">
              {([
                { label: "Precision", value: data.evalMetrics.precision },
                { label: "Recall", value: data.evalMetrics.recall },
                { label: "F1", value: data.evalMetrics.f1 },
              ] as const).map(({ label, value }) => (
                <div key={label} className="space-y-0.5">
                  <div className="text-[17px] font-heading font-bold tabular-figures text-foreground">
                    {(value * 100).toFixed(1)}%
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className={`${panel} col-span-6 lg:col-span-3 flex flex-col`}>
          <div className={panelTitle}>Live exceptions</div>
          <div className="p-2 flex-1 overflow-y-auto max-h-[190px] space-y-1.5">
            {data.openExceptions.slice(0, 6).map((exc) => (
              <div key={exc.id} className="flex items-center justify-between text-xs gap-2">
                <span
                  className={`size-1.5 shrink-0 rounded-full ${
                    exc.severity === "high" ? "bg-critical" : exc.severity === "medium" ? "bg-warning" : "bg-serious"
                  }`}
                />
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {exc.kind.replaceAll("_", " ").toLowerCase()}
                </Badge>
                <span className="ml-auto tabular-figures text-muted-foreground truncate">
                  {exc.amountPaise ? formatCompactINR(Math.abs(exc.amountPaise)) : ""}
                </span>
              </div>
            ))}
            {data.openExceptions.length === 0 && (
              <div className="text-xs text-muted-foreground">No open exceptions.</div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3 */}
      <div className="grid grid-cols-12 gap-2">
        <div className={`${panel} col-span-12 lg:col-span-5`}>
          <div className={panelTitle}>Multi-source ingestion</div>
          {/* Source icon strip */}
          <div className="flex gap-4 px-3.5 pt-2 pb-0 text-[10px] text-muted-foreground">
            {(["bank", "upi", "invoice", "voice"] as const).map((src) => {
              const Icon = src === "bank" ? Landmark : src === "upi" ? Smartphone : src === "invoice" ? FileText : Mic;
              return (
                <div key={src} className="flex items-center gap-1 capitalize">
                  <Icon className="size-3" strokeWidth={1.5} />
                  {src}
                </div>
              );
            })}
          </div>
          <div className="p-2">
            <IngestionBars data={data.ingestion} />
          </div>
        </div>
        <div className={`${panel} col-span-6 lg:col-span-4`}>
          <div className={panelTitle}>Khata aging</div>
          <div className="p-2">
            <AgingStack
              data={[
                { bucket: "0-7d", amountPaise: data.aging.d0to7Paise },
                { bucket: "8-15d", amountPaise: data.aging.d8to15Paise },
                { bucket: "16-30d", amountPaise: data.aging.d16to30Paise },
                { bucket: "30d+", amountPaise: data.aging.d30PlusPaise },
              ]}
            />
          </div>
          <div className="px-3.5 pb-3 space-y-1">
            {data.topDebtors.map((d) => (
              <div key={d.partyId} className="flex justify-between text-xs">
                <span className="truncate">{d.name}</span>
                <span className="tabular-figures text-muted-foreground">{formatCompactINR(d.outstandingPaise)}</span>
              </div>
            ))}
          </div>
        </div>
        {/* D4: Timestamped activity feed */}
        <div className={`${panel} col-span-6 lg:col-span-3 flex flex-col`}>
          <div className={panelTitle}>Today&apos;s activity</div>
          <div className="p-2 flex-1 overflow-y-auto max-h-[190px] space-y-1">
            {data.todayTxns.length === 0 && (
              <div className="text-xs text-muted-foreground px-1.5 py-2">No transactions today.</div>
            )}
            {[...data.todayTxns]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .slice(0, 8)
              .map((t) => {
                const time = new Date(t.createdAt).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                  timeZone: "Asia/Kolkata",
                });
                const typeLabel = t.type.replace("_", " ");
                return (
                  <div key={t.id} className="flex items-center gap-2 text-xs">
                    <span className="tabular-figures text-muted-foreground shrink-0 font-mono text-[10px]">{time}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0 capitalize">{typeLabel}</Badge>
                    <span className="truncate text-muted-foreground">{t.partyNameRaw}</span>
                    <span className="ml-auto tabular-figures shrink-0">{formatCompactINR(t.amountPaise)}</span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Row 4 */}
      <div className="grid grid-cols-12 gap-2">
        <div className={`${panel} col-span-12 lg:col-span-5`}>
          <div className={panelTitle}>Inflow / outflow, 14 days</div>
          <div className="p-2">
            <InOutBars data={data.inOutSeries} />
          </div>
        </div>
        <div className={`${panel} col-span-6 lg:col-span-4`}>
          <div className={panelTitle}>GST, input vs output</div>
          <div className="p-2">
            <GstBars outputPaise={data.gst.outputGstPaise} inputPaise={data.gst.inputGstPaise} />
          </div>
          <div className="px-3.5 pb-3 text-xs text-muted-foreground">
            Net payable {formatCompactINR(data.gst.netPayablePaise)}
          </div>
        </div>
        <div className={`${panel} col-span-6 lg:col-span-3`}>
          <div className={panelTitle}>Detected recurring patterns</div>
          <div className="p-3.5 space-y-2 text-xs max-h-[190px] overflow-y-auto">
            {data.recurringPatterns.slice(0, 5).map((p, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-muted-foreground">Every {p.medianGapDays}d</span>
                <span className="tabular-figures">{(p.confidence * 100).toFixed(0)}% confident</span>
              </div>
            ))}
            {data.recurringPatterns.length === 0 && (
              <div className="text-muted-foreground">Not enough history yet.</div>
            )}
          </div>
        </div>
      </div>

      {/* Row 5: recent matches */}
      <div className={`${panel} col-span-12`}>
        <div className={panelTitle}>Recent matches</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left font-normal px-3.5 py-2">Transaction</th>
                <th className="text-left font-normal px-3.5 py-2">Method</th>
                <th className="text-right font-normal px-3.5 py-2">Confidence</th>
                <th className="text-left font-normal px-3.5 py-2">Decision</th>
              </tr>
            </thead>
            <tbody>
              {data.recentMatches.map((m) => {
                const txn = data.transactionById.get(m.internalTxnId);
                const confPct = m.confidence * 100;
                const confColor =
                  m.decision === "MATCHED"
                    ? "var(--color-good)"
                    : m.decision === "REVIEW"
                      ? "var(--color-warning)"
                      : "var(--color-critical)";
                return (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="px-3.5 py-2 tabular-figures">
                      {txn ? formatINR(txn.amountPaise) : m.internalTxnId}
                      <span className="text-muted-foreground ml-2">{txn?.partyNameRaw}</span>
                    </td>
                    <td className="px-3.5 py-2 text-muted-foreground">{m.method}</td>
                    {/* D1: Inline confidence bar */}
                    <td className="px-3.5 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${confPct}%`, backgroundColor: confColor }}
                          />
                        </div>
                        <span className="tabular-figures text-[11px] text-muted-foreground w-7">
                          {confPct.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-3.5 py-2">
                      <Badge
                        className={
                          m.decision === "MATCHED"
                            ? "bg-good/15 text-good border-good/30"
                            : m.decision === "REVIEW"
                              ? "bg-warning/15 text-warning border-warning/30"
                              : "bg-critical/15 text-critical border-critical/30"
                        }
                        variant="outline"
                      >
                        {m.decision}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ScrollHint />
    </div>
  );
}
