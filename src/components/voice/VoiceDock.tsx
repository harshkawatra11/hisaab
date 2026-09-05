"use client";

// The full-screen overlay shown while a voice session is live: one
// orb at the center that visibly changes as the agent listens,
// transcribes, thinks and speaks, a status banner naming the stage,
// and the transcript in the bottom-right corner in real ink, not the
// low-contrast grey a first pass at this used. The tool-call trace
// (record_business_events -> 3 events posted) stays available as a
// collapsible strip rather than gone entirely: a judge watching this
// live should be able to see the mechanism isn't a black box, without
// it competing with the orb for attention by default.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";
import { X, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { UseVoiceSessionResult, VoiceStatus } from "@/components/voice/useVoiceSession";

const ORB_ANIMATION: Record<VoiceStatus, { scale: number[]; opacity: number[]; duration: number }> = {
  idle: { scale: [1, 1], opacity: [0.6, 0.6], duration: 2 },
  connecting: { scale: [0.96, 1.04], opacity: [0.5, 0.8], duration: 0.9 },
  listening: { scale: [1, 1.06, 1], opacity: [0.7, 0.9, 0.7], duration: 2.2 },
  transcribing: { scale: [0.98, 1.02], opacity: [0.6, 0.85], duration: 0.7 },
  thinking: { scale: [0.97, 1.03], opacity: [0.55, 0.9], duration: 0.6 },
  speaking: { scale: [1, 1.14, 1], opacity: [0.85, 1, 0.85], duration: 0.55 },
  typed: { scale: [1, 1], opacity: [0.5, 0.5], duration: 2 },
  error: { scale: [1, 1], opacity: [0.4, 0.4], duration: 2 },
};

const ORB_RING_CLASS: Record<VoiceStatus, string> = {
  idle: "border-muted-foreground/30",
  connecting: "border-chart-2",
  listening: "border-good",
  transcribing: "border-chart-2",
  thinking: "border-chart-2",
  speaking: "border-chart-1",
  typed: "border-muted-foreground/30",
  error: "border-destructive",
};

export function VoiceDock({ session, onClose }: { session: UseVoiceSessionResult; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const [traceOpen, setTraceOpen] = useState(false);

  useEffect(() => {
    const tl = gsap.timeline();
    tl.fromTo(
      overlayRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 0.25, ease: "power1.out" }
    ).fromTo(
      orbRef.current,
      { scale: 0.6, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(1.7)" },
      "-=0.1"
    );
    return () => {
      tl.kill();
    };
  }, []);

  const handleClose = () => {
    const tl = gsap.timeline({ onComplete: onClose });
    tl.to(orbRef.current, { scale: 0.6, opacity: 0, duration: 0.2, ease: "power1.in" }).to(
      overlayRef.current,
      { opacity: 0, duration: 0.2, ease: "power1.in" },
      "-=0.1"
    );
  };

  const orbAnim = ORB_ANIMATION[session.status];
  const ringClass = ORB_RING_CLASS[session.status];

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm"
    >
      <button
        onClick={handleClose}
        className="absolute top-6 right-6 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Close voice session"
      >
        <X className="size-6" />
      </button>

      {session.durationWarning && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-warning/10 border border-warning/40 text-xs text-foreground">
          <AlertTriangle className="size-3.5 shrink-0 text-warning" />
          This session is running long and will close soon.
        </div>
      )}

      <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>
        <div
          className="absolute inset-0 rounded-full bg-primary/30 blur-2xl"
          aria-hidden
        />
        <motion.div
          ref={orbRef}
          animate={{ scale: orbAnim.scale, opacity: orbAnim.opacity }}
          transition={{ duration: orbAnim.duration, repeat: Infinity, ease: "easeInOut" }}
          className={`relative size-36 rounded-full border-4 ${ringClass} bg-gradient-to-br from-primary to-[#0a1a3f] shadow-[0_0_60px_rgba(20,48,110,0.45)]`}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={session.statusLabel}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="mt-8 font-heading text-lg font-semibold tracking-wide text-foreground"
        >
          {session.statusLabel}
        </motion.div>
      </AnimatePresence>

      <div className="fixed bottom-6 right-6 w-[380px] max-w-[calc(100vw-3rem)] max-h-[60vh] flex flex-col bg-card border border-border shadow-lg">
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
          <AnimatePresence>
            {session.inputTranscript && (
              <motion.div
                key="input"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">You said</div>
                <div className="text-foreground">{session.inputTranscript}</div>
              </motion.div>
            )}
            {session.outputTranscript && (
              <motion.div
                key="output"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Hisaab</div>
                <div className="text-foreground">{session.outputTranscript}</div>
              </motion.div>
            )}
          </AnimatePresence>
          {!session.inputTranscript && !session.outputTranscript && (
            <div className="text-muted-foreground text-xs">Say something to Hisaab.</div>
          )}
        </div>

        {session.toolTrace.length > 0 && (
          <div className="border-t border-border">
            <button
              onClick={() => setTraceOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>Tool calls ({session.toolTrace.length})</span>
              {traceOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
            <AnimatePresence>
              {traceOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-3 space-y-1.5">
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
