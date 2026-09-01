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
      className="pointer-events-none fixed bottom-5 left-1/2 md:left-[calc(50%+124px)] -translate-x-1/2 z-40 flex flex-col items-center gap-0.5 bg-card/90 backdrop-blur-md px-3 py-1 rounded-full border border-border/80 shadow-sm"
      style={{
        animation: "fadeInUp 0.6s ease forwards",
      }}
    >
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-mono font-medium">
        scroll
      </span>
      <div
        className="flex flex-col items-center gap-0.5"
        style={{ animation: "scrollBounce 1.4s ease-in-out infinite" }}
      >
        <ChevronDown className="size-3.5 text-muted-foreground/70" strokeWidth={2} />
      </div>
      <style>{`
        @keyframes scrollBounce {
          0%, 100% { transform: translateY(0); opacity: 0.6; }
          50% { transform: translateY(3px); opacity: 1; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px) translateX(-50%); }
          to { opacity: 1; transform: translateY(0) translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
