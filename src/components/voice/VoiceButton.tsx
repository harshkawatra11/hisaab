"use client";

import { Mic, MicOff, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLiveSession } from "@/components/voice/useLiveSession";
import { VoiceDock } from "@/components/voice/VoiceDock";
import { useState } from "react";

export function VoiceButton() {
  const router = useRouter();
  const [dockOpen, setDockOpen] = useState(false);

  const handleFocus = (view: string, entityId?: string) => {
    const path = view === "control" ? "/" : `/${view}`;
    router.push(entityId ? `${path}?focus=${encodeURIComponent(entityId)}` : path);
  };

  const session = useLiveSession(handleFocus);

  const isActive = session.status === "listening" || session.status === "speaking" || session.status === "connecting";

  const handleClick = async () => {
    if (isActive) {
      session.stop();
      setDockOpen(false);
      return;
    }
    setDockOpen(true);
    await session.start();
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={`w-full flex items-center justify-center gap-2 py-3 font-heading font-semibold text-sm transition-colors ${
          isActive ? "bg-white text-sidebar" : "bg-white/95 text-sidebar hover:bg-white"
        }`}
      >
        {session.status === "connecting" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : isActive ? (
          <MicOff className="size-4" />
        ) : (
          <Mic className="size-4" />
        )}
        {isActive ? "Stop listening" : "Talk to Hisaab"}
      </button>
      <div className="text-[10.5px] text-center text-sidebar-foreground/70 mt-2 px-2 leading-relaxed border border-sidebar-border/60 rounded bg-sidebar-accent/30 py-1.5 font-mono">
        [ Hackathon prototype · not all features are fully wired in ]
      </div>

      {dockOpen && (
        <VoiceDock
          session={session}
          onClose={() => {
            session.stop();
            setDockOpen(false);
          }}
        />
      )}
    </>
  );
}
