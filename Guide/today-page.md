# Today Page

The Today page is the main daily command center for WorkTrace. It is mounted at `/` and is intended to be the first place a user checks before starting, reviewing, or reporting on a workday.

## Purpose

Today brings together the current date, the active work week, local activity evidence, daily priorities, focus sessions, blockers, reminders, and report readiness. It helps the user answer:

- What should I focus on now?
- What work is already planned or in progress?
- What is blocked?
- What evidence has WorkTrace captured today?
- Is there enough information to review the day or prepare a weekly report?

## Data Loaded

The page loads:

- Active projects.
- App settings and onboarding progress.
- Weekly tasks for the current Monday-to-Friday work week.
- Calendar capacity for the current week.
- Activity items for today, including commits and manual logs.
- The active focus session, refreshed every 5 seconds.
- Focus sessions for today.
- Daily review report notes for today.
- Dismissed Today nudges.
- Priority reminders for today, refreshed every 60 seconds.
- The Today Command Center data for today.

## Header Actions

The page header displays the title `Today`, the current date label, and the current week label. It provides quick actions to:

- Create a full task.
- Create a quick manual log.
- Sync repositories.
- Open the end-of-day review.
- Navigate to reports.
- Open report preparation.

## Today Command Center

The command center is the main panel at the top of the page. It displays:

- The main focus for today.
- The active project related to the current or suggested task.
- The count of open tasks.
- The count of upcoming meetings.
- Today’s date.
- The next suggested action.
- Editable Top 3 priorities.
- Focus progress.
- Distraction risk.
- Background/startup status.
- Current active project.
- Upcoming meetings.
- Top priorities with status and focus actions.

The main focus is chosen in this order:

1. Current task from the daily plan or active focus session.
2. First open top priority.
3. Fallback text: `Choose a main focus for today`.

The active project is chosen from the current task, suggested task, first open task with a project, or `General`.

The next suggested action is:

- `Start with {task title}` when a suggested task exists.
- `Review open tasks and pick the next focus block` when open tasks exist.
- `Sync activity or add the first task for today` when there is no task context.

## Top Priorities

The command center stores or suggests up to three daily priorities.

If saved priorities exist, those are shown. If no priorities are saved, WorkTrace suggests up to three eligible weekly tasks. Eligible tasks are not completed, not dropped, and have no target date later than today.

Suggested priorities are sorted by:

1. Priority: high, normal, low.
2. Target date, with undated tasks last.
3. Creation time.

Default planned minutes are used when no estimate exists:

- High priority: 90 minutes.
- Normal priority: 60 minutes.
- Low priority: 30 minutes.

The page lets the user edit priority titles, planned minutes, save the priority list, start focus on a priority, and mark priorities done.

## Summary Stats

The stat row displays:

- `Planned Today`: count of open today tasks with `todo` status.
- `In Progress`: count of open today tasks with `in_progress` status.
- `Blockers`: count of weekly tasks with `blocked` status.
- `Report Ready`: count of today activity items plus weekly tasks that are marked `includedInReport`.
- `Capacity Today`: remaining calendar capacity for today, formatted as minutes/hours.

Today tasks are weekly tasks that are not completed or dropped and either have no target date or have a target date on or before today.

## Quick Add

The quick add bar creates a planned weekly task for today. It captures:

- Task title.
- Project, or `General`.
- Priority.
- Target date, defaulting to today.

New quick-add tasks start as `todo`, use task type `planned_work`, belong to the current week, and are not included in the report by default.

## Carryover Assistant

The carryover section appears for open tasks from earlier weeks. It supports:

- Carrying a task into the current week.
- Dropping the task.
- Marking the task done.
- Marking the task as included in the report.

Previous open tasks are tasks whose week start date is before the current week and whose status is `todo`, `in_progress`, or `blocked`.

## Active Work And Blockers

The main work area shows two task panels:

- `Active Work`: up to eight in-progress and planned today tasks.
- `Blockers`: up to eight blocked tasks.

Each task row shows the title, project or `General`, priority, and actions to start focus, start the task, or mark it done.

## Priority Reminders

The Priority Reminders panel shows active reminders for incomplete top priorities. It excludes dismissed reminders and reminders for priorities that are already done or dropped.

Each reminder can be:

- Used to start a focus session.
- Marked done.
- Snoozed.
- Dismissed for today.

## Nudges

Today builds contextual nudges and hides any the user has dismissed for the date. Nudges can appear when:

- No activity has been captured today.
- At least one active project has a repository path and can be synced.
- One or more blockers are open.
- Previous work needs a carryover decision.
- Report preparation is useful.
- A focus session needs attention.

## Focus Session Panel

The focus panel shows the active focus session and allows the user to:

- Start a focus session.
- Stop the active session.
- Cancel the active session.

Active focus data refreshes every 5 seconds. Stopping a session opens a stop-focus modal.

## Today Activity

The Today Activity panel lists up to seven activity items captured for today. Items can include commits and manual logs. Each row displays:

- Activity summary.
- Project name or `General`.
- Activity type.

If there is no activity, the page prompts the user to sync repositories or add a quick log.

## Report Readiness

Report readiness shows three checks:

- Today has captured activity.
- Weekly tasks are flagged for report.
- Blockers are reviewed.

These are calculated from today activity items, weekly tasks marked `includedInReport`, and whether the blocker count is zero.

## End-Of-Day Review

The Review action opens a guided modal. It displays:

- Commit count.
- Manual log count.
- Focus session count.
- Blocker count.
- Report-ready task count.
- Captured activity and focus sessions.
- Open task confirmation actions.
- A daily review note editor.

The review note contains fields for:

- What was finished today.
- What is blocked.
- What should carry into tomorrow.

Saved review notes are included in reports.

## Report Preparation

The Prep action opens a report preparation modal using today activity, weekly tasks, and blockers. It helps sync activity, carry tasks, mark tasks for reports, and move into the Reports page.

## Calculations From The Backend

The Today Command Center calculates:

- Current task: daily plan current task, active focus task, or first in-progress weekly task.
- Suggested next task: saved suggested task, first open linked priority, or highest-ranked open task.
- Focus actual minutes: completed focus session minutes for today plus elapsed minutes from an active focus session.
- Planned vs actual: each priority’s planned minutes compared with focus-session minutes linked to its weekly task.
- End-of-day progress: completed priority count, total priority count, planned minutes, actual minutes, and variance.
- Distraction risk: score and level based on support/client feedback/meeting minutes, planned-work coverage, unplanned work time, and very long active focus sessions.

Distraction risk levels are:

- `low` below 35.
- `medium` from 35 to 64.
- `high` at 65 and above.

## Browser-Only Behavior

If the Today Command Center cannot load, the page shows an unavailable message but keeps the existing Today tools usable. This preserves the app’s browser-only guard while native data features remain dependent on Tauri.
