import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Providers } from "@/components/providers";
import { DEMO, IS_MAINNET, NETWORK, NETWORK_LABEL } from "@/lib/config";

export const metadata: Metadata = {
  title: "Pop Launch — Back it. Fill it. Pop it.",
  description: "Community funded coins on Solana. Fill the balloon. Launch a coin together.",
};

export const viewport: Viewport = { themeColor: "#fcfaf6", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Providers>
          {(DEMO || !IS_MAINNET) && (
            <div className={`${DEMO ? "bg-yellow" : "bg-ink text-white"} text-[13px] md:text-sm`} role="status">
              <div className="mx-auto max-w-[1536px] px-4 md:px-[62px] min-h-8 py-1 flex items-center gap-2 mono uppercase tracking-wide">
                <span className={`w-2 h-2 rounded-full ${DEMO ? "bg-ink" : "bg-yellow"}`} aria-hidden />
                {NETWORK_LABEL[NETWORK] ?? NETWORK}
              </div>
            </div>
          )}
          <Header />
          <main className="flex-1 w-full">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
