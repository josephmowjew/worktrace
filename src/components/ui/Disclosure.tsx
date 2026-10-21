import { ChevronDown } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";

/** Keeps form state mounted while taking secondary work out of the main flow. */
export function Disclosure({ title, children, defaultOpen = false, open, onOpenChange, summary, actions }: {
  title: string; children: ReactNode; defaultOpen?: boolean;
  open?: boolean; onOpenChange?: (open: boolean) => void; summary?: string; actions?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const isOpen = open ?? expanded;
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  function change(value: boolean) { setExpanded(value); onOpenChange?.(value); }
  useEscapeKey(() => {
    if (root.current?.contains(document.activeElement)) { change(false); trigger.current?.focus(); }
  }, isOpen);
  return <div ref={root} className="wt-disclosure">
    <div className="flex flex-wrap items-center gap-4">
    <button ref={trigger} id={`${id}-trigger`} type="button" className="wt-disclosure-trigger" aria-expanded={isOpen} aria-controls={id} onClick={() => change(!isOpen)}>
      <ChevronDown size={14} className={isOpen ? "rotate-180" : ""} />
      <span>{title}</span>{summary ? <span className="ml-auto text-[var(--wt-text-muted)] font-normal">{summary}</span> : null}
    </button>
    {actions}
    </div>
    <div id={id} role="region" aria-labelledby={`${id}-trigger`} hidden={!isOpen} className={isOpen ? "pt-4" : "hidden"}>{children}</div>
  </div>;
}
