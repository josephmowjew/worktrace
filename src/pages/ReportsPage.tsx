import { Copy, FileText } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";

export function ReportsPage() {
  return (
    <div className="grid grid-cols-[360px_1fr_330px] gap-4">
      <Panel>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-slate-400">Configure weekly Markdown reports.</p>
        <div className="mt-6 space-y-4">
          {["Report Type", "Date Range", "Recipient / Manager", "Included Projects"].map((label) => (
            <label key={label} className="grid gap-2 text-sm font-medium text-slate-300">
              {label}
              <div className="h-11 rounded-xl border border-white/10 bg-white/[0.04]" />
            </label>
          ))}
          <Button variant="primary" className="w-full">
            <FileText className="h-4 w-4" />
            Generate Report
          </Button>
        </div>
      </Panel>

      <Panel className="min-h-[700px]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Live Preview</h2>
          <Button>
            <Copy className="h-4 w-4" />
            Copy
          </Button>
        </div>
        <div className="min-h-[580px] rounded-2xl border border-white/10 bg-slate-950/50 p-5 font-mono text-sm leading-7 text-slate-300">
          Weekly report preview will render here after report generation is connected.
        </div>
      </Panel>

      <Panel>
        <h2 className="text-lg font-semibold">Saved Reports</h2>
        <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-6 text-sm text-slate-400">
          Saved report history will appear here.
        </div>
      </Panel>
    </div>
  );
}
