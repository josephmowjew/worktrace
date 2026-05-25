import { CalendarDays, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

export function DatePicker({
  value,
  onChange,
  label = "Pick",
  subtitle = "Report date",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  subtitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: 340,
    direction: "down" as "up" | "down",
  });
  const selectedDate = parseDate(value) ?? new Date();
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  }, [value]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function updatePosition() {
      if (!containerRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(340, viewportWidth - 24);
      let left = rect.left;

      if (left + width > viewportWidth - 12) {
        left = viewportWidth - width - 12;
      }
      if (left < 12) {
        left = 12;
      }

      const pickerHeight = 408;
      const spaceBelow = viewportHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const direction =
        spaceBelow >= pickerHeight || spaceBelow >= spaceAbove ? "down" : "up";

      setPosition({
        top: direction === "down" ? rect.bottom + 8 : rect.top - 8,
        left,
        width,
        direction,
      });
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        const target = event.target as Node;
        if (!portalRef.current || !portalRef.current.contains(target)) {
          setOpen(false);
        }
      }
    }

    updatePosition();
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const monthDays = buildCalendarDays(visibleMonth);
  const today = toDateInputValue(new Date());

  function shiftMonth(delta: number) {
    setVisibleMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + delta, 1),
    );
  }

  function selectDate(date: Date) {
    onChange(toDateInputValue(date));
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/70 px-3 text-left text-sm text-slate-100 outline-none transition hover:border-blue-300/30 hover:bg-slate-950/80 focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15"
      >
        <span className="flex min-w-0 items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-cyan-300" />
          <span className="truncate">{formatLongDate(value)}</span>
        </span>
        <span className="rounded-lg border border-white/8 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          {label}
        </span>
      </button>

      {open
        ? createPortal(
            <div
              ref={portalRef}
              className="fixed z-[9999] rounded-2xl border border-white/10 bg-slate-950/95 p-3 shadow-2xl shadow-black/40 backdrop-blur-2xl"
              style={{
                left: `${position.left}px`,
                width: `${position.width}px`,
                top: position.direction === "down" ? `${position.top}px` : undefined,
                bottom:
                  position.direction === "up"
                    ? `calc(100vh - ${position.top}px)`
                    : undefined,
              }}
            >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-cyan-300/25 hover:bg-cyan-300/10 hover:text-cyan-100"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold text-white">
                {new Intl.DateTimeFormat(undefined, {
                  month: "long",
                  year: "numeric",
                }).format(visibleMonth)}
              </p>
              <p className="text-[11px] text-slate-500">{subtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-cyan-300/25 hover:bg-cyan-300/10 hover:text-cyan-100"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((day) => {
              const dateValue = toDateInputValue(day.date);
              const selected = dateValue === value;
              const isToday = dateValue === today;

              return (
                <button
                  key={dateValue}
                  type="button"
                  onClick={() => selectDate(day.date)}
                  className={`h-9 rounded-xl text-sm font-semibold transition ${
                    selected
                      ? "bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/25"
                      : day.inMonth
                        ? "border border-white/0 text-slate-200 hover:border-cyan-300/20 hover:bg-cyan-300/10 hover:text-cyan-100"
                        : "text-slate-700 hover:bg-white/[0.03]"
                  } ${isToday && !selected ? "ring-1 ring-cyan-300/30" : ""}`}
                >
                  {selected ? <Check className="mx-auto h-4 w-4" /> : day.date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-3">
            <button
              type="button"
              onClick={() => selectDate(new Date())}
              className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/15"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.08]"
            >
              Done
            </button>
          </div>
        </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function formatLongDate(value: string) {
  const date = parseDate(value);

  if (!date) {
    return "Select a date";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildCalendarDays(month: Date) {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const firstGridDay = new Date(firstOfMonth);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  firstGridDay.setDate(firstOfMonth.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstGridDay);
    date.setDate(firstGridDay.getDate() + index);

    return {
      date,
      inMonth: date.getMonth() === month.getMonth(),
    };
  });
}
