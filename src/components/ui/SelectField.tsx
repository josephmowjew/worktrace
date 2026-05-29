import { createPortal } from "react-dom";
import { useController } from "react-hook-form";
import { useEffect, useRef, useState } from "react";
import type { FieldValues, UseControllerProps } from "react-hook-form";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import type { SelectOption, SelectSize } from "./Select";

interface SelectFieldProps<TFieldValues extends FieldValues = FieldValues>
  extends UseControllerProps<TFieldValues> {
  options: SelectOption<string>[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
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

export function SelectField<TFieldValues extends FieldValues = FieldValues>({
  options,
  placeholder = "Select...",
  className = "",
  disabled = false,
  size = "md",
  ...controllerProps
}: SelectFieldProps<TFieldValues>) {
  const { field } = useController(controllerProps);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 256,
    direction: "down" as "up" | "down",
  });
  const [dropdownWidth, setDropdownWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === field.value);
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
    const availableHeight = Math.max(96, Math.min(dropdownMaxHeight, direction === "down" ? spaceBelow : spaceAbove));

    setDropdownWidth(calculatedWidth);
    setPosition({
      top: direction === "down" ? rect.bottom + 8 : rect.top - 8,
      left,
      width: calculatedWidth,
      maxHeight: availableHeight,
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
        const availableHeight = Math.max(96, Math.min(dropdownMaxHeight, direction === "down" ? spaceBelow : spaceAbove));

        setDropdownWidth(calculatedWidth);
        setPosition({
          top: direction === "down" ? rect.bottom + 8 : rect.top - 8,
          left,
          width: calculatedWidth,
          maxHeight: availableHeight,
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

  const handleChange = (value: string) => {
    field.onChange(value);
    setIsOpen(false);
  };

  const dropdown = isOpen && !disabled && (
    <div
      ref={dropdownRef}
      className={`fixed z-[9999] max-h-64 overflow-y-auto border border-[var(--wt-border)] bg-[var(--wt-surface)] shadow-[var(--wt-panel-shadow)] ${classes.dropdown}`}
      style={{
        top: position.direction === "down" ? `${position.top}px` : undefined,
        bottom: position.direction === "up" ? `calc(100vh - ${position.top}px)` : undefined,
        left: `${position.left}px`,
        width: `${dropdownWidth}px`,
        maxHeight: `${position.maxHeight}px`,
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
          const isSelected = option.value === field.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleChange(option.value)}
              className={`flex w-full items-center transition-[background-color,color] duration-150 ${classes.option} ${
                isSelected
                  ? "bg-[var(--wt-selected)] text-[var(--wt-accent-text)]"
                  : "text-[var(--wt-text-muted)] hover:bg-[var(--wt-surface-muted)] hover:text-[var(--wt-text-strong)]"
              }`}
            >
              {OptionIcon && (
                <div
                  className={`flex items-center justify-center border ${classes.iconWrapper} ${
                    isSelected
                      ? "border-blue-500/20 bg-[var(--wt-accent-soft)] text-[var(--wt-accent-text)]"
                      : "border-[var(--wt-border)] bg-[var(--wt-surface-muted)] text-[var(--wt-text-muted)]"
                  }`}
                >
                  <OptionIcon className={classes.icon} />
                </div>
              )}
              <span className="flex-1 min-w-0 truncate text-left">{option.label}</span>
              {isSelected && (
                <svg
                  className={classes.check}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
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
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex w-full items-center justify-between gap-2 border border-[var(--wt-border)] bg-[var(--wt-input)] text-[var(--wt-text-strong)] outline-none transition placeholder:text-[var(--wt-text-faint)] focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:opacity-50 ${classes.trigger}`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {Icon && <Icon className={`${classes.icon} shrink-0`} />}
          <span className={`truncate ${field.value ? "text-[var(--wt-text-strong)]" : "text-[var(--wt-text-faint)]"}`}>
            {selectedOption?.label ?? placeholder}
          </span>
        </span>
        <svg
          className={`text-[var(--wt-text-muted)] transition-transform duration-200 ${classes.chevron}`}
          style={{ transform: isOpen ? (position.direction === "up" ? "rotate(0deg)" : "rotate(180deg)") : "rotate(0deg)" }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
