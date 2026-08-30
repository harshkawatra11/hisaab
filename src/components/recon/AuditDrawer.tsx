"use client";

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatINR } from "@/lib/money";
import type { Match } from "@/lib/types";

const SIGNAL_LABELS: { key: keyof Match["signals"]; label: string; weight: string }[] = [
  { key: "amountSim", label: "Amount similarity", weight: "40%" },
  { key: "dateSim", label: "Date similarity", weight: "20%" },
  { key: "nameSim", label: "Name similarity", weight: "25%" },
  { key: "refSim", label: "Reference similarity", weight: "15%" },
];

export function AuditDrawer({ match, open, onClose }: { match: Match | null; open: boolean; onClose: () => void }) {
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} direction="right">
      <DrawerContent className="h-full w-[420px] max-w-full ml-auto">
        {match && (
          <>
            <DrawerHeader>
              <DrawerTitle className="flex items-center gap-2">
                Match audit
                <Badge
                  variant="outline"
                  className={
                    match.decision === "MATCHED"
                      ? "bg-good/15 text-good border-good/30"
                      : match.decision === "REVIEW"
                        ? "bg-warning/15 text-warning border-warning/30"
                        : "bg-critical/15 text-critical border-critical/30"
                  }
                >
                  {match.decision}
                </Badge>
              </DrawerTitle>
            </DrawerHeader>

            <div className="px-4 pb-8 space-y-5 overflow-y-auto">
              <div>
                <div className="text-3xl font-heading font-bold tabular-figures">
                  {(match.confidence * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  confidence via {match.method} matching
                </div>
              </div>

              <div className="space-y-3">
                {SIGNAL_LABELS.map(({ key, label, weight }) => {
                  const value = match.signals[key];
                  const numeric = typeof value === "number" ? value : 0;
                  return (
                    <div key={key}>
                      <div className="flex justify-between text-xs mb-1">
                        <span>
                          {label} <span className="text-muted-foreground">({weight})</span>
                        </span>
                        <span className="tabular-figures">{value === null ? "n/a" : `${(numeric * 100).toFixed(0)}%`}</span>
                      </div>
                      <Progress value={value === null ? 0 : numeric * 100} className="h-1.5" />
                    </div>
                  );
                })}
              </div>

              <div className="text-xs space-y-1 border-t border-border pt-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Days apart</span>
                  <span className="tabular-figures">{match.signals.daysApart}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount delta</span>
                  <span className="tabular-figures">{formatINR(Math.abs(match.signals.deltaPaise))}</span>
                </div>
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Reason</div>
                <p className="text-sm">{match.reason}</p>
              </div>

              {match.method === "ai" && (
                <div className="text-xs bg-muted p-2.5 border border-border">
                  This candidate was reasoned about by the model, but its confidence is capped
                  below the 90% auto-post line by code. It can never post as MATCHED on its own.
                </div>
              )}
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
