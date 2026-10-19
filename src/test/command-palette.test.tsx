import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Home } from "lucide-react";
import { CommandPalette, type CommandPaletteAction } from "../components/ui/CommandPalette";

afterEach(cleanup);

function setup() {
  const onClose = vi.fn();
  const onTask = vi.fn();
  const onToday = vi.fn();
  const actions: CommandPaletteAction[] = [
    { id: "today", label: "Go to Today", description: "Daily workflow", group: "Navigation", icon: Home, onRun: onToday },
    { id: "task", label: "Add task", description: "Capture work", group: "Capture", icon: Home, onRun: onTask },
  ];
  render(<CommandPalette isOpen onClose={onClose} actions={actions} />);
  return { onClose, onTask, onToday, input: screen.getByRole("combobox", { name: "Search commands" }) };
}

describe("command palette keyboard navigation", () => {
  it("navigates in visible group order and opens the selected command", () => {
    const { input, onToday, onTask, onClose } = setup();
    expect(screen.getByRole("option", { name: /Add task/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /Go to Today/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onToday).toHaveBeenCalledOnce();
    expect(onTask).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("resets selection after filtering and tolerates an empty result", () => {
    const { input, onToday, onClose } = setup();
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.change(input, { target: { value: "no matching command" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "today" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onToday).toHaveBeenCalledOnce();
  });

  it("dismisses with Escape", () => {
    const { onClose } = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
