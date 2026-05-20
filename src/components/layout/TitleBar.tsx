import { Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

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
        { action: handleMinimize, icon: Minus, label: "Minimize", color: "hover:bg-white/10" },
        { action: handleMaximize, icon: Square, label: "Maximize", color: "hover:bg-white/10" },
        { action: handleClose, icon: X, label: "Close", color: "hover:bg-red-500" },
      ];

  return (
    <div
      className="relative z-50 flex h-9 items-center justify-between border-b border-white/10 bg-[#07111f]/95 backdrop-blur-xl"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-2 pl-4" data-tauri-drag-region>
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-500/15 text-xs font-black text-blue-300">
          W
        </div>
        <span className="text-xs font-medium text-slate-300" data-tauri-drag-region>
          WorkTrace
        </span>
      </div>

      <div className="flex h-full items-center">
        {controls.map((control) => (
          <button
            key={control.label}
            onClick={control.action}
            className={`flex h-9 w-12 items-center justify-center text-slate-400 transition-colors ${control.color}`}
            title={control.label}
          >
            <control.icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>
  );
}
