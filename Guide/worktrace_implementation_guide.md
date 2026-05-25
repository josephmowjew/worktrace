# WorkTrace Desktop Implementation Guide

Current Step: MVP verification - desktop runtime acceptance pass

Guide Status: Weekly Plan feature implemented; desktop runtime acceptance remains the active gate

Last Updated: 2026-05-20

## Purpose

WorkTrace is a local-first desktop app for developers to collect Git activity, add manual work logs, and generate weekly Markdown reports. The MVP uses Tauri v2, React, TypeScript, Vite, Tailwind CSS, SQLite, and Rust-owned backend logic.

The product must feel like a private personal work assistant. Do not add screenshots, screen recording, keystroke logging, browser surveillance, or background monitoring in the MVP.

## Architecture Rules

Rust owns SQLite, migrations, Git scanning, repository path validation, report generation, settings persistence, filesystem access, and Tauri command error boundaries.

React owns the app shell, navigation, forms, tables, timeline views, report preview/editing, loading states, empty states, and typed Tauri command calls.

React must not access SQLite directly. React must not shell out to Git directly.

Backend layers:

```text
src-tauri/src/
  domain/
  application/
  infrastructure/
  interface/
```

Frontend layers:

```text
src/
  app/
  components/
  features/
  lib/
  pages/
  styles/
  types/
```

All commands return:

```ts
export type AppResult<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
};
```

## Public Tauri Commands

```ts
list_projects()
create_project(input)
update_project(id, input)
archive_project(id)
validate_repo_path(path)

sync_commits(input)
list_activity(input)
create_manual_log(input)
update_manual_log(id, input)
delete_manual_log(id)

generate_report(input)
save_report(input)
list_reports()
get_report(id)

get_settings()
update_settings(input)
```

## Data Model

SQLite tables for MVP:

- `projects`
- `commits`
- `manual_logs`
- `reports`
- `report_items`
- `settings`
- `report_notes`

Store timestamps as ISO 8601 text. Store booleans as integer `0` or `1`. Store IDs as backend-generated text IDs.

## Step Tracker

### Phase 1 - Project Foundation

#### Step 1.1 - Scaffold Tauri Desktop App

Status: Done

Goal: Create the Tauri v2 React TypeScript application at the repository root.

Acceptance criteria:

- `npm install` completes.
- `npm run tauri dev` launches the app.
- The window title uses `WorkTrace`.
- The app opens to a working React screen.

Notes:

- Completed with `create-tauri-app` using Tauri v2, React, TypeScript, and npm.
- App product name and window title are now `WorkTrace`.
- Visual Studio Build Tools native C++ workload was repaired.
- `cargo test` passes when run from the Build Tools developer environment.
- Full `npm.cmd run tauri build` passes when run from the Build Tools developer environment.
- Built desktop exe launch smoke passed.

#### Step 1.2 - Install Frontend Dependencies

Status: Done

Goal: Add the frontend libraries needed for the MVP.

Acceptance criteria:

- Tailwind utility classes render correctly.
- Lucide icons render in React.
- App compiles with no TypeScript errors.

Notes:

- Tailwind CSS v4 is configured through `@tailwindcss/vite`.
- Installed lucide-react, React Router, TanStack Query, React Hook Form, Zod, and Hookform resolvers.

#### Step 1.3 - Create App Shell

Status: Done

Goal: Replace scaffold UI with the WorkTrace native-style shell.

Acceptance criteria:

- Navigation changes pages without reload.
- Layout fits a desktop viewport without horizontal overflow.
- UI resembles the provided WorkTrace design direction.

Notes:

- Starter Tauri demo was replaced with the WorkTrace app shell.
- The default route is Dashboard.

### Phase 2 - Clean Architecture Baseline

#### Step 2.1 - Create Backend Module Boundaries

Status: Done

Goal: Establish Rust clean architecture folders before feature code grows.

Acceptance criteria:

- Rust modules are organized by domain, application, infrastructure, and interface.
- Tauri command files delegate to application services in later steps.
- No database or Git logic lives directly in React.

Notes:

- Backend clean architecture folders are in place.
- Placeholder command modules are registered.
- `cargo test` passes from the Build Tools developer environment.

#### Step 2.2 - Create Frontend Module Boundaries

Status: Done

Goal: Establish predictable frontend folders and shared UI primitives.

Acceptance criteria:

- Pages import shared components.
- API functions centralize Tauri invocation.
- Shared components have stable visual styles.

Notes:

- Frontend clean architecture folders are in place.
- App-specific primitives were added for panels, buttons, badges, and stat cards.

### Phase 3 - SQLite Foundation

#### Step 3.1 - Add SQLite Dependencies and App Database Path

Status: Done

Goal: Add Rust SQLite support and initialize the local database in the app data directory.

Implementation tasks:

