import { NavLink } from "react-router-dom";
import type { PropsWithChildren } from "react";
import { useExperience } from "./useExperience";

export function TasksWorkspace({ children }: PropsWithChildren) {
  const experience = useExperience();
  return <div className="space-y-5">{experience.isDeveloper ? <nav aria-label="Task views" className="wt-workflow-tabs">
    <NavLink end to="/tasks">List</NavLink><NavLink to="/weekly-plan">Weekly board</NavLink>
  </nav> : null}{children}</div>;
}
