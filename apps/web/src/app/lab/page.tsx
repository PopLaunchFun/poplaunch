import { Lab } from "@/components/lab";

export default function LabPage() {
  return (
    <div className="max-w-6xl">
      <div className="flex items-baseline gap-3"><h1 className="text-2xl font-bold">Lab</h1><span className="tag tag-violet">simulator · no wallet · no real trades</span></div>
      <p className="text-sm text-paper-2 mt-2">Runs the exact integer engine of the protocol in your browser. Nothing here touches the chain and real dashboards never fall back to lab data.</p>
      <Lab />
    </div>
  );
}
