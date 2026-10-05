import Link from "next/link";
import { api } from "@/lib/api";
import { Explore } from "@/components/explore";
import { NETWORK } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await api.markets();
  return (
    <div>
      <section className="flex flex-wrap items-end justify-between gap-3 mt-1">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Launch a coin. Build its liquidity.</h1>
          <p className="text-sm text-muted mt-1">Every launch uses Proof of Pain. Trade and watch its liquidity scars form. <span className="text-muted/80">The market remembers.</span></p>
        </div>
        <Link href="/launch" className="btn btn-green">Launch coin</Link>
      </section>
      <Explore initial={data?.markets ?? null} network={NETWORK} />
    </div>
  );
}
