import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import App from "../app/App";
import * as settingsApi from "../lib/api/settings";
import { WorkTraceCommandError } from "../lib/api/client";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Essentials browser startup", () => {
  it("settles a failed settings read and shows the desktop requirement instead of remounting forever", async () => {
    const read = vi.spyOn(settingsApi, "getSettings").mockRejectedValue(new WorkTraceCommandError("get_settings", "TAURI_RUNTIME_UNAVAILABLE", "Desktop app required"));
    render(<App />);
    await screen.findByText("Tasks couldn't be loaded");
    expect(screen.queryByText("Opening your workspace...")).not.toBeInTheDocument();
    expect(screen.getByText("Desktop app required to save")).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(1);
  });
});
