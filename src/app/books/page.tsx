import { getStore } from "@/lib/store";
import { DEMO_OWNER_UID } from "@/lib/owner";
import { addDays, todayIST } from "@/lib/ids";
import { computeGstSummary, checkInvoiceTax } from "@/lib/engine/tax";
import { computePnl } from "@/lib/engine/pnl";
import { detectRecurringPatterns, forecastCashPosition } from "@/lib/engine/forecast";
import { CashFlowChart } from "@/components/charts/CashFlowChart";
import { GstBars } from "@/components/charts/GstBars";
import { KpiTile } from "@/components/kpi/KpiTile";
import { formatCompactINR, formatINR } from "@/lib/money";
import type { Account } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BooksPage() {
  const store = getStore();
  const [transactions, ledgerEntries, products, externalRecords] = await Promise.all([
    store.listTransactions(DEMO_OWNER_UID),
    store.listLedgerEntries(DEMO_OWNER_UID),
    store.listProducts(DEMO_OWNER_UID),
    store.listExternalRecords(DEMO_OWNER_UID),
  ]);

  function balance(account: Account): number {
    return ledgerEntries.filter((e) => e.account === account).reduce((s, e) => s + e.debitPaise - e.creditPaise, 0);
  }
  const cashPaise = balance("CASH") + balance("BANK");
  const asOfDate = transactions.length > 0 ? transactions[transactions.length - 1].date : todayIST();
  const unitPriceByProduct = new Map(products.map((p) => [p.id, p.unitPricePaise]));

  const forecast = forecastCashPosition({
    transactions,
    openingCashPaise: cashPaise,
    asOfDate,
    horizonDays: 30,
    unitPriceByProduct,
  });
  const patterns = detectRecurringPatterns(transactions);
  const forecastSeries = forecast.days.map((d, i) => ({
    date: d.date,
    actualPaise: i === 0 ? cashPaise : null,
    forecastPaise: d.closingPaise,
  }));

  const gst = computeGstSummary(transactions);
  const pnl = computePnl(transactions, products, addDays(asOfDate, -29), asOfDate);

  const invoiceRecords = externalRecords.filter((e) => e.source === "invoice");
  const taxChecks = invoiceRecords
    .filter((r) => r.basePaise !== undefined && r.ratePct !== undefined)
    .map((r) => ({
      record: r,
      check: checkInvoiceTax({
        basePaise: r.basePaise!,
        ratePct: r.ratePct!,
        declaredCgstPaise: r.declaredCgstPaise ?? 0,
        declaredSgstPaise: r.declaredSgstPaise ?? 0,
      }),
    }))
    .filter((x) => x.check.isDiscrepant);

  const panel = "bg-card border border-border";
  const panelTitle = "text-[11px] uppercase tracking-wide text-muted-foreground px-3.5 pt-3";

  return (
    <div className="p-4 space-y-4 max-w-[1600px]">
      <h1 className="font-heading font-bold text-lg">Books</h1>

      <section className="space-y-2">
        <h2 className="text-sm font-heading font-semibold">Forecast</h2>
        <div className="grid grid-cols-12 gap-2">
          <div className={`${panel} col-span-8`}>
            <div className={panelTitle}>Projected cash position, 30 days</div>
            <div className="p-2">
              <CashFlowChart data={forecastSeries} shortfallDate={forecast.shortfallDate} />
            </div>
          </div>
          <div className={`${panel} col-span-4 p-3.5 space-y-3`}>
            {forecast.shortfallDate ? (
              <div className="text-xs text-critical">
                Shortfall of {formatINR(forecast.shortfallPaise)} projected around {forecast.shortfallDate}.
              </div>
            ) : (
              <div className="text-xs text-good">No shortfall projected over 30 days.</div>
            )}
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Largest drivers</div>
              {forecast.drivers.map((d, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{d.label}</span>
                  <span className="tabular-figures">{formatCompactINR(d.amountPaise)}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                Recurring patterns detected
              </div>
              {patterns.slice(0, 4).map((p, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Every {p.medianGapDays} days</span>
                  <span className="tabular-figures">{(p.confidence * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-heading font-semibold">Tax</h2>
        <div className="grid grid-cols-12 gap-2">
          <div className={`${panel} col-span-5`}>
            <div className={panelTitle}>GST, input vs output</div>
            <div className="p-2">
              <GstBars outputPaise={gst.outputGstPaise} inputPaise={gst.inputGstPaise} />
            </div>
            <div className="px-3.5 pb-3 text-sm">
              Net payable <span className="tabular-figures font-medium">{formatINR(gst.netPayablePaise)}</span>
            </div>
          </div>
          <div className={`${panel} col-span-7`}>
            <div className={panelTitle}>Tax discrepancies ({taxChecks.length})</div>
            <div className="p-2 max-h-[220px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left font-normal px-2 py-1.5">Invoice</th>
                    <th className="text-right font-normal px-2 py-1.5">Expected GST</th>
                    <th className="text-right font-normal px-2 py-1.5">Declared</th>
                    <th className="text-right font-normal px-2 py-1.5">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {taxChecks.map(({ record, check }) => (
                    <tr key={record.id} className="border-b border-border last:border-0">
                      <td className="px-2 py-1.5">{record.reference}</td>
                      <td className="px-2 py-1.5 text-right tabular-figures">
                        {formatINR(check.expectedCgstPaise + check.expectedSgstPaise)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-figures">
                        {formatINR(check.declaredCgstPaise + check.declaredSgstPaise)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-figures text-critical">
                        {formatINR(Math.abs(check.deltaPaise))}
                      </td>
                    </tr>
                  ))}
                  {taxChecks.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-2 py-4 text-center text-muted-foreground">
                        No discrepancies found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-heading font-semibold">P&amp;L, trailing 30 days</h2>
        <div className="grid grid-cols-5 gap-2">
          <KpiTile label="Revenue" value={formatCompactINR(pnl.revenuePaise)} />
          <KpiTile label="COGS" value={formatCompactINR(pnl.cogsPaise)} />
          <KpiTile label="Gross margin" value={`${pnl.grossMarginPct.toFixed(1)}%`} />
          <KpiTile label="Expenses" value={formatCompactINR(pnl.expensesPaise)} />
          <KpiTile label="Net profit" value={formatCompactINR(pnl.netProfitPaise)} />
        </div>
      </section>
    </div>
  );
}
