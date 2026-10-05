import Link from "next/link";
import { GIT_COMMIT } from "@/lib/config";

export function Footer({ network }: { network: string }) {
  return (
    <footer className="border-t border-line mt-12">
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-6 flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-muted items-center">
        <span className="wordmark text-text text-[14px]">POP</span>
        <Link className="link" href="/mechanism">How it works</Link>
        <Link className="link" href="/status">Status</Link>
        <Link className="link" href="/lab">Lab</Link>
        <span className="num">{network} · build {GIT_COMMIT}</span>
      </div>
    </footer>
  );
}
