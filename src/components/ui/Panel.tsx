import type { PropsWithChildren } from "react";

export function Panel({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-slate-950/55 p-5 shadow-xl shadow-slate-950/20 backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}
