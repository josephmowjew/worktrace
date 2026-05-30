import { describe, expect, it } from "vitest";
import { currentWeekRange } from "../lib/dates";

describe("currentWeekRange", () => {
  it("defaults to a Monday through Sunday week", () => {
    const range = currentWeekRange(new Date("2026-05-30T12:00:00"));

    expect(range.from).toBe("2026-05-25");
    expect(range.to).toBe("2026-05-31");
  });

  it("supports Sunday-start weeks", () => {
    const range = currentWeekRange(new Date("2026-05-30T12:00:00"), "sunday");

    expect(range.from).toBe("2026-05-24");
    expect(range.to).toBe("2026-05-30");
  });

  it("supports Saturday-start weeks", () => {
    const range = currentWeekRange(new Date("2026-05-30T12:00:00"), "saturday");

    expect(range.from).toBe("2026-05-30");
    expect(range.to).toBe("2026-06-05");
  });

  it("handles year boundaries", () => {
    const range = currentWeekRange(new Date("2027-01-01T09:00:00"), "monday");

    expect(range.from).toBe("2026-12-28");
    expect(range.to).toBe("2027-01-03");
  });
});
