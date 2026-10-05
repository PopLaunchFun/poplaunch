import Link from "next/link";
import { api } from "@/lib/api";
import { Explore } from "@/components/explore";
import { NETWORK } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await api.markets();
  return (
    <div>
      <section className="flex items-center justify-between gap-3 pt-4 md:pt-6">
        <h1 className="text-[22px] md:text-[24px] font-semibold leading-tight">Discover launches</h1>
        <Link href="/launch" className="btn btn-green md:hidden" aria-label="Launch coin">+ Launch</Link>
      </section>
      <Explore initial={data?.markets ?? null} network={NETWORK} />
    </div>
  );
}
