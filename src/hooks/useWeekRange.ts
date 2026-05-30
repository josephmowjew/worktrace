import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSettings } from "../lib/api/settings";
import { currentWeekRange } from "../lib/dates";
import type { WeekStartDay } from "../lib/dates";

const validWeekStartDays = new Set<WeekStartDay>([
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]);

export function useWeekRange(date?: Date) {
  const defaultDateRef = useRef(new Date());
  const effectiveDate = date ?? defaultDateRef.current;
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });
  const weekStartsOn = normalizeWeekStartsOn(settingsQuery.data?.weekStartsOn);

  return useMemo(
    () => currentWeekRange(effectiveDate, weekStartsOn),
    [effectiveDate, weekStartsOn],
  );
}

export function normalizeWeekStartsOn(value: unknown): WeekStartDay {
  return typeof value === "string" && validWeekStartDays.has(value as WeekStartDay)
    ? (value as WeekStartDay)
    : "monday";
}
