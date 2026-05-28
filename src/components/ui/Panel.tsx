import { forwardRef } from "react";
import type { PropsWithChildren } from "react";

export const Panel = forwardRef<HTMLDivElement, PropsWithChildren<{ className?: string }>>(
  ({ children, className = "" }, ref) => {
    return (
      <div
        ref={ref}
        className={`rounded-2xl border border-white/10 bg-slate-950/58 p-4 shadow-[0_18px_48px_rgba(2,6,23,0.24),inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-xl ${className}`}
      >
        {children}
      </div>
    );
  },
);

Panel.displayName = "Panel";
