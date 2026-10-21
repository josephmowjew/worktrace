import { MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";

export function ActionMenu({ label = "More actions", children }: { label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEscapeKey(() => { setOpen(false); trigger.current?.focus(); }, open);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <div ref={root} className="relative shrink-0">
    <button ref={trigger} type="button" className="wt-shell-icon" aria-label={label} title={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><MoreHorizontal size={18} /></button>
    {open ? <div id={id} role="group" aria-label={label} className="wt-action-menu" onClick={(event) => {
      const action = (event.target as Element).closest("button,a");
      if (action && !action.hasAttribute("disabled")) setOpen(false);
    }}>{children}</div> : null}
  </div>;
}
