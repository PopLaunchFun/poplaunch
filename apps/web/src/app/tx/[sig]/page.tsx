import { redirect } from "next/navigation";
import { explorerTx } from "@/lib/config";

export default async function Tx({ params }: { params: Promise<{ sig: string }> }) {
  const { sig } = await params;
  redirect(explorerTx(sig));
}
