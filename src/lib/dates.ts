export function currentWeekRange(date = new Date()) {
  const current = new Date(date);
  const day = current.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(current);
  monday.setDate(current.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);

  return {
    from: formatDateOnly(monday),
    to: formatDateOnly(friday),
    label: `${formatShortDate(monday)} - ${formatShortDate(friday)}`,
    monday,
    friday,
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

function formatDateOnly(date: Date) {
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
