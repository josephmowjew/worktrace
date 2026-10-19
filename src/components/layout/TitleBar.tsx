import { Minus, PanelLeft, Search, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function TitleBar({ onCommand, onToggleNavigation, navigationOpen }: { onCommand: () => void; onToggleNavigation: () => void; navigationOpen: boolean }) {
  const [isMacOS, setIsMacOS] = useState(false);

  useEffect(() => {
    setIsMacOS(navigator.userAgent.toLowerCase().includes("mac"));
  }, []);

  const handleMinimize = () => {
    if ("__TAURI_INTERNALS__" in window) void getCurrentWindow().minimize();
  };

  const handleMaximize = () => {
    if ("__TAURI_INTERNALS__" in window) void getCurrentWindow().toggleMaximize();
  };

  const handleClose = () => {
    if ("__TAURI_INTERNALS__" in window) void getCurrentWindow().close();
  };

  const controls = isMacOS
    ? [
        { action: handleClose, icon: X, label: "Close", color: "hover:bg-red-500" },
        { action: handleMinimize, icon: Minus, label: "Minimize", color: "hover:bg-yellow-500" },
        { action: handleMaximize, icon: Square, label: "Maximize", color: "hover:bg-green-500" },
      ]
    : [
        { action: handleMinimize, icon: Minus, label: "Minimize", color: "hover:bg-[var(--wt-surface-hover)]" },
        { action: handleMaximize, icon: Square, label: "Maximize", color: "hover:bg-[var(--wt-surface-hover)]" },
        { action: handleClose, icon: X, label: "Close", color: "hover:bg-red-500" },
      ];

  return (
    <div
      className="wt-titlebar"
      data-tauri-drag-region
    >
      <div className="flex min-w-0 items-center gap-2 pl-2" data-tauri-drag-region>
        <button type="button" className="wt-shell-icon" onClick={onToggleNavigation} aria-label="Toggle sidebar" aria-controls="workspace-navigation" aria-expanded={navigationOpen} title="Toggle sidebar (Ctrl+B)"><PanelLeft size={16} strokeWidth={1.6} /></button>
        <span className="hidden text-xs font-medium text-[var(--wt-text-muted)] sm:inline" data-tauri-drag-region>WorkTrace</span>
      </div>
      <button type="button" className="wt-command-trigger" onClick={onCommand} aria-label="Search commands and navigate" aria-keyshortcuts="Control+k Meta+k">
        <Search size={13} /><span>Search or jump to…</span><kbd>Ctrl K</kbd>
      </button>
      <div className="flex h-full items-center">
        {controls.map((control) => (
          <button
            key={control.label}
            onClick={control.action}
            className={`flex h-10 w-10 items-center justify-center text-[var(--wt-text-muted)] transition-colors ${control.color}`}
            aria-label={control.label}
            title={control.label}
          >
            <control.icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>
  );
}
