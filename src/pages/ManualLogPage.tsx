import { Save } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";

export function ManualLogPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Manual Log</h1>
        <p className="mt-1 text-sm text-slate-400">Capture meetings, planning, testing, support, and other non-code work.</p>
      </div>

      <div className="grid grid-cols-[1fr_420px] gap-4">
        <Panel>
          <h2 className="text-lg font-semibold">Log Non-Code Work</h2>
          <div className="mt-5 grid gap-4">
            {["Date", "Project", "Activity Type", "Summary", "Outcome", "Follow-up / Next Steps"].map((label) => (
              <label key={label} className="grid gap-2 text-sm font-medium text-slate-300">
                {label}
                <div className="h-11 rounded-xl border border-white/10 bg-white/[0.04]" />
              </label>
            ))}
            <Button variant="primary" className="mt-2 w-48">
              <Save className="h-4 w-4" />
              Save Log
            </Button>
          </div>
        </Panel>

        <Panel>
          <h2 className="text-lg font-semibold">Recent Logs</h2>
          <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-6 text-sm text-slate-400">
            Logs will appear here once the manual log backend is connected.
          </div>
        </Panel>
      </div>
    </div>
  );
}
