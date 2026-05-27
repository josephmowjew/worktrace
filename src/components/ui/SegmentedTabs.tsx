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
      className={`rounded-2xl border border-white/10 bg-gradient-to-r from-[#071127] via-[#0a1730] to-[#071127] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_50px_rgba(2,6,23,0.42)] ${className}`}
    >
      <div className="flex flex-wrap gap-2">
        {items.map((tab) => {
          const isActive = value === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={[
                "relative min-w-[112px] rounded-xl px-4 py-2.5 text-sm font-medium transition-[color,background-color,box-shadow,border-color] duration-150",
                fullWidth ? "flex-1" : "",
                "flex items-center justify-center gap-2 border",
                isActive
                  ? "border-blue-300/35 bg-blue-500/16 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_10px_24px_rgba(37,99,235,0.20)]"
                  : "border-transparent text-slate-300 hover:border-white/12 hover:bg-white/6 hover:text-slate-100",
              ].join(" ")}
              aria-pressed={isActive}
            >
              {Icon ? <Icon className="h-4 w-4" /> : null}
              <span>{tab.label}</span>
              {isActive ? (
                <span className="absolute inset-x-4 -bottom-2 h-0.5 rounded-full bg-cyan-300" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
