import Link from "next/link";
import { NETWORK, NETWORK_LABEL } from "@/lib/config";

export function Footer() {
  return (
    <footer className="mt-16 border-t-[3px] border-ink">
      <div className="mx-auto max-w-[1536px] px-4 md:px-[62px] py-7 flex flex-col md:flex-row md:items-center gap-4 text-[15px] font-bold">
        <span className="wordmark text-[22px]">pop launch</span>
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
          <Link href="/how-it-works" className="link">How it works</Link>
          <Link href="/terms" className="link">Terms</Link>
          <Link href="/privacy" className="link">Privacy</Link>
        </nav>
        <span className="md:ml-auto mono text-[13px] uppercase tracking-wider text-muted">{NETWORK_LABEL[NETWORK] ?? NETWORK}</span>
      </div>
    </footer>
  );
}
