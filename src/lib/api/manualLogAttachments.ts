import { callCommand } from "./client";
import type { ManualLogAttachment, ManualLogAttachmentPreview } from "../../types/manualLogAttachment";

export function listManualLogAttachments(manualLogId: string) {
  return callCommand<ManualLogAttachment[]>("list_manual_log_attachments", { manualLogId });
}

export function addManualLogAttachment(manualLogId: string, sourcePath: string) {
  return callCommand<ManualLogAttachment>("add_manual_log_attachment", { manualLogId, sourcePath });
}

export function deleteManualLogAttachment(id: string) {
  return callCommand<boolean>("delete_manual_log_attachment", { id });
}

export function openManualLogAttachment(id: string) {
  return callCommand<boolean>("open_manual_log_attachment", { id });
}

export function getManualLogAttachmentPreview(id: string) {
  return callCommand<ManualLogAttachmentPreview | null>("get_manual_log_attachment_preview", { id });
}
