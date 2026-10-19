import type { ComponentType } from "react";

export type SegmentedTabItem<T extends string> = {
  id: T;
  label: string;
  icon?: ComponentType<{ className?: string }>;
};

export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  className = "",
  fullWidth = false,
}: {
  items: SegmentedTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={`wt-segmented-tabs border-b border-[var(--wt-border)] ${className}`}
    >
      <div className="flex flex-wrap gap-1">
        {items.map((tab) => {
          const isActive = value === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={[
                "relative min-h-9 rounded-t-md px-3 py-2 text-xs font-medium outline-none transition-[color,background-color,box-shadow,border-color] duration-150 focus-visible:ring-2 focus-visible:ring-blue-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--wt-bg)]",
                fullWidth ? "flex-1" : "",
                "flex items-center justify-center gap-2 border",
                isActive
                  ? "border-transparent bg-[var(--wt-selected)] text-[var(--wt-text-strong)]"
                  : "border-transparent text-[var(--wt-text-muted)] hover:border-[var(--wt-border)] hover:bg-[var(--wt-surface-muted)] hover:text-[var(--wt-text-strong)]",
              ].join(" ")}
              aria-pressed={isActive}
            >
              {Icon ? <Icon className="h-4 w-4" /> : null}
              <span>{tab.label}</span>
              {isActive ? (
                <span className="absolute inset-x-3 bottom-0 h-px bg-[var(--wt-text-strong)]" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
