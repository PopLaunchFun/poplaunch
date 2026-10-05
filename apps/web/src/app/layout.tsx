import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Nav } from "@/components/nav";
import { NETWORK } from "@/lib/config";

export const metadata: Metadata = {
  title: "POP — The market remembers",
  description: "Proof of Pain: a Solana price-bin market where matched trading fees become nonwithdrawable liquidity at fixed price bins.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Providers>
          <div className="md:grid md:grid-cols-[220px_1fr] min-h-screen">
            <Nav network={NETWORK} />
            <main className="min-w-0 px-4 md:px-8 py-6 pb-28 md:pb-10">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
