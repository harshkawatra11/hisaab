import type { Metadata } from "next";
import { Inter, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppSidebar } from "@/components/shell/AppSidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hisaab, AI Finance Controller",
  description: "The books, spoken into existence, then checked against the bank.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${manrope.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="h-screen overflow-hidden flex bg-background text-foreground">
        <TooltipProvider>
          <AppSidebar />
          <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
