import type { PropsWithChildren } from "react";

type BadgeTone = "blue" | "cyan" | "green" | "orange" | "purple" | "slate";

const toneClasses: Record<BadgeTone, string> = {
  blue: "border-blue-500/15 bg-blue-500/10 text-blue-600 dark:text-blue-200",
  cyan: "border-cyan-500/15 bg-cyan-500/10 text-cyan-600 dark:text-cyan-200",
  green: "border-emerald-500/15 bg-emerald-500/10 text-emerald-600 dark:text-emerald-200",
  orange: "border-orange-500/15 bg-orange-500/10 text-orange-600 dark:text-orange-200",
  purple: "border-violet-500/15 bg-violet-500/10 text-violet-600 dark:text-violet-200",
  slate: "border-[var(--wt-border)] bg-[var(--wt-surface-muted)] text-[var(--wt-text-muted)]",
};

export function Badge({
  children,
  tone = "slate",
}: PropsWithChildren<{ tone?: BadgeTone }>) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
