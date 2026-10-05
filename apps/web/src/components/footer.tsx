import Link from "next/link";
import { GIT_COMMIT } from "@/lib/config";

export function Footer({ network }: { network: string }) {
  return (
    <footer className="border-t border-line mt-10">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted items-center">
        <span className="wordmark text-text">POP</span>
        <Link className="link" href="/mechanism">How it works</Link>
        <Link className="link" href="/status">Status</Link>
        <Link className="link" href="/lab">Lab (simulator)</Link>
        <span className="num">{network} · build {GIT_COMMIT}</span>
        <span className="ml-auto max-w-xl">Experimental protocol. Reserves move with trading; there is no floor, no guaranteed exit, and graduation is a fee-history milestone, not a safety rating.</span>
      </div>
    </footer>
  );
}
