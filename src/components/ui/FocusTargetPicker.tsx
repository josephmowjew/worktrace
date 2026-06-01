import { BriefcaseBusiness, Check, ChevronDown, FileText, Focus, ListTodo, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import type { FocusTarget, FocusTargetGroup } from "../../types/focusSession";

type PickerProps = {
  value: FocusTarget | null;
  onChange: (target: FocusTarget | null) => void;
  groups: FocusTargetGroup[];
  placeholder?: string;
  className?: string;
};

function iconForKind(kind: FocusTarget["kind"]) {
  switch (kind) {
    case "task":
      return ListTodo;
    case "log":
      return FileText;
    case "project":
      return BriefcaseBusiness;
    case "general":
      return Focus;
  }
}

function optionLabel(option: FocusTarget): string {
  switch (option.kind) {
    case "task":
      return option.title;
    case "log":
      return option.title;
    case "project":
      return option.name;
    case "general":
      return "General focus";
  }
}

function optionSublabel(option: FocusTarget): string | null {
  switch (option.kind) {
    case "task":
      return option.projectName ?? null;
    case "log":
      return null;
    case "project":
      return null;
    case "general":
      return "Untagged work";
  }
}

function optionKey(option: FocusTarget): string {
  return `${option.kind}:${"id" in option ? option.id : "general"}`;
}

function findSelected(groups: FocusTargetGroup[], value: FocusTarget | null): FocusTarget | null {
  if (!value) return null;
  for (const group of groups) {
    const match = group.options.find((option) => optionKey(option) === optionKey(value));
    if (match) return match;
  }
  return null;
}

export function FocusTargetPicker({
  value,
  onChange,
  groups,
  placeholder = "Pick what to focus on\u2026",
  className = "",
}: PickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 320,
    direction: "down" as "up" | "down",
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => findSelected(groups, value), [groups, value]);
  const selectedLabel = selected ? optionLabel(selected) : null;
  const SelectedIcon = selected ? iconForKind(selected.kind) : null;

  const filteredGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return groups;
    return groups
      .map((group) => ({
        ...group,
        options: group.options.filter((option) => {
          if (option.kind === "general") return false;
          const label = optionLabel(option).toLowerCase();
          const sub = optionSublabel(option)?.toLowerCase() ?? "";
          return label.includes(term) || sub.includes(term);
        }),
      }))
      .filter((group) => group.options.length > 0 || group.id === "general");
  }, [groups, search]);

  useEscapeKey(() => setIsOpen(false), isOpen);

  useEffect(() => {
    if (!isOpen) {
      setSearch("");
      return;
    }
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const inTrigger = containerRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inTrigger && !inDropdown) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const compute = () => {
      const rect = containerRef.current!.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const dropdownMinWidth = 240;
      const dropdownMaxWidth = Math.min(360, viewportWidth - 32);
      const calculatedWidth = Math.max(dropdownMinWidth, Math.min(rect.width, dropdownMaxWidth));
      const dropdownMaxHeight = 320;

      let left = rect.left;
      if (left + calculatedWidth > viewportWidth - 16) {
        left = viewportWidth - calculatedWidth - 16;
      }
      if (left < 16) left = 16;

      const spaceBelow = viewportHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const direction = spaceBelow >= dropdownMaxHeight || spaceBelow >= spaceAbove ? "down" : "up";
      const availableHeight = Math.max(
        120,
        Math.min(dropdownMaxHeight, direction === "down" ? spaceBelow : spaceAbove),
      );

      setPosition({
        top: direction === "down" ? rect.bottom + 8 : rect.top - 8,
        left,
        width: calculatedWidth,
        maxHeight: availableHeight,
        direction,
      });
    };

    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [isOpen]);

  const dropdown = isOpen && (
    <div
      ref={dropdownRef}
      className="fixed z-[9999] overflow-hidden rounded-2xl border border-[var(--wt-border)] bg-[var(--wt-surface)] shadow-[var(--wt-panel-shadow)]"
      style={{
        top: position.direction === "down" ? `${position.top}px` : undefined,
        bottom: position.direction === "up" ? `calc(100vh - ${position.top}px)` : undefined,
        left: `${position.left}px`,
        width: `${position.width}px`,
        maxHeight: `${position.maxHeight}px`,
      }}
      data-testid="focus-target-picker-dropdown"
    >
      <div className="flex items-center gap-2 border-b border-[var(--wt-border)] bg-[var(--wt-surface-muted)] px-3 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-[var(--wt-text-muted)]" />
        <input
          ref={searchInputRef}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="Search tasks, logs, projects\u2026"
          className="h-7 flex-1 bg-transparent text-xs text-[var(--wt-text-strong)] outline-none placeholder:text-[var(--wt-text-muted)]"
          data-testid="focus-target-picker-search"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="text-[var(--wt-text-muted)] hover:text-[var(--wt-text-strong)]"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div
        className="select-dropdown max-h-[280px] overflow-y-auto p-1.5"
        style={{ maxHeight: `${position.maxHeight - 56}px` }}
      >
        {filteredGroups.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-[var(--wt-text-muted)]">
            Nothing matches that search.
          </div>
        ) : (
          filteredGroups.map((group) => (
            <div key={group.id} className="mb-1 last:mb-0">
              <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--wt-text-muted)]">
                {group.label}
              </div>
              {group.options.length === 0 ? (
                <div className="px-2 py-1.5 text-xs italic text-[var(--wt-text-muted)]">
                  {group.emptyMessage ?? "Nothing here yet."}
                </div>
              ) : (
                group.options.map((option) => {
                  const OptionIcon = iconForKind(option.kind);
                  const isSelected = value !== null && optionKey(option) === optionKey(value);
                  const sub = optionSublabel(option);
                  return (
                    <button
                      key={optionKey(option)}
                      type="button"
                      onClick={() => {
                        onChange(option);
                        setIsOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-xs transition-colors duration-150 ${
                        isSelected
                          ? "bg-[var(--wt-selected)] text-[var(--wt-accent-text)]"
                          : "text-[var(--wt-text-muted)] hover:bg-[var(--wt-surface-muted)] hover:text-[var(--wt-text-strong)]"
                      }`}
                      data-testid={`focus-target-option-${option.kind}-${"id" in option ? option.id : "general"}`}
                    >
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                          isSelected
                            ? "border-blue-500/20 bg-[var(--wt-accent-soft)] text-[var(--wt-accent-text)]"
                            : "border-[var(--wt-border)] bg-[var(--wt-surface-muted)] text-[var(--wt-text-muted)]"
                        }`}
                      >
                        <OptionIcon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-[var(--wt-text-strong)]">
                          {optionLabel(option)}
                        </div>
                        {sub ? (
                          <div className="truncate text-[11px] text-[var(--wt-text-muted)]">{sub}</div>
                        ) : null}
                      </div>
                      {isSelected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                    </button>
                  );
                })
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={`flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/65 px-3 text-sm text-slate-100 outline-none transition-[background-color,border-color,box-shadow] duration-150 hover:border-emerald-300/40 focus:border-emerald-300/50 focus:ring-2 focus:ring-emerald-500/15 ${
          isOpen ? "border-emerald-300/50 ring-2 ring-emerald-500/15" : ""
        }`}
        data-testid="focus-target-picker-trigger"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {SelectedIcon ? <SelectedIcon className="h-4 w-4 shrink-0 text-emerald-200" /> : null}
          <span className="truncate text-left">
            {selectedLabel ?? <span className="text-slate-500">{placeholder}</span>}
          </span>
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200"
          style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>
      {dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
