import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";
import { Panel } from "./Panel";

const sizeClasses = {
  sm: "max-w-lg",
  md: "max-w-2xl",
  lg: "max-w-5xl",
  xl: "max-w-6xl",
};

export function ModalShell({
  title,
  description,
  onClose,
  children,
  size = "sm",
  className = "",
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  size?: keyof typeof sizeClasses;
  className?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 p-4 backdrop-blur-sm">
      <Panel className={`relative flex max-h-[92vh] w-full ${sizeClasses[size]} flex-col overflow-hidden p-0 ${className}`}>
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/8 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white [text-wrap:balance]">{title}</h2>
            {description ? <p className="mt-0.5 text-xs leading-5 text-slate-400 [text-wrap:pretty]">{description}</p> : null}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={`Close ${title}`}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </Panel>
    </div>
  );
}
