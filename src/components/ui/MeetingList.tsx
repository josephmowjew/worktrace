import { CalendarDays, ClipboardEdit, Users } from "lucide-react";
import type { ManualLog } from "../../types/manualLog";
import { Badge } from "./Badge";
import { Panel } from "./Panel";

const activityTypeIcons: Record<string, typeof ClipboardEdit> = {
  Meeting: Users,
  Development: ClipboardEdit,
  BugFix: ClipboardEdit,
  Testing: ClipboardEdit,
  Deployment: ClipboardEdit,
  Research: ClipboardEdit,
  Documentation: ClipboardEdit,
  Planning: CalendarDays,
  Support: ClipboardEdit,
  CodeReview: ClipboardEdit,
  ClientFeedback: ClipboardEdit,
};

export function MeetingList({
  meetings,
  isLoading,
}: {
  meetings: ManualLog[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Panel>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-white/[0.03]" />
          ))}
        </div>
      </Panel>
    );
  }

  if (meetings.length === 0) {
    return (
      <Panel>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-300/20 bg-blue-500/10 text-blue-200">
            <Users className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold text-slate-200">No meetings logged</p>
          <p className="mt-1 text-xs text-slate-500">Log meetings to track your collaboration time.</p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="p-0">
      <div className="divide-y divide-white/8">
        {meetings.map((meeting) => {
          const Icon = activityTypeIcons[meeting.activityType] || ClipboardEdit;

          return (
            <div key={meeting.id} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/5">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-purple-300/20 bg-purple-500/10 text-purple-200">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-slate-100">{meeting.summary}</p>
                  <Badge tone="purple">{meeting.activityType}</Badge>
                </div>
                {meeting.outcome && (
                  <p className="mt-1 text-xs text-slate-500">{meeting.outcome}</p>
                )}
                <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-500">
                  <span>{formatDate(meeting.date)}</span>
                  {meeting.durationMinutes !== null && meeting.durationMinutes !== undefined && (
                    <span>{meeting.durationMinutes} min</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
