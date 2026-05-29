import { Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { appSignature } from "../../lib/appSignature";

export function TitleBar() {
  const [isMacOS, setIsMacOS] = useState(false);

  useEffect(() => {
    setIsMacOS(navigator.userAgent.toLowerCase().includes("mac"));
  }, []);

  const handleMinimize = () => {
    getCurrentWindow().minimize();
  };

  const handleMaximize = () => {
    getCurrentWindow().toggleMaximize();
  };

  const handleClose = () => {
    getCurrentWindow().close();
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
      className="relative z-50 flex h-9 items-center justify-between border-b border-[var(--wt-border)] bg-[var(--wt-surface-strong)]"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-2 pl-4" data-tauri-drag-region>
        <img src="/worktrace-icon.svg" alt="" className="h-5 w-5 rounded-md" draggable={false} />
        <span className="text-xs font-medium text-[var(--wt-text-strong)]" data-tauri-drag-region>
          WorkTrace
        </span>
        <span className="hidden text-[10px] text-[var(--wt-text-faint)] sm:inline" data-tauri-drag-region>
          {appSignature.developerCredit}
        </span>
      </div>

      <div className="flex h-full items-center">
        {controls.map((control) => (
          <button
            key={control.label}
            onClick={control.action}
            className={`flex h-9 w-12 items-center justify-center text-[var(--wt-text-muted)] transition-colors ${control.color}`}
            title={control.label}
          >
            <control.icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>
  );
}
