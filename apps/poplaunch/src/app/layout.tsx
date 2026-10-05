import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { DemoBanner } from "@/components/demo-banner";
import { DEMO } from "@/demo/fixtures";

export const metadata: Metadata = {
  title: "Pop Launch — Back a coin. Fill the balloon. Launch together.",
  description: "A community-funded Solana coin launchpad. Backers fill a coin's balloon to its SOL target; when it pops, the pool opens and backers claim their tokens.",
};

export const viewport: Viewport = { themeColor: "#fff9f0", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        {DEMO && <DemoBanner />}
        <Header />
        <main className="flex-1 w-full">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
