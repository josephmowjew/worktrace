import { X } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { Button } from "./Button";

type CloseButtonVariant = "modal" | "panel" | "subtle" | "transient";

const variantClasses: Record<CloseButtonVariant, string> = {
  modal:
    "shrink-0 border-[var(--wt-border)] bg-[var(--wt-surface-muted)] text-[var(--wt-text-strong)] hover:border-blue-500/25 hover:bg-[var(--wt-surface-hover)] hover:text-[var(--wt-accent-text)]",
  panel:
    "shrink-0 border-[var(--wt-border)] bg-[var(--wt-input)] text-[var(--wt-text-strong)] shadow-[var(--wt-control-shadow)] hover:border-blue-500/25 hover:bg-[var(--wt-surface-hover)] hover:text-[var(--wt-accent-text)]",
  subtle:
    "min-h-8 h-8 w-8 shrink-0 rounded-lg border-transparent bg-transparent text-[var(--wt-text-muted)] hover:border-[var(--wt-border)] hover:bg-[var(--wt-surface-hover)] hover:text-[var(--wt-text-strong)]",
  transient:
    "min-h-8 h-8 w-8 shrink-0 rounded-lg border-transparent bg-transparent text-[var(--wt-text-muted)] opacity-75 hover:border-transparent hover:bg-white/10 hover:text-[var(--wt-text-strong)] hover:opacity-100 disabled:opacity-40",
};

const variantIconClasses: Record<CloseButtonVariant, string> = {
  modal: "h-4 w-4 shrink-0",
  panel: "h-4 w-4 shrink-0",
  subtle: "h-4 w-4 shrink-0",
  transient: "h-3.5 w-3.5 shrink-0",
};

type CloseButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  label: string;
  variant?: CloseButtonVariant;
  iconClassName?: string;
};

export function CloseButton({
  label,
  variant = "modal",
  iconClassName = "",
  className = "",
  type = "button",
  ...props
}: CloseButtonProps) {
  return (
    <Button
      type={type}
      variant="ghost"
      size="icon"
      aria-label={label}
      title={props.title ?? label}
      className={`${variantClasses[variant]} ${className}`}
      {...props}
    >
      <X className={`${variantIconClasses[variant]} ${iconClassName}`} strokeWidth={2.25} />
    </Button>
  );
}
