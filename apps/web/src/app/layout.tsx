import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { NETWORK } from "@/lib/config";

export const metadata: Metadata = {
  title: "POP — Launch a coin. Build its liquidity.",
  description: "Proof of Pain launchpad on Solana: every launch builds nonwithdrawable liquidity from matched trading fees at fixed price bins.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Providers>
          <Nav network={NETWORK} />
          <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 md:px-6 py-5 pb-24 md:pb-10">{children}</main>
          <Footer network={NETWORK} />
        </Providers>
      </body>
    </html>
  );
}
