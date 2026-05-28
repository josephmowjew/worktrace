import { Check, ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";

export type SelectOption<T = string> = {
  value: T;
  label: string;
  icon?: React.ElementType;
};

export type SelectSize = "sm" | "md" | "lg";

interface SelectProps<T = string> {
  options: SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  placeholder?: string;
  className?: string;
  size?: SelectSize;
}

const sizeClasses: Record<SelectSize, {
  trigger: string;
  dropdown: string;
  option: string;
  iconWrapper: string;
  icon: string;
  chevron: string;
  check: string;
}> = {
  sm: {
    trigger: "h-8 min-w-[100px] px-2.5 text-xs rounded-xl",
    dropdown: "rounded-xl p-1.5",
    option: "px-2 py-2 text-xs rounded-lg gap-2",
    iconWrapper: "h-6 w-6 rounded-lg shrink-0",
    icon: "h-3 w-3",
    chevron: "h-3.5 w-3.5 shrink-0",
    check: "h-3.5 w-3.5 shrink-0",
  },
  md: {
    trigger: "h-10 min-w-[140px] px-3 text-sm rounded-xl",
    dropdown: "rounded-2xl p-2",
    option: "px-3 py-2.5 text-sm rounded-xl gap-3",
    iconWrapper: "h-8 w-8 rounded-xl shrink-0",
    icon: "h-4 w-4",
    chevron: "h-4 w-4 shrink-0",
    check: "h-4 w-4 shrink-0",
  },
  lg: {
    trigger: "h-12 min-w-[180px] px-4 text-base rounded-2xl",
    dropdown: "rounded-2xl p-2.5",
    option: "px-4 py-3 text-base rounded-xl gap-3",
    iconWrapper: "h-9 w-9 rounded-xl shrink-0",
    icon: "h-5 w-5",
    chevron: "h-5 w-5 shrink-0",
    check: "h-5 w-5 shrink-0",
  },
};

export function Select<T extends string = string>({
  options,
  value,
  onChange,
  placeholder = "Select...",
  className = "",
  size = "md",
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, direction: "down" as "up" | "down" });
  const [dropdownWidth, setDropdownWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);
  const Icon = selectedOption?.icon;
  const classes = sizeClasses[size];

  useEscapeKey(() => setIsOpen(false), isOpen);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const inTrigger = containerRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);

      if (!inTrigger && !inDropdown) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const dropdownMinWidth = 200;
    const dropdownMaxWidth = Math.min(320, viewportWidth - 32);
    const calculatedWidth = Math.max(dropdownMinWidth, Math.min(rect.width, dropdownMaxWidth));
    const dropdownMaxHeight = 256; // max-h-64 = 16rem = 256px

    let left = rect.left;
    if (left + calculatedWidth > viewportWidth - 16) {
      left = viewportWidth - calculatedWidth - 16;
    }
    if (left < 16) {
      left = 16;
    }

    const spaceBelow = viewportHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const direction = spaceBelow >= dropdownMaxHeight || spaceBelow >= spaceAbove ? "down" : "up";

    setDropdownWidth(calculatedWidth);
    setPosition({
      top: direction === "down" ? rect.bottom + 8 : rect.top - 8,
      left,
      width: calculatedWidth,
      direction,
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        const dropdownMinWidth = 200;
        const dropdownMaxWidth = Math.min(320, viewportWidth - 32);
        const calculatedWidth = Math.max(dropdownMinWidth, Math.min(rect.width, dropdownMaxWidth));
        const dropdownMaxHeight = 256;

        let left = rect.left;
        if (left + calculatedWidth > viewportWidth - 16) {
          left = viewportWidth - calculatedWidth - 16;
        }
        if (left < 16) {
          left = 16;
        }

        const spaceBelow = viewportHeight - rect.bottom - 8;
        const spaceAbove = rect.top - 8;
        const direction = spaceBelow >= dropdownMaxHeight || spaceBelow >= spaceAbove ? "down" : "up";

        setDropdownWidth(calculatedWidth);
        setPosition({
          top: direction === "down" ? rect.bottom + 8 : rect.top - 8,
          left,
          width: calculatedWidth,
          direction,
        });
      }
    };

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  const dropdown = isOpen && (
    <div
      ref={dropdownRef}
      className={`fixed z-[9999] max-h-64 overflow-y-auto border border-white/10 bg-slate-950/90 shadow-2xl shadow-black/40 backdrop-blur-2xl ${classes.dropdown}`}
      style={{
        top: position.direction === "down" ? `${position.top}px` : undefined,
        bottom: position.direction === "up" ? `calc(100vh - ${position.top}px)` : undefined,
        left: `${position.left}px`,
        width: `${dropdownWidth}px`,
      }}
    >
      <style>{`
        .select-dropdown::-webkit-scrollbar {
          width: 6px;
        }
        .select-dropdown::-webkit-scrollbar-track {
          background: transparent;
        }
        .select-dropdown::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
        .select-dropdown::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
      <div className="select-dropdown space-y-1">
        {options.map((option) => {
          const OptionIcon = option.icon;
          const isSelected = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`flex w-full items-center transition-[background-color,color] duration-150 ${classes.option} ${
                isSelected
                  ? "bg-blue-500/10 text-white"
                  : "text-slate-300 hover:bg-white/8 hover:text-white"
              }`}
            >
              {OptionIcon && (
                <div
                  className={`flex items-center justify-center border ${classes.iconWrapper} ${
                    isSelected
                      ? "border-blue-300/20 bg-blue-500/10 text-blue-400"
                      : "border-white/10 bg-white/5 text-slate-400"
                  }`}
                >
                  <OptionIcon className={classes.icon} />
                </div>
              )}
              <span className="flex-1 min-w-0 truncate text-left">{option.label}</span>
              {isSelected && <Check className={classes.check} />}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between gap-2 border border-white/10 bg-slate-950/70 font-medium text-white backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-150 hover:border-blue-300/24 hover:bg-slate-950/82 focus:border-blue-300/40 focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${classes.trigger}`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {Icon && <Icon className={`${classes.icon} shrink-0`} />}
          <span className="truncate">{selectedOption?.label ?? placeholder}</span>
        </span>
        <ChevronDown
          className={`text-slate-400 transition-transform duration-200 ${classes.chevron}`}
          style={{ transform: isOpen ? (position.direction === "up" ? "rotate(0deg)" : "rotate(180deg)") : "rotate(0deg)" }}
        />
      </button>

      {dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
