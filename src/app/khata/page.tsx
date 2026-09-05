import { getStore } from "@/lib/store";
import { DEMO_OWNER_UID } from "@/lib/owner";
import { computePartyKhata } from "@/lib/engine/khata";
import { medianDaysToPay } from "@/lib/engine/forecast";
import { computeCreditScore } from "@/lib/engine/creditScore";
import { todayIST } from "@/lib/ids";
import { KhataView } from "@/components/khata/KhataView";

export const dynamic = "force-dynamic";

export default async function KhataPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const { focus } = await searchParams;
  const store = getStore();
  const [parties, transactions, exceptions] = await Promise.all([
    store.listParties(DEMO_OWNER_UID),
    store.listTransactions(DEMO_OWNER_UID),
    store.listExceptions(DEMO_OWNER_UID),
  ]);

  const asOfDate = transactions.length > 0 ? transactions[transactions.length - 1].date : todayIST();
  const customers = parties.filter((p) => p.kind === "customer");

  const rows = customers
    .map((party) => ({
      party,
      summary: computePartyKhata(transactions, party.id, asOfDate),
      medianDaysToPay: medianDaysToPay(transactions, party.id),
      creditScore: computeCreditScore(transactions, exceptions, party.id, asOfDate),
    }))
    .sort((a, b) => b.summary.outstandingPaise - a.summary.outstandingPaise);

  return (
    <div className="p-4 space-y-3 max-w-[1600px]">
      <h1 className="font-heading font-bold text-lg">Khata</h1>
      <KhataView rows={rows} initialFocusId={focus} />
    </div>
  );
}
