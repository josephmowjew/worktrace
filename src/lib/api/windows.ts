import { callCommand } from "./client";
import type { DesktopLifecycleStatus, QuickCaptureStatus } from "../../types/windows";

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

export function getDesktopLifecycleStatus() {
  return callCommand<DesktopLifecycleStatus>("get_desktop_lifecycle_status");
}

export function configureDesktopLifecycle(input: {
  startupEnabled: boolean;
  startMinimizedToTray: boolean;
  minimizeToTrayOnClose: boolean;
}) {
  return callCommand<DesktopLifecycleStatus>("configure_desktop_lifecycle", input);
}

export function showMainWindow() {
  return callCommand<boolean>("show_main_window");
}

export function hideMainWindowToTray() {
  return callCommand<boolean>("hide_main_window_to_tray");
}

export function quitApp() {
  return callCommand<void>("quit_app");
}

export function requestTraySync() {
  return callCommand<boolean>("request_tray_sync");
}
