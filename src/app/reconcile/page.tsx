import { getStore } from "@/lib/store";
import { DEMO_OWNER_UID } from "@/lib/owner";
import { KpiTile } from "@/components/kpi/KpiTile";
import { ReconcileTable } from "@/components/recon/ReconcileTable";
import { formatINR } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function ReconcilePage() {
  const store = getStore();
  const [matches, exceptions, transactions, externalRecords, latestRun] = await Promise.all([
    store.listMatches(DEMO_OWNER_UID),
    store.listExceptions(DEMO_OWNER_UID),
    store.listTransactions(DEMO_OWNER_UID),
    store.listExternalRecords(DEMO_OWNER_UID),
    store.getLatestRun(DEMO_OWNER_UID),
  ]);

  const openExceptions = exceptions.filter((e) => e.status === "open");
  const totalReconcilable =
    transactions.filter((t) => (t.type === "payment_in" || t.type === "payment_out") && t.method === "bank").length +
    transactions.filter((t) => t.type === "purchase").length;
  const matchedCount = matches.filter((m) => m.decision === "MATCHED").length;
  const totalVariancePaise = matches.reduce((s, m) => s + Math.abs(m.signals.deltaPaise), 0);

  const transactionById = Object.fromEntries(transactions.map((t) => [t.id, t]));
  const externalById = Object.fromEntries(externalRecords.map((e) => [e.id, e]));

  const precision = latestRun?.precision !== null && latestRun?.precision !== undefined ? `${(latestRun.precision * 100).toFixed(1)}%` : "—";
  const recall = latestRun?.recall !== null && latestRun?.recall !== undefined ? `${(latestRun.recall * 100).toFixed(1)}%` : "—";
  const f1 = latestRun?.f1 !== null && latestRun?.f1 !== undefined ? `${(latestRun.f1 * 100).toFixed(1)}%` : "—";

  return (
    <div className="p-4 space-y-3 max-w-[1600px]">
      <div className="flex items-baseline justify-between">
        <h1 className="font-heading font-bold text-lg">Reconcile</h1>
        {latestRun && (
          <span className="text-xs text-muted-foreground tabular-figures">
            last run {latestRun.runtimeMs}ms &middot; {matches.length} total matches
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 lg:grid-cols-7 gap-2">
        <KpiTile label="Processed" value={String(totalReconcilable)} caption="reconcilable records" />
        <KpiTile
          label="Match rate"
          value={`${totalReconcilable > 0 ? ((matchedCount / totalReconcilable) * 100).toFixed(1) : "0.0"}%`}
        />
        <KpiTile label="Total variance" value={formatINR(totalVariancePaise)} caption="across matched pairs" />
        <KpiTile label="Open exceptions" value={String(openExceptions.length)} />
        <KpiTile label="Precision" value={precision} caption="ground truth" />
        <KpiTile label="Recall" value={recall} caption="ground truth" />
        <KpiTile label="F1 Score" value={f1} caption="ground truth" />
      </div>

      <ReconcileTable
        matches={matches}
        exceptions={openExceptions}
        transactionById={transactionById}
        externalById={externalById}
      />
    </div>
  );
}
