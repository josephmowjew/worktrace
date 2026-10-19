import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

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
    <header className="wt-page-header">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center text-[var(--wt-text-muted)]">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="mb-1 text-[11px] font-medium text-[var(--wt-text-muted)]">
              {eyebrow}
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--wt-text-strong)] [text-wrap:balance]">{title}</h1>
            {description ? (
              <p className="mt-1.5 max-w-2xl text-xs leading-5 text-[var(--wt-text-muted)] [text-wrap:pretty]">{description}</p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {meta}
          {actions}
        </div>
      </div>
    </header>
  );
}
