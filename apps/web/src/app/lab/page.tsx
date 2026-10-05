import { Lab } from "@/components/lab";

export default function LabPage() {
  return (
    <div className="pt-4 md:pt-6">
      <div className="flex items-center gap-3 flex-wrap"><h1 className="text-[22px] md:text-[24px] font-semibold leading-tight">Lab</h1><span className="tag tag-violet">simulator · no wallet · no real trades</span></div>
      <p className="text-[14px] text-muted mt-2">Runs the exact integer engine of the protocol in your browser. Nothing here touches the chain and real dashboards never fall back to lab data.</p>
      <Lab />
    </div>
  );
}
