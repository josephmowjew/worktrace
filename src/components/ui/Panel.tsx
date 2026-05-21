import { forwardRef } from "react";
import type { PropsWithChildren } from "react";

export const Panel = forwardRef<HTMLDivElement, PropsWithChildren<{ className?: string }>>(
  ({ children, className = "" }, ref) => {
    return (
      <div
        ref={ref}
        className={`rounded-2xl border border-white/10 bg-slate-950/55 p-4 shadow-2xl shadow-slate-950/25 backdrop-blur-2xl ${className}`}
      >
        {children}
      </div>
    );
  },
);

Panel.displayName = "Panel";
