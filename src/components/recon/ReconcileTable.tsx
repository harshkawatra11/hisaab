"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AuditDrawer } from "@/components/recon/AuditDrawer";
import { formatINR } from "@/lib/money";
import type { ExternalRecord, HisaabException, Match, Transaction } from "@/lib/types";

export interface ReconcileTableProps {
  matches: Match[];
  exceptions: HisaabException[];
  transactionById: Record<string, Transaction>;
  externalById: Record<string, ExternalRecord>;
}

function DecisionBadge({ decision }: { decision: Match["decision"] }) {
  return (
    <Badge
      variant="outline"
      className={
        decision === "MATCHED"
          ? "bg-good/15 text-good border-good/30"
          : decision === "REVIEW"
            ? "bg-warning/15 text-warning border-warning/30"
            : "bg-critical/15 text-critical border-critical/30"
      }
    >
      {decision}
    </Badge>
  );
}

export function ReconcileTable({ matches, exceptions, transactionById, externalById }: ReconcileTableProps) {
  const [selected, setSelected] = useState<Match | null>(null);

  const matched = matches.filter((m) => m.decision === "MATCHED");
  const review = matches.filter((m) => m.decision === "REVIEW");

  const rows = (list: Match[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground border-b border-border">
            <th className="text-left font-normal px-3 py-2">Internal</th>
            <th className="text-left font-normal px-3 py-2">External</th>
            <th className="text-left font-normal px-3 py-2">Method</th>
            <th className="text-right font-normal px-3 py-2">Confidence</th>
            <th className="text-left font-normal px-3 py-2">Decision</th>
          </tr>
        </thead>
        <tbody>
          {list.map((m) => {
            const internal = transactionById[m.internalTxnId];
            const external = externalById[m.externalRecordId];
            return (
              <tr
                key={m.id}
                onClick={() => setSelected(m)}
                className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/50"
              >
                <td className="px-3 py-2 tabular-figures">
                  {internal ? formatINR(internal.amountPaise) : m.internalTxnId}
                  <span className="text-muted-foreground ml-2">{internal?.partyNameRaw}</span>
                </td>
                <td className="px-3 py-2 tabular-figures text-muted-foreground">
                  {external ? formatINR(external.amountPaise) : m.externalRecordId}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{m.method}</td>
                <td className="px-3 py-2 text-right tabular-figures">{(m.confidence * 100).toFixed(0)}%</td>
                <td className="px-3 py-2">
                  <DecisionBadge decision={m.decision} />
                </td>
              </tr>
            );
          })}
          {list.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                Nothing here.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="bg-card border border-border">
      <Tabs defaultValue="all">
        <TabsList className="m-3">
          <TabsTrigger value="all">All ({matches.length})</TabsTrigger>
          <TabsTrigger value="matched">Matched ({matched.length})</TabsTrigger>
          <TabsTrigger value="review">Review ({review.length})</TabsTrigger>
          <TabsTrigger value="exceptions">Exceptions ({exceptions.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="all">{rows(matches)}</TabsContent>
        <TabsContent value="matched">{rows(matched)}</TabsContent>
        <TabsContent value="review">{rows(review)}</TabsContent>
        <TabsContent value="exceptions">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left font-normal px-3 py-2">Kind</th>
                  <th className="text-left font-normal px-3 py-2">Explanation</th>
                  <th className="text-right font-normal px-3 py-2">Amount</th>
                  <th className="text-left font-normal px-3 py-2">Severity</th>
                </tr>
              </thead>
              <tbody>
                {exceptions.map((exc) => (
                  <tr key={exc.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[10px]">
                        {exc.kind.replaceAll("_", " ").toLowerCase()}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 max-w-[420px]">{exc.explanation}</td>
                    <td className="px-3 py-2 text-right tabular-figures">
                      {exc.amountPaise ? formatINR(Math.abs(exc.amountPaise)) : ""}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          exc.severity === "high"
                            ? "text-critical"
                            : exc.severity === "medium"
                              ? "text-warning"
                              : "text-serious"
                        }
                      >
                        {exc.severity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <AuditDrawer match={selected} open={selected !== null} onClose={() => setSelected(null)} />
    </div>
  );
}
