import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { CloseButton } from "./CloseButton";

export function SidePanel({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEscapeKey(() => close.current());
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const appRoot = document.getElementById("root");
    const previousInert = appRoot?.inert ?? false;
    if (appRoot) appRoot.inert = true;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { if (appRoot) appRoot.inert = previousInert; previous?.focus(); };
  }, []);
  return createPortal(<div className="wt-side-panel-overlay">
    <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-[var(--wt-overlay)]" onClick={() => close.current()} />
    <aside ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="wt-side-panel" onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const controls = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') ?? [])].filter((item) => !item.closest('[hidden],.hidden'));
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <header className="flex items-center justify-between gap-3 border-b border-[var(--wt-border)] px-5 py-4"><h2 id={titleId} className="text-sm font-semibold">{title}</h2><CloseButton label={`Close ${title}`} onClick={() => close.current()} /></header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
    </aside>
  </div>, document.body);
}
