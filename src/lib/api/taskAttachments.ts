import { callCommand } from "./client";
import type { TaskAttachment, TaskAttachmentPreview } from "../../types/taskAttachment";

export function listTaskAttachments(taskId: string) {
  return callCommand<TaskAttachment[]>("list_task_attachments", { taskId });
}

export function addTaskAttachment(taskId: string, sourcePath: string) {
  return callCommand<TaskAttachment>("add_task_attachment", { taskId, sourcePath });
}

export function deleteTaskAttachment(id: string) {
  return callCommand<boolean>("delete_task_attachment", { id });
}

export function openTaskAttachment(id: string) {
  return callCommand<boolean>("open_task_attachment", { id });
}

export function getTaskAttachmentPreview(id: string) {
  return callCommand<TaskAttachmentPreview | null>("get_task_attachment_preview", { id });
}