- Add `sqlx` with SQLite and runtime features.
- Resolve app data directory through Tauri path APIs.
- Create/open `worktrace.sqlite`.
- Store the connection pool in app state.

Acceptance criteria:

- App starts and creates the SQLite file in the app data directory.
- Failure to open the database returns a clear app startup error.

Verification command:

```bash
cargo test
```

Notes:

- Added `sqlx` with SQLite runtime support.
- Added app startup database initialization in the Tauri app data directory.
- Database filename is `worktrace.sqlite`.
- Added managed `AppState` containing the database connection.
- App launch smoke created `worktrace.sqlite` in `C:\Users\Sparc\AppData\Roaming\app.worktrace.desktop`.

#### Step 3.2 - Implement Migrations

Status: Done

Goal: Create and run migrations for all MVP tables.

Implementation tasks:

- Add schema for projects, commits, manual logs, reports, report items, settings, and report notes.
- Enable SQLite foreign keys.
- Run schema creation on app startup.
- Use idempotent `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` statements.

Acceptance criteria:

- Fresh database can create the full MVP schema after the Rust linker issue is fixed.
- Re-running migrations is safe.

Verification command:

```bash
cargo test
```

Notes:

- Implemented in `src-tauri/src/infrastructure/database/migrations.rs`.
- Verified by full Tauri build and app launch smoke.

#### Step 3.3 - Implement Repository Traits and SQLite Repositories

Status: Done

Goal: Add persistence boundaries for projects, commits, logs, reports, notes, and settings.

Implementation tasks:

- Start with project persistence.
- Implement SQLite project repository.
- Wire project commands through backend app state.

Acceptance criteria:

- Projects can be created, listed, updated, and archived through Tauri commands after Rust linker issue is fixed.

Completed:

- Application-layer repository traits are implemented.
- Project SQLite repository is implemented.
- Commit upsert repository is implemented.
- Manual log SQLite repository is implemented.
- Report SQLite repository is implemented.
- Report item SQLite repository is implemented.
- Report note SQLite repository is implemented.
- Settings SQLite repository with defaults is implemented.
- Repository test coverage is implemented and passing.

### Phase 4 - Projects Workflow

Status: Done

Implement add/list/edit/archive projects, repo path validation, and project persistence.

Completed:

- Added typed project models on the frontend.
- Added project API wrapper functions for list/create/update/archive/validate path.
- Replaced the placeholder Projects page with a real management screen.
- Added search, status filters, project metrics, create/edit form, repo validation action, and archive action.
- Wired the page to TanStack Query and the Tauri command API layer.
- Added native folder picker integration for repository selection through the Tauri dialog plugin.
- Moved Projects command behavior through `ProjectService` so Tauri handlers stay thin.
- Polished the Projects page, app shell, panels, buttons, and badges toward the dark native dashboard design direction.
- Created `C:\tmp\worktrace-test-repo` as a real local Git repository for runtime path validation.
- Verified the Tauri desktop runtime launches with the updated Phase 4 build from the Visual Studio Build Tools environment.
- Verified production Tauri packaging with the dialog plugin enabled.
- Added repo-local `npm run tauri:dev` and `npm run tauri:build` wrappers so local runs load the Visual Studio Build Tools environment.
- Fixed app shell scrolling and Projects page responsive layout so shorter desktop windows do not cut off content.

Verification:

- Project create/list/update/archive persistence is covered by repository tests.
- Repository path validation is covered by a real local Git repo path, `C:\tmp\worktrace-test-repo`.
- Tauri dev launch smoke passed from the Build Tools environment.
- Production Tauri build passed after the folder picker and responsive layout changes.

### Phase 5 - Git Sync

Status: Done

Implement local Git scanning by date range, commit parsing, stats collection, and SQLite upsert by `project_id + commit_hash`.

Completed:

- Added sync command input/result domain types.
- Added delimiter-safe Git log parser.
- Added local Git scanner using argument-based `git` commands.
- Added best-effort current branch capture.
- Added per-commit file/change stats from `git show --numstat`.
- Added commit SQLite upsert repository.
- Wired `sync_commits` command to active projects and commit upserts.
- Added typed frontend Git sync API wrapper.
- Added `Sync This Week` actions on Dashboard and Activity Timeline.
- Frontend build passes.
- Implemented `list_activity(input)` with date range filtering.
- Added SQLite activity query support for synced commits and manual logs grouped by day.
- Replaced Activity Timeline placeholder with real grouped activity rows.
- Added Rust test coverage for activity grouping across commits and manual logs.
- Moved Git sync orchestration into `GitSyncService` so Tauri command handlers stay thin.
- Added real Git scanner coverage using a temporary Git repository and actual `git` commands.
- Added end-to-end backend coverage for project persistence, real Git sync, commit upsert, and activity timeline query.
- Created a real verification commit in `C:\tmp\worktrace-test-repo`: `feat: verify phase 5 sync`.

