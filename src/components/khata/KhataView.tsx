"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/money";
import type { PartyLedgerSummary } from "@/lib/engine/khata";
import type { Party } from "@/lib/types";

export interface KhataPartyRow {
  party: Party;
  summary: PartyLedgerSummary;
  medianDaysToPay: number;
}

export function KhataView({ rows, initialFocusId }: { rows: KhataPartyRow[]; initialFocusId?: string }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>(
    initialFocusId ?? rows.find((r) => r.summary.outstandingPaise > 0)?.party.id
  );

  const filtered = useMemo(
    () => rows.filter((r) => r.party.name.toLowerCase().includes(query.toLowerCase())),
    [rows, query]
  );

  const selected = rows.find((r) => r.party.id === selectedId);

  const youllGet = rows.reduce((s, r) => s + r.summary.outstandingPaise, 0);

  return (
    <div className="grid grid-cols-12 gap-2">
      <div className="col-span-5 bg-card border border-border flex flex-col max-h-[calc(100vh-140px)]">
        <div className="grid grid-cols-2 gap-2 p-3 border-b border-border">
          <div>
            <div className="text-[11px] text-muted-foreground">You&apos;ll get</div>
            <div className="font-heading font-bold tabular-figures">{formatINR(youllGet)}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Parties</div>
            <div className="font-heading font-bold tabular-figures">{rows.length}</div>
          </div>
        </div>
        <div className="p-2">
          <Input placeholder="Search name..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((r) => {
            const oldestBucket =
              r.summary.aging.d30PlusPaise > 0
                ? { label: "30d+", cls: "bg-critical/15 text-critical border-critical/30" }
                : r.summary.aging.d16to30Paise > 0
                  ? { label: "16-30d", cls: "bg-serious/15 text-serious border-serious/30" }
                  : r.summary.aging.d8to15Paise > 0
                    ? { label: "8-15d", cls: "bg-warning/15 text-warning border-warning/30" }
                    : r.summary.outstandingPaise > 0
                      ? { label: "0-7d", cls: "bg-good/15 text-good border-good/30" }
                      : null;

            return (
              <button
                key={r.party.id}
                onClick={() => setSelectedId(r.party.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-border text-sm flex items-center justify-between ${
                  selectedId === r.party.id ? "bg-muted" : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{r.party.name}</span>
                  {oldestBucket && (
                    <Badge variant="outline" className={`text-[9px] px-1 py-0 h-4 shrink-0 font-mono ${oldestBucket.cls}`}>
                      {oldestBucket.label}
                    </Badge>
                  )}
                </div>
                <span className="tabular-figures text-xs text-muted-foreground shrink-0 ml-2">
                  {r.summary.outstandingPaise > 0 ? formatINR(r.summary.outstandingPaise) : "settled"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="col-span-7 bg-card border border-border">
        {selected ? (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-heading font-bold text-lg">{selected.party.name}</div>
                <div className="text-xs text-muted-foreground">
                  {selected.party.phone} &middot; median {selected.medianDaysToPay}d to pay
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-heading font-bold tabular-figures">
                  {formatINR(selected.summary.outstandingPaise)}
                </div>
                <div className="text-[11px] text-muted-foreground">outstanding</div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-xs">
              {[
                { label: "0-7d", value: selected.summary.aging.d0to7Paise, cls: "text-good" },
                { label: "8-15d", value: selected.summary.aging.d8to15Paise, cls: "text-warning" },
                { label: "16-30d", value: selected.summary.aging.d16to30Paise, cls: "text-serious" },
                { label: "30d+", value: selected.summary.aging.d30PlusPaise, cls: "text-critical" },
              ].map((b) => (
                <div key={b.label} className="border border-border p-2">
                  <div className="text-muted-foreground">{b.label}</div>
                  <div className={`tabular-figures font-medium ${b.cls}`}>{formatINR(b.value)}</div>
                </div>
              ))}
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                Open credit sales
              </div>
              <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                {selected.summary.openSales.map((s) => (
                  <div key={s.transactionId} className="flex justify-between text-sm border-b border-border pb-1.5">
                    <span className="text-muted-foreground">{s.date}</span>
                    <span className="tabular-figures">{formatINR(s.openPaise)}</span>
                  </div>
                ))}
                {selected.summary.openSales.length === 0 && (
                  <div className="text-sm text-muted-foreground">No open credit sales.</div>
                )}
              </div>
            </div>

            <Badge variant="outline" className="text-[10px]">
              Send WhatsApp reminder, not wired in this prototype
            </Badge>
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground text-sm">Select a party.</div>
        )}
      </div>
    </div>
  );
}
