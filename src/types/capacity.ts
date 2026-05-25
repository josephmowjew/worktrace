export type DayCapacity = {
  date: string;
  dayName: string;
  isWorkingDay: boolean;
  grossCapacityMinutes: number;
  meetingMinutes: number;
  plannedTaskMinutes: number;
  availableMinutes: number;
  remainingMinutes: number;
};

export type WeekCapacity = {
  weekStartDate: string;
  weekEndDate: string;
  grossCapacityMinutes: number;
  meetingMinutes: number;
  plannedTaskMinutes: number;
  availableMinutes: number;
  remainingMinutes: number;
  actualWorkMinutes: number;
  days: DayCapacity[];
};

export type GetWeekCapacityInput = {
  weekStartDate: string;
  weekEndDate: string;
};
