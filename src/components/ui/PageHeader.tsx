import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Panel } from "./Panel";

export function PageHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <Panel className="relative overflow-hidden p-0">
      <div className="relative flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="wt-icon-chip flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="mb-1.5 inline-flex items-center rounded-md border border-blue-500/15 bg-[var(--wt-accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--wt-accent-text)]">
              {eyebrow}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--wt-text-strong)] [text-wrap:balance]">{title}</h1>
            {description ? (
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--wt-text-muted)] [text-wrap:pretty]">{description}</p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {meta}
          {actions}
        </div>
      </div>
    </Panel>
  );
}
