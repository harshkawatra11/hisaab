"use client";

// The panel that slides in while a voice session is live: transcript
// on both sides of the conversation, and the tool-call trace, so a
// judge watching the demo sees the mechanism, not a black box. Showing
// "record_business_events -> 3 events posted" is worth more than
// hiding it behind a clean chat bubble.

import { X, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { UseVoiceSessionResult } from "@/components/voice/useVoiceSession";

export function VoiceDock({ session, onClose }: { session: UseVoiceSessionResult; onClose: () => void }) {
  return (
    <div className="fixed bottom-4 right-4 w-[380px] max-h-[70vh] bg-card border border-border shadow-lg flex flex-col z-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span
            className={`size-2 rounded-full ${
              session.status === "listening"
                ? "bg-good animate-pulse"
                : session.status === "speaking"
                  ? "bg-chart-1 animate-pulse"
                  : session.status === "transcribing" || session.status === "thinking"
                    ? "bg-chart-2 animate-pulse"
                    : "bg-muted-foreground"
            }`}
          />
          <span className="text-sm font-medium">{session.statusLabel}</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

      {session.durationWarning && (
        <div className="flex items-center gap-2 px-4 py-2 bg-warning/10 text-xs text-foreground border-b border-border">
          <AlertTriangle className="size-3.5 shrink-0 text-warning" />
          This session is running long and will close soon.
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
        {session.inputTranscript && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">You said</div>
            <div>{session.inputTranscript}</div>
          </div>
        )}
        {session.outputTranscript && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Hisaab</div>
            <div>{session.outputTranscript}</div>
          </div>
        )}

        {session.toolTrace.length > 0 && (
          <div className="pt-2 space-y-1.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Tool calls</div>
            {session.toolTrace.map((t, i) => (
              <div key={i} className="flex items-start gap-2 text-xs tabular-figures">
                <Badge variant="outline" className="shrink-0">
                  {t.name}
                </Badge>
                <span className="text-muted-foreground truncate">
                  {typeof t.result === "object" && t.result && "spokenSummary" in t.result
                    ? String((t.result as { spokenSummary?: string }).spokenSummary ?? "")
                    : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
