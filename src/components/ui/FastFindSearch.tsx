import {
  Calendar,
  CheckCircle2,
  FolderKanban,
  LayoutGrid,
  ListTodo,
  Search,
  SlidersHorizontal,
  User,
  X,
  Zap,
} from "lucide-react";
import type { ReactNode, RefObject } from "react";

export type FastFindChip = {
  label: string;
  icon?: React.ElementType;
  active?: boolean;
  onClick?: () => void;
};

export type FastFindPreviewItem = {
  id: string;
  title: string;
  eyebrow?: string;
  detail?: string;
  badge?: string;
  icon?: React.ElementType;
  onSelect: () => void;
};

export function FastFindSearch({
  inputRef,
  value,
  onChange,
  visibleCount,
  totalCount,
  isSearching,
  placeholder,
  chips,
  previewItems,
  previewTitle = "Top results",
  emptyMessage,
  moreLabel,
  scopeLabel = "Local",
  shortcutLabel = "Ctrl + K",
  className = "",
  sideControls,
}: {
  inputRef?: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  visibleCount: number;
  totalCount: number;
  isSearching: boolean;
  placeholder: string;
  chips?: FastFindChip[];
  previewItems?: FastFindPreviewItem[];
  previewTitle?: string;
  emptyMessage?: string;
  moreLabel?: string;
  scopeLabel?: string;
  shortcutLabel?: string;
  className?: string;
  sideControls?: ReactNode;
}) {
  const activeChips =
    chips ??
    [
      { label: "All", icon: LayoutGrid, active: true },
      { label: "People", icon: User },
      { label: "Tasks", icon: ListTodo },
      { label: "Projects", icon: FolderKanban },
      { label: "This week", icon: Calendar },
    ];

  return (
    <div className={`grid gap-3 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--wt-accent-text)]">
          <Zap className="h-3.5 w-3.5" />
          Fast Find
        </div>
        <div className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold text-[var(--wt-text)]">
          <span className={`h-1.5 w-1.5 rounded-full ${isSearching ? "bg-emerald-500" : "bg-blue-500"}`} />
          <span className="tabular-nums text-[var(--wt-accent-text)]">{visibleCount}</span>
          <span className="text-[var(--wt-text-muted)]">
            {isSearching ? `match${visibleCount === 1 ? "" : "es"}` : `of ${totalCount} items`}
          </span>
        </div>
      </div>

      <div className="relative">
        <div className="group relative max-w-4xl">
          <div className="pointer-events-none absolute inset-y-0 left-5 flex items-center">
            <Search className="h-5 w-5 text-[var(--wt-text-muted)] transition-colors group-focus-within:text-[var(--wt-accent-text)]" />
          </div>
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => onChange(event.currentTarget.value)}
            placeholder={placeholder}
            className="h-14 w-full rounded-[1.35rem] border border-[var(--wt-border)] bg-[var(--wt-input)] px-14 pr-32 text-base font-medium text-[var(--wt-text-strong)] shadow-[var(--wt-control-shadow)] outline-none transition-[background-color,border-color,box-shadow,color] placeholder:text-[var(--wt-text-faint)] hover:border-blue-500/25 focus:border-blue-500/45 focus:ring-2 focus:ring-blue-500/15"
            aria-label="Fast find search"
          />
          <div className="absolute inset-y-0 right-3 flex items-center gap-2">
            <span className="hidden rounded-lg border border-[var(--wt-border)] bg-[var(--wt-surface-muted)] px-2 py-1 text-[11px] font-semibold text-[var(--wt-text-muted)] shadow-sm md:inline-flex">
              {shortcutLabel}
            </span>
            {value ? (
              <button
                type="button"
                onClick={() => onChange("")}
                className="grid h-9 w-9 place-items-center rounded-xl text-[var(--wt-text-muted)] transition-[background-color,color,transform] hover:bg-[var(--wt-surface-hover)] hover:text-[var(--wt-text-strong)] active:scale-[0.96]"
                aria-label="Clear search"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        {isSearching ? (
          <FastFindPreview
            title={previewTitle}
            items={previewItems ?? []}
            visibleCount={visibleCount}
            emptyMessage={emptyMessage ?? `Nothing matched "${value.trim()}".`}
            moreLabel={moreLabel}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {activeChips.map((chip) => (
            <FastFindSearchChip key={chip.label} {...chip} />
          ))}
        </div>

        {sideControls ?? (
          <div className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--wt-border)] bg-[var(--wt-input)] px-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--wt-accent-text)] shadow-sm">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {scopeLabel}
          </div>
        )}
      </div>
    </div>
  );
}

function FastFindSearchChip({
  label,
  icon: Icon = LayoutGrid,
  active = false,
  onClick,
}: FastFindChip) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-[background-color,border-color,color,box-shadow,transform] active:scale-[0.96]",
        active
          ? "border-blue-500/30 bg-[var(--wt-selected)] text-[var(--wt-accent-text)] shadow-[var(--wt-control-shadow)]"
          : "border-[var(--wt-border)] bg-[var(--wt-input)] text-[var(--wt-text-muted)] hover:border-blue-500/25 hover:bg-[var(--wt-accent-soft)] hover:text-[var(--wt-accent-text)]",
      ].join(" ")}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function FastFindPreview({
  title,
  items,
  visibleCount,
  emptyMessage,
  moreLabel,
}: {
  title: string;
  items: FastFindPreviewItem[];
  visibleCount: number;
  emptyMessage: string;
  moreLabel?: string;
}) {
  return (
    <div className="absolute left-0 top-[calc(100%+0.75rem)] z-30 w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--wt-border)] bg-[var(--wt-surface)] shadow-[var(--wt-panel-shadow)]">
      <div className="border-b border-[var(--wt-border)] px-4 py-2.5 text-xs font-semibold text-[var(--wt-text-muted)]">
        {visibleCount > 0 ? title : "No matches"}
      </div>

      {items.length > 0 ? (
        <div className="max-h-80 overflow-y-auto py-1">
          {items.map((item) => {
            const Icon = item.icon ?? CheckCircle2;

            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onSelect}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--wt-selected)]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-blue-500/25 bg-[var(--wt-accent-soft)] text-[var(--wt-accent-text)]">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[var(--wt-text-strong)]">
                    {item.title}
                  </span>
                  {item.detail ? (
                    <span className="mt-0.5 block truncate text-xs text-[var(--wt-text-muted)]">
                      {item.detail}
                    </span>
                  ) : null}
                </span>
                {item.badge ? (
                  <span className="rounded-lg border border-[var(--wt-border)] bg-[var(--wt-surface-muted)] px-2 py-1 text-[11px] font-semibold text-[var(--wt-text-muted)]">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="px-4 py-5 text-sm text-[var(--wt-text-muted)]">{emptyMessage}</div>
      )}

      {visibleCount > items.length ? (
        <div className="border-t border-[var(--wt-border)] px-4 py-3 text-xs font-semibold text-[var(--wt-text-muted)]">
          {moreLabel ?? `Showing ${items.length} of ${visibleCount} matches.`}
        </div>
      ) : null}
    </div>
  );
}
