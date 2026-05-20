import type { PropsWithChildren } from "react";

export function Panel({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-slate-950/55 p-4 shadow-2xl shadow-slate-950/25 backdrop-blur-2xl ${className}`}
    >
      {children}
    </div>
  );
}
