import { callCommand } from "./client";
import type { QuickCaptureStatus } from "../../types/windows";

export function showQuickCapture() {
  return callCommand<boolean>("show_quick_capture");
}

export function hideQuickCapture() {
  return callCommand<boolean>("hide_quick_capture");
}

export function toggleQuickCapture() {
  return callCommand<boolean>("toggle_quick_capture");
}

export function getQuickCaptureStatus() {
  return callCommand<QuickCaptureStatus>("get_quick_capture_status");
}

export function configureQuickCaptureShortcut(input: { enabled: boolean; shortcut: string }) {
  return callCommand<QuickCaptureStatus>("configure_quick_capture_shortcut", input);
}
