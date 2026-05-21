import { callCommand } from "./client";

export function showTodoWidget() {
  return callCommand<boolean>("show_todo_widget");
}

export function hideTodoWidget() {
  return callCommand<boolean>("hide_todo_widget");
}

export function toggleTodoWidget() {
  return callCommand<boolean>("toggle_todo_widget");
}

export function setTodoWidgetAlwaysOnTop(enabled: boolean) {
  return callCommand<boolean>("set_todo_widget_always_on_top", { enabled });
}
