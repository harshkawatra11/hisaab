"use client";

import { Mic, MicOff, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useVoiceSession } from "@/components/voice/useVoiceSession";
import { VoiceDock } from "@/components/voice/VoiceDock";
import { useEffect, useState } from "react";

export function VoiceButton() {
  const router = useRouter();
  const [dockOpen, setDockOpen] = useState(false);

  useEffect(() => {
    router.prefetch("/khata");
    router.prefetch("/reconcile");
    router.prefetch("/books");
  }, [router]);

  const handleFocus = (view: string, entityId?: string) => {
    const path = view === "control" ? "/" : `/${view}`;
    router.push(entityId ? `${path}?focus=${encodeURIComponent(entityId)}` : path);
  };

  const session = useVoiceSession(handleFocus);

  const isActive =
    session.status === "listening" ||
    session.status === "transcribing" ||
    session.status === "thinking" ||
    session.status === "speaking" ||
    session.status === "connecting";

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
      {isActive && (
        <div className="text-[10.5px] text-center text-sidebar-foreground/70 mt-2 px-2 leading-relaxed font-mono">
          {session.status === "connecting" && "connecting"}
          {session.status === "listening" && "listening"}
          {session.status === "transcribing" && "transcribing"}
          {session.status === "thinking" && "thinking"}
          {session.status === "speaking" && "speaking"}
        </div>
      )}

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
