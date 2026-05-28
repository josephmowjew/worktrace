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
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/35 to-transparent" />
      <div className="relative flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-300/18 bg-blue-500/10 text-blue-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="mb-1.5 inline-flex items-center rounded-md border border-cyan-300/12 bg-cyan-300/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100/85">
              {eyebrow}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white [text-wrap:balance]">{title}</h1>
            {description ? (
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400 [text-wrap:pretty]">{description}</p>
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
