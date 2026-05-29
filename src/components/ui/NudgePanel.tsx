import { Bell, CheckCircle2 } from "lucide-react";
import { Button } from "./Button";
import { CloseButton } from "./CloseButton";
import { Panel } from "./Panel";

export type TodayNudge = {
  key: string;
  title: string;
  detail: string;
  actionLabel: string;
  onAction: () => void;
};

type NudgePanelProps = {
  nudges: TodayNudge[];
  onDismiss: (key: string) => void;
  isDismissing?: boolean;
};

export function NudgePanel({
  nudges,
  onDismiss,
  isDismissing = false,
}: NudgePanelProps) {
  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-cyan-200" />
          <h2 className="text-sm font-semibold text-white">Quiet Nudges</h2>
        </div>
        <span className="text-xs text-slate-500">{nudges.length} active</span>
      </div>

      <div className="space-y-2">
        {nudges.length > 0 ? (
          nudges.map((nudge) => (
            <div key={nudge.key} className="rounded-xl border border-cyan-300/15 bg-cyan-300/5 p-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-100">{nudge.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{nudge.detail}</p>
                  <Button variant="ghost" onClick={nudge.onAction} className="mt-2 h-8 px-2 text-xs">
                    {nudge.actionLabel}
                  </Button>
                </div>
                <CloseButton
                  label={`Dismiss ${nudge.title}`}
                  variant="transient"
                  disabled={isDismissing}
                  onClick={() => onDismiss(nudge.key)}
                />
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs leading-5 text-slate-400">
            Nothing needs your attention right now.
          </div>
        )}
      </div>
    </Panel>
  );
}
