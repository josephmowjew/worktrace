import type { WeeklyTask } from "../../types/weeklyTask";

export type TaskView = "open" | "upcoming" | "completed" | "all";
export const isOpenTask = (task: WeeklyTask) => task.status !== "completed" && task.status !== "dropped";
export function visibleTasks(tasks: WeeklyTask[], view: TaskView, date: string, search = "", todayOnly = false) {
  const query = search.trim().toLowerCase();
  return tasks.filter((task) => {
    if (query && ![task.title, task.details, task.projectName].filter(Boolean).join(" ").toLowerCase().includes(query)) return false;
    if (view === "completed") return task.status === "completed" && (!todayOnly || task.completedAt?.slice(0, 10) === date);
    if (view === "upcoming") return isOpenTask(task) && Boolean(task.targetDate && task.targetDate > date);
    if (view === "all") return true;
    return isOpenTask(task) && (!todayOnly || !task.targetDate || task.targetDate <= date);
  });
}
