import { forwardRef } from "react";
import type { PropsWithChildren } from "react";

export const Panel = forwardRef<HTMLDivElement, PropsWithChildren<{ className?: string }>>(
  ({ children, className = "" }, ref) => {
    return (
      <div
        ref={ref}
        className={`wt-panel rounded-2xl p-4 ${className}`}
      >
        {children}
      </div>
    );
  },
);

Panel.displayName = "Panel";
