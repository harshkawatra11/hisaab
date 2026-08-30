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
        Prototype, no sign-in
      </div>
    </aside>
  );
}
