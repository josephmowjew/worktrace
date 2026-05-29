import { callCommand } from "./client";
import type {
  CalendarEvent,
  CalendarSource,
  ConnectGoogleCalendarInput,
  DisconnectCalendarSourceInput,
  ListCalendarEventsInput,
  SetCalendarSourceEnabledInput,
  SyncCalendarEventsInput,
  SyncCalendarEventsResult,
} from "../../types/calendar";
import type { GetWeekCapacityInput, WeekCapacity } from "../../types/capacity";

export function connectGoogleCalendar(input: ConnectGoogleCalendarInput) {
  return callCommand<CalendarSource[]>("connect_google_calendar", { input });
}

export function listCalendarSources() {
  return callCommand<CalendarSource[]>("list_calendar_sources");
}

export function disconnectCalendarSource(input: DisconnectCalendarSourceInput) {
  return callCommand<boolean>("disconnect_calendar_source", { input });
}

export function setCalendarSourceEnabled(input: SetCalendarSourceEnabledInput) {
  return callCommand<CalendarSource>("set_calendar_source_enabled", { input });
}

export function syncCalendarEvents(input: SyncCalendarEventsInput) {
  return callCommand<SyncCalendarEventsResult>("sync_calendar_events", { input });
}

export function listCalendarEvents(input: ListCalendarEventsInput) {
  return callCommand<CalendarEvent[]>("list_calendar_events", { input });
}

export function getWeekCapacity(input: GetWeekCapacityInput) {
  return callCommand<WeekCapacity>("get_week_capacity", { input });
}
