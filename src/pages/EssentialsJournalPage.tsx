import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { ManualLogDetailModal } from "../components/ui/ManualLogDetailModal";
import { useExperience } from "../features/experience/useExperience";
import { localWorkError } from "../features/experience/errors";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { createManualLog, listManualLogs, updateManualLog } from "../lib/api/manualLogs";
import { invalidateWorkEvidence } from "../lib/api/queryKeys";
import { todayRange } from "../lib/dates";
import type { ManualLog } from "../types/manualLog";

// Read draft metadata when available without requiring the separate draft editor.
type JournalNote = ManualLog & { isDraft?: boolean };

export function EssentialsJournalPage() {
  const experience = useExperience();
  const queryClient = useQueryClient();
  const input = useRef<HTMLTextAreaElement>(null);
  const [summary, setSummary] = useState("");
  const [date, setDate] = useState(() => todayRange().date);
  const [editing, setEditing] = useState<JournalNote | null>(null);
  const [viewing, setViewing] = useState<ManualLog | null>(null);
  const query = useQuery({ queryKey: ["manualLogs", "all"], queryFn: async (): Promise<JournalNote[]> => listManualLogs({ from: "0001-01-01", to: "9999-12-31" }) });
  const save = useMutation({
    mutationFn: () => editing ? updateManualLog(editing.id, { summary: summary.trim(), date }) : createManualLog({ summary: summary.trim(), date, activityType: "AdminTask", includedInReport: experience.hasFeature("reports") }),
    onSuccess: async () => { reset(); await invalidateWorkEvidence(queryClient); },
  });
  function reset() { setEditing(null); setSummary(""); setDate(todayRange().date); }
  useEscapeKey(reset, Boolean(editing) && !viewing && !save.isPending);
  function edit(log: JournalNote) { setEditing(log); setSummary(log.summary); setDate(log.date); input.current?.focus(); }
  return <div className="mx-auto max-w-3xl space-y-6"><header className="wt-page-header flex flex-wrap items-start justify-between gap-4"><div><h1>Work journal</h1><p className="mt-2 text-sm text-[var(--wt-text-muted)]">A place for the work that isn't a task.</p></div><Link className="wt-text-link" to="/manual-log/advanced">Detailed editor</Link></header>
    <form className="wt-task-composer space-y-3" onSubmit={(event) => { event.preventDefault(); if (summary.trim() && !save.isPending) save.mutate(); }}><label className="wt-field-label">{editing ? "Edit note" : "What happened?"}<textarea ref={input} className="wt-input resize-y rounded-md p-3 text-sm" rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="A meeting, progress you made, something to remember..." disabled={save.isPending} /></label><div className="flex flex-wrap items-end gap-3"><label className="wt-field-label">Date<input type="date" value={date} required className="wt-input rounded-md px-3 py-1.5 text-xs" onChange={(event) => setDate(event.target.value)} /></label><Button type="submit" size="sm" variant="primary" disabled={!summary.trim() || !date || save.isPending}>{save.isPending ? "Saving..." : editing ? "Save changes" : "Save note"}</Button>{editing ? <Button type="button" size="sm" variant="ghost" onClick={reset} disabled={save.isPending}>Cancel</Button> : null}</div>{editing?.isDraft ? <p className="text-xs text-[var(--wt-text-muted)]">This remains a draft. Use the detailed editor when you are ready to publish it.</p> : null}{save.error ? <p role="alert" className="text-xs text-[var(--wt-danger)]">{localWorkError(save.error)}</p> : null}</form>
    {query.isLoading ? <div role="status" className="animate-pulse py-8 text-xs text-[var(--wt-text-muted)]">Loading your journal...</div> : query.isError ? <div role="alert" className="text-sm text-[var(--wt-text-muted)]"><p>{localWorkError(query.error, "Your journal could not be loaded.")}</p><Button size="sm" className="mt-3" onClick={() => void query.refetch()}>Try again</Button></div> : query.data?.length ? <div className="divide-y divide-[var(--wt-border)]">{query.data.map((log) => <article key={log.id} className="py-5"><div className="flex items-center gap-2 text-[11px] text-[var(--wt-text-muted)]"><time>{log.date}</time>{log.isDraft ? <span className="wt-small-label">Draft</span> : null}</div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{log.summary}</p><div className="mt-3 flex gap-4"><button type="button" className="wt-text-link" onClick={() => edit(log)}>Edit</button><button type="button" className="wt-text-link" onClick={() => setViewing(log)}>Details & attachments</button></div></article>)}</div> : <p className="py-6 text-center text-sm text-[var(--wt-text-muted)]">Your notes will appear here. Start with a sentence.</p>}
    <ManualLogDetailModal log={viewing} isOpen={Boolean(viewing)} onClose={() => setViewing(null)} />
  </div>;
}
