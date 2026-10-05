import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { NETWORK } from "@/lib/config";

export const metadata: Metadata = {
  title: "POP — Discover and launch coins",
  description: "Proof of Pain launchpad on Solana: every launch builds locked liquidity from matched trading fees at fixed price bins.",
};

export const viewport: Viewport = { themeColor: "#141719", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Providers>
          <Header network={NETWORK} />
          <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 md:px-8 pb-24 md:pb-12">{children}</main>
          <Footer network={NETWORK} />
        </Providers>
      </body>
    </html>
  );
}
