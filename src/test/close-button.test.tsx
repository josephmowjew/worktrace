import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CloseButton } from "../components/ui/CloseButton";

describe("CloseButton", () => {
  it("renders an icon-only button with an accessible label", () => {
    render(<CloseButton label="Close details" />);

    const button = screen.getByRole("button", { name: "Close details" });

    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveTextContent("");
  });

  it("calls onClick when activated", () => {
    const onClick = vi.fn();

    render(<CloseButton label="Close panel" onClick={onClick} />);

    fireEvent.click(screen.getByRole("button", { name: "Close panel" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("supports disabled state", () => {
    const onClick = vi.fn();

    render(<CloseButton label="Dismiss notification" disabled onClick={onClick} />);

    const button = screen.getByRole("button", { name: "Dismiss notification" });
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("merges custom classes", () => {
    render(<CloseButton label="Close custom surface" className="custom-close-class" />);

    expect(screen.getByRole("button", { name: "Close custom surface" })).toHaveClass("custom-close-class");
  });
});
