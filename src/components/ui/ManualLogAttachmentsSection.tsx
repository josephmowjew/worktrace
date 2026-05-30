import { open } from "@tauri-apps/plugin-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, FileImage, FileText, Paperclip, Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import {
  addManualLogAttachment,
  deleteManualLogAttachment,
  getManualLogAttachmentPreview,
  listManualLogAttachments,
  openManualLogAttachment,
} from "../../lib/api/manualLogAttachments";
import type { ManualLogAttachment } from "../../types/manualLogAttachment";
import { Button } from "./Button";

export function ManualLogAttachmentsSection({
  manualLogId,
  queryKey,
  onChanged,
  onError,
  onSuccess,
}: {
  manualLogId: string;
  queryKey: readonly unknown[];
  onChanged: () => void;
  onError: (title: string, message?: string) => void;
  onSuccess: (title: string, message?: string) => void;
}) {
  const attachmentsQuery = useQuery({
    queryKey,
    queryFn: () => listManualLogAttachments(manualLogId),
  });

  const addMutation = useMutation({
    mutationFn: (path: string) => addManualLogAttachment(manualLogId, path),
    onSuccess: (attachment) => {
      onChanged();
      onSuccess("Attachment added", attachment.originalName);
    },
    onError: (error) => onError("Attachment failed", toMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteManualLogAttachment,
    onSuccess: () => {
      onChanged();
      onSuccess("Attachment deleted");
    },
    onError: (error) => onError("Delete failed", toMessage(error)),
  });

  const openMutation = useMutation({
    mutationFn: openManualLogAttachment,
    onError: (error) => onError("Open failed", toMessage(error)),
  });

  async function pickAttachment() {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Images and PDFs",
          extensions: ["png", "jpg", "jpeg", "webp", "gif", "pdf"],
        },
      ],
    });
    if (typeof selected === "string") {
      addMutation.mutate(selected);
    }
  }

  const attachments = attachmentsQuery.data ?? [];

  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/45 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Paperclip className="h-4 w-4 text-cyan-200" />
            Attachments
            {attachments.length > 0 ? (
              <span className="rounded-md bg-white/6 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-400">
                {attachments.length}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">Images and PDFs are copied into local WorkTrace storage.</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void pickAttachment()}
          disabled={addMutation.isPending || attachments.length >= 20}
          className="shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>

      {attachmentsQuery.isLoading ? (
        <div className="space-y-2">
          <div className="h-14 animate-pulse rounded-xl bg-white/[0.04]" />
          <div className="h-14 animate-pulse rounded-xl bg-white/[0.03]" />
        </div>
      ) : attachmentsQuery.isError ? (
        <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {toMessage(attachmentsQuery.error)}
        </p>
      ) : attachments.length === 0 ? (
        <p className="rounded-xl bg-white/[0.03] px-3 py-3 text-sm text-slate-500">
          No manual log evidence attached yet.
        </p>
      ) : (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <ManualLogAttachmentRow
              key={attachment.id}
              attachment={attachment}
              onOpen={() => openMutation.mutate(attachment.id)}
              onDelete={() => deleteMutation.mutate(attachment.id)}
              isDeleting={deleteMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PendingManualLogAttachmentsSection({
  paths,
  onChange,
  onError,
}: {
  paths: string[];
  onChange: (paths: string[]) => void;
  onError: (message: string) => void;
}) {
  const rows = useMemo(
    () =>
      paths.map((path) => ({
        path,
        name: path.split(/[\\/]/).pop() || "Attachment",
      })),
    [paths],
  );

  async function pickAttachment() {
    const selected = await open({
      multiple: true,
      directory: false,
      filters: [
        {
          name: "Images and PDFs",
          extensions: ["png", "jpg", "jpeg", "webp", "gif", "pdf"],
        },
      ],
    });
    const selectedPaths = Array.isArray(selected) ? selected : typeof selected === "string" ? [selected] : [];
    if (!selectedPaths.length) return;
    const next = [...paths];
    for (const path of selectedPaths) {
      if (next.includes(path)) continue;
      if (next.length >= 20) {
        onError("A manual log can have up to 20 attachments.");
        break;
      }
      next.push(path);
    }
    onChange(next);
  }

  return (
    <div className="rounded-2xl border border-[var(--wt-border)] bg-[var(--wt-surface-muted)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--wt-text)]">
            <Paperclip className="h-4 w-4 text-cyan-300" />
            Attachments
            {rows.length > 0 ? (
              <span className="rounded-md bg-white/6 px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--wt-text-muted)]">
                {rows.length}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-[var(--wt-text-muted)]">Files are copied into WorkTrace after the log is saved.</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => void pickAttachment()} disabled={rows.length >= 20}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl bg-white/[0.03] px-3 py-3 text-sm text-[var(--wt-text-muted)]">
          Add screenshots or PDFs before saving this log.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.path} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
              <Paperclip className="h-4 w-4 shrink-0 text-cyan-200" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--wt-text)]">{row.name}</p>
                <p className="truncate text-xs text-[var(--wt-text-muted)]">{row.path}</p>
              </div>
              <button
                type="button"
                onClick={() => onChange(paths.filter((path) => path !== row.path))}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--wt-text-muted)] transition-[background-color,color,transform] hover:bg-red-500/10 hover:text-red-400 active:scale-[0.96]"
                aria-label={`Remove ${row.name}`}
                title="Remove attachment"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ManualLogAttachmentRow({
  attachment,
  onOpen,
  onDelete,
  isDeleting,
}: {
  attachment: ManualLogAttachment;
  onOpen: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const isImage = attachment.mimeType.startsWith("image/");
  const previewQuery = useQuery({
    queryKey: ["manualLogAttachmentPreview", attachment.id],
    queryFn: () => getManualLogAttachmentPreview(attachment.id),
    enabled: isImage,
  });

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-2.5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-900/80 outline outline-1 outline-white/10">
        {previewQuery.data?.dataUrl ? (
          <img src={previewQuery.data.dataUrl} alt="" className="h-full w-full object-cover" />
        ) : isImage ? (
          <FileImage className="h-5 w-5 text-cyan-200" />
        ) : (
          <FileText className="h-5 w-5 text-blue-200" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-200">{attachment.originalName}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {attachment.extension.toUpperCase()} / {formatBytes(attachment.sizeBytes)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onOpen}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-[background-color,color,transform] hover:bg-white/8 hover:text-slate-100 active:scale-[0.96]"
          aria-label={`Open ${attachment.originalName}`}
          title="Open attachment"
        >
          <Download className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-[background-color,color,transform] hover:bg-rose-500/10 hover:text-rose-200 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={`Delete ${attachment.originalName}`}
          title="Delete attachment"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
