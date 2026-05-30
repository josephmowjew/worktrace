export type WeekStartDay =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

const weekStartIndexes: Record<WeekStartDay, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function currentWeekRange(date = new Date(), weekStartsOn: WeekStartDay = "monday") {
  const current = new Date(date);
  const day = current.getDay();
  const startIndex = weekStartIndexes[weekStartsOn] ?? weekStartIndexes.monday;
  const diffToStart = (day - startIndex + 7) % 7;
  const start = new Date(current);
  start.setDate(current.getDate() - diffToStart);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return {
    from: formatDateOnly(start),
    to: formatDateOnly(end),
    label: `${formatShortDate(start)} - ${formatShortDate(end)}`,
    start,
    end,
    monday: start,
    friday: end,
  };
}

export function shiftWeek(date: Date, direction: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + direction * 7);
  return shifted;
}

export function recentHistoryRange(date = new Date(), days = 90) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const start = new Date(end);
  start.setDate(end.getDate() - Math.max(days - 1, 0));
  start.setHours(0, 0, 0, 0);

  return {
    from: formatDateOnly(start),
    to: formatDateOnly(end),
    label: `${formatShortDate(start)} - ${formatShortDate(end)}`,
  };
}

export function todayRange(date = new Date()) {
  const today = new Date(date);
  today.setHours(0, 0, 0, 0);
  const value = formatDateOnly(today);

  return {
    from: value,
    to: value,
    label: formatShortDate(today),
    date: value,
  };
}

export function formatDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}