Follow-up:

- Large repository sync can later get progress reporting and cancellation, but the MVP sync path is complete.

Strict phase gate note:

- Phase 3 Step 3 is complete.
- Phase 4 is complete.
- Phase 5 is complete.
- Phase 6 may begin.

### Phase 6 - Manual Logs

Status: Done

Implement CRUD for manual meetings and non-code work, including include/exclude from reports.

Completed:

- Added `list_manual_logs(input)`, `create_manual_log(input)`, `update_manual_log(id, input)`, and `delete_manual_log(id)` Tauri commands.
- Added manual log service validation for required date, required summary, and non-negative duration.
- Wired commands through `ManualLogService` and `ManualLogRepository`.
- Added typed frontend manual log API wrappers and shared TypeScript types.
- Replaced placeholder Manual Log page with a real create/edit/delete workflow.
- Added project selection, activity type selection, duration, outcome, follow-up, and include/exclude from report controls.
- Recent logs now load from SQLite for the current reporting week and invalidate Activity Timeline after changes.
- Existing repository tests cover manual log create/update/delete and date range listing.

### Phase 7 - Activity Timeline

Status: Done

Combine commits, logs, blockers, and next-week plans into grouped day/project activity views.

Completed:

- Activity Timeline reads real synced commits and manual logs through `list_activity(input)`.
- Added working activity type filters using backend query inputs.
- Added working project filter using backend project ID filtering.
- Grouped each day by project, including general/manual-only activity.
- Added weekly summary counts for total items, commits, manual logs, report-ready items, and hidden items.
- Added activity type breakdown panel.
- Added clear report inclusion/exclusion badges on each activity row.
- Preserved the dark native dashboard design language and responsive layout.
- Added backend test coverage for activity type and project filters.

### Phase 8 - Report Builder

Status: Done

Generate editable Markdown weekly reports, copy to clipboard, save history, and export Markdown.

Completed:

- Added `generate_report(input)`, `save_report(input)`, `list_reports()`, and `get_report(id)` Tauri commands.
- Implemented backend Markdown generation from activity data with date range, recipient, project, section, and hidden-item controls.
- Added validation for report generation and saving.
- Wired report generation and persistence through `ReportService` and existing SQLite report repository.
- Added Rust test coverage for report generation from commits and manual logs.
- Added typed frontend report API wrappers and shared TypeScript report types.
- Replaced placeholder Reports page with a real three-pane builder.
- Added editable Markdown preview, copy to clipboard, save report history, load saved report, and Markdown export.
- PDF export remains intentionally out of MVP.

### Phase 9 - Settings

Status: Done

Persist profile, Git author email, default manager, working days, theme, and report template.

Completed:

- Implemented `SettingsService` with persistent get/update behavior.
- Changed `get_settings()` to read from SQLite through `SettingsRepository`.
- Added and registered `update_settings(input)`.
- Added validation for email-like values, theme values, report template values, and working days.
- Added Rust service tests for defaults, updates, invalid theme, invalid working day, and reload behavior.
- Added typed frontend settings API wrappers and shared TypeScript settings types.
- Replaced placeholder Settings page with a real native-style settings form.
- Settings now support profile, email, default manager, Git author email, working days, theme preference, and report template.
- Report Builder now uses saved default manager name as the recipient fallback.
- Theme is persisted as a preference; broad app theme switching remains out of this phase.

### Phase 10 - Polish and Native Feel

Status: Done

Match the dark native dashboard direction, add loading and empty states, verify desktop sizing, and complete the MVP happy path.

Completed:
- Added a responsive compact navigation strip so resized desktop windows do not lose navigation below the sidebar breakpoint.
- Removed inert global search from the shell until it has a real command-backed implementation.
- Replaced the misleading sidebar weekly duration with real activity item counts and commit/manual split.
- Wired saved Git author email into Dashboard and Activity Timeline sync calls.
- Added dashboard loading/error states so empty values do not mask failed data loads.
- Guarded frontend command calls with a clear Tauri runtime unavailable error for browser-only Vite previews.
- Fixed local date formatting to avoid timezone-shifted week ranges.
- Fixed Git scanner date bounds so commits made on the selected end date are included.
- Protected Settings form edits from late query reset while the form is dirty.
- Added automatic Git sync after saving a Git-backed project.
- Added five-minute in-app auto-sync for active Git-backed projects while WorkTrace is open.
- Added a dedicated Weekly Plan page backed by a new `weekly_tasks` SQLite table.
- Added task carry-forward for open, in-progress, and blocked weekly tasks.
- Added weekly task report sections for completed checklist, blockers, carryovers, planned work, and follow-ups.
- Hid archived project data from operational activity, manual log, weekly plan, report, heatmap, summary, and highlight queries while preserving it in the Projects archive view.
- Redesigned Manual Log to match the provided dark native reference with a hero metrics band, rich recent-log list, polished form panel, report toggle, and responsive scroll behavior.
- Added a custom dark Manual Log date picker with month navigation, today shortcut, selected-day styling, and plain `YYYY-MM-DD` form storage.
- Redesigned Reports to match the richer dark dashboard reference with hero stats, a polished builder panel, live preview metadata, saved-report cards, and shared responsive date pickers.
- Completed a Projects page functionality pass: restored project auto-sync after save, wired archived-project and repository-history buttons, reset pagination on search/filter changes, and smoke-tested the visible controls.
- Completed cross-page functionality sweep: wired Dashboard search, Manual Log sorting, removed decorative Activity highlight action, verified Reports/Weekly Plan/Activity/Settings primary controls, and kept date picker labels page-specific.
- Added global native-style toast feedback for confirmations and failures across sync, project, manual log, weekly task, report, settings, export, copy, and background sync actions.

