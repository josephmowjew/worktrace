import { useState } from "react";

export function useViewPreference<T extends string>(key: string, initial: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(() => {
    try { const saved = localStorage.getItem(`worktrace.view.${key}`) as T; return allowed.includes(saved) ? saved : initial; }
    catch { return initial; }
  });
  function change(next: T) {
    setValue(next);
    try { localStorage.setItem(`worktrace.view.${key}`, next); } catch { /* Storage may be disabled. */ }
  }
  return [value, change] as const;
}
