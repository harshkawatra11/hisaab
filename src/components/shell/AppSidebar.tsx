"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Scale, Users, BookOpen, Settings, Info } from "lucide-react";
import { VoiceButton } from "@/components/voice/VoiceButton";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { MethodologyContent } from "@/components/shell/MethodologySheet";

const NAV_ITEMS = [
  { href: "/", label: "Control", icon: LayoutGrid },
  { href: "/reconcile", label: "Reconcile", icon: Scale },
  { href: "/khata", label: "Khata", icon: Users },
  { href: "/books", label: "Books", icon: BookOpen },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[248px] shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
      <div className="px-5 pt-6 pb-5">
        <div className="font-heading font-bold text-xl tracking-tight text-white">Hisaab</div>
        <div className="text-xs text-sidebar-foreground/60 mt-0.5">हिसाब · finance controller</div>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm border-l-2 transition-colors ${
                active
                  ? "border-white bg-sidebar-accent text-white font-medium"
                  : "border-transparent text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/60"
              }`}
            >
              <Icon className="size-4" strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}

        <a
          href="https://github.com/harshkawatra11/hisaab"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between px-3 py-2.5 text-sm border-l-2 border-transparent text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/60 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <svg className="size-4 fill-current text-white/80 group-hover:text-white" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <span>GitHub</span>
          </div>
          <span className="text-[10px] text-sidebar-foreground/40 font-mono tracking-wider group-hover:text-white/60">↗</span>
        </a>
      </nav>

      <div className="px-3 pb-3">
        <VoiceButton />
      </div>

      <div className="px-3 pb-3 space-y-1 border-t border-sidebar-border pt-3">
        <button className="flex w-full items-center gap-3 px-3 py-2 text-sm text-sidebar-foreground/60 hover:text-white transition-colors">
          <Settings className="size-4" strokeWidth={2} />
          Settings
        </button>
        <Sheet>
          <SheetTrigger asChild>
            <button className="flex w-full items-center gap-3 px-3 py-2 text-sm text-sidebar-foreground/60 hover:text-white transition-colors">
              <Info className="size-4" strokeWidth={2} />
              Methodology
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Methodology</SheetTitle>
            </SheetHeader>
            <MethodologyContent />
          </SheetContent>
        </Sheet>
      </div>

      <div className="px-5 py-4 border-t border-sidebar-border text-xs text-sidebar-foreground/50">
        Demo mode, no sign-in
      </div>
    </aside>
  );
}
