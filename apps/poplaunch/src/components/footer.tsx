import Link from "next/link";
import { Wordmark } from "./header";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto max-w-[1200px] px-4 md:px-8 py-10 flex flex-col md:flex-row md:items-center gap-6">
        <Wordmark />
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[15px]" aria-label="Footer">
          <Link href="/#how" className="link">How it works</Link>
          <span className="text-muted" title="Terms arrive with the connected app (Stage 3).">Terms</span>
          <span className="text-muted" title="Privacy policy arrives with the connected app (Stage 3).">Privacy</span>
        </nav>
        <div className="md:ml-auto flex items-center gap-2 label">
          <span className="w-2 h-2 rounded-full bg-yellow border border-line" aria-hidden />
          Network: demo preview · no chain connected
        </div>
      </div>
    </footer>
  );
}
