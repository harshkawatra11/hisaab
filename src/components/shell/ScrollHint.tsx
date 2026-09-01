"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A subtle animated scroll hint that appears at the bottom of the main
 * content area and fades out once the user has scrolled down a bit.
 * Attaches to the nearest scrollable ancestor via a ref on the layout.
 */
export function ScrollHint() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Find the scrollable main element (the flex-1 overflow-y-auto sibling)
    const main = document.querySelector("main");
    if (!main) return;

    const handleScroll = () => {
      if (main.scrollTop > 80) {
        setVisible(false);
      }
    };

    // Re-show if the user scrolls back to top
    const handleScrollTop = () => {
      if (main.scrollTop < 20) setVisible(true);
    };

    main.addEventListener("scroll", handleScroll, { passive: true });
    main.addEventListener("scroll", handleScrollTop, { passive: true });

    return () => {
      main.removeEventListener("scroll", handleScroll);
      main.removeEventListener("scroll", handleScrollTop);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-6 right-6 z-40 flex flex-col items-center gap-1"
      style={{
        animation: "fadeInUp 0.6s ease forwards",
      }}
    >
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-mono">
        scroll
      </span>
      <div
        className="flex flex-col items-center gap-0.5"
        style={{ animation: "scrollBounce 1.4s ease-in-out infinite" }}
      >
        <ChevronDown className="size-4 text-muted-foreground/50" strokeWidth={1.5} />
        <ChevronDown className="size-4 text-muted-foreground/30" strokeWidth={1.5} style={{ marginTop: "-10px" }} />
      </div>
      <style>{`
        @keyframes scrollBounce {
          0%, 100% { transform: translateY(0); opacity: 0.7; }
          50% { transform: translateY(5px); opacity: 1; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