## Verification Log

- `npm.cmd install`: Passed.
- `npm.cmd install tailwindcss @tailwindcss/vite lucide-react react-router-dom @tanstack/react-query react-hook-form zod @hookform/resolvers`: Passed.
- `npm.cmd run build`: Passed.
- `cargo fmt`: Passed.
- Visual Studio Build Tools native C++ workload repair: Passed.
- `cargo test` from Build Tools developer environment: Passed.
- `npm.cmd run tauri build` from Build Tools developer environment: Passed.
- Built exe launch smoke: Passed.
- SQLite app data database creation: Passed.
- Phase 3.3 repository tests: Passed, 7/7.
- Phase 4 native folder picker build: Passed.
- Phase 4 runtime Tauri dev launch smoke from Build Tools environment: Passed.
- Phase 4 production Tauri build with MSI and NSIS bundles: Passed.
- Phase 4 responsive layout repair build: Passed.
- Phase 5 activity query tests: Passed, 8/8.
- Phase 5 frontend Activity Timeline build: Passed.
- Phase 5 production Tauri build after activity query wiring: Passed.
- Phase 5 real Git scanner test: Passed.
- Phase 5 real repo sync-to-activity backend test: Passed.
- Phase 5 repository test suite: Passed, 10/10.
- Phase 5 real verification repo commit: Passed, `c242fee feat: verify phase 5 sync`.
- Phase 5 production Tauri build after service extraction: Passed.
- Phase 6 backend repository tests: Passed.
- Phase 6 frontend Manual Log build: Passed.
- Phase 6 production Tauri build after Manual Log command wiring: Passed.
- Phase 7 activity filter and project filter tests: Passed.
- Phase 7 frontend Activity Timeline build: Passed.
- Phase 7 production Tauri build after timeline workflow completion: Passed.
- Phase 8 report generation test: Passed.
- Phase 8 frontend Report Builder build: Passed.
- Phase 8 production Tauri build after report workflow completion: Passed.
- Phase 9 settings service validation tests: Passed.
- Phase 9 frontend Settings build: Passed.
- Phase 9 production Tauri build after settings workflow completion: Passed.
- Phase 10 frontend polish build: Passed.
- Phase 10 backend test suite after Git end-date fix: Passed, 14/14.
- Phase 10 production Tauri package build: Passed with MSI and NSIS bundles.
- Phase 10 browser visual smoke: Passed for responsive shell navigation and scrollable content; browser-only Vite preview correctly reports that SQLite/Git/native dialogs require the Tauri desktop runtime.
- Phase 10 automatic project sync frontend build: Passed.
- Weekly Plan frontend build: Passed.
- Weekly Plan backend repository/report tests: Passed, 15/15.
- Weekly Plan production Tauri package build: Passed with MSI and NSIS bundles.
- Archived project operational visibility fix frontend build: Passed.
- Archived project operational visibility fix backend tests: Passed, 22/22.
- Manual Log redesign frontend build: Passed.
- Manual Log custom date picker frontend build and browser interaction smoke: Passed.
- Reports redesign frontend build and date picker clipping smoke: Passed.
- Projects functionality pass frontend build and browser interaction smoke: Passed.
- Cross-page functionality sweep frontend build, backend tests, and browser interaction smoke: Passed.
- Global action feedback frontend build and browser toast smoke: Passed.

## MVP Out of Scope

- GitHub OAuth
- GitHub API activity
- AI summaries
- Calendar integrations
- PDF export
- Team management
- Screenshots
- Keystroke logging
- Browser surveillance
- Automatic background tracking without user action

## Definition of Done

The MVP is done when a developer can add a local project, sync commits, add manual logs, manage weekly plan tasks, review weekly activity, generate an editable Markdown report, copy it, save it, reopen it, and restart the app without losing local data.
