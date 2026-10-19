# Essentials and Developer

WorkTrace offers two experiences over the same local records. Change the experience in **Settings → Your experience**.

## Essentials

- **Today** shows overdue, undated, and due-today tasks, plus work completed today.
- **Tasks** provides open, upcoming, completed, and complete-history views. Tasks are not limited to a reporting week; work linked to archived repositories remains accessible.
- A new task requires only a title. Due date, priority, and notes are optional. Existing task details and attachments remain available when editing.
- **Focus timer**, **Work journal**, and **Reports** can be enabled individually in Settings. Turning a tool off hides its entry points without deleting its records.
- Quick capture and the floating widget use the same task storage. Changes refresh other open WorkTrace windows.
- Simple settings expose appearance, backups, and experience preferences. Advanced settings remain available for profile, integrations, and detailed work preferences.

New installations start with a choice between Essentials and Developer. Essentials requires no account, profile, or repository setup.

## Developer

Developer includes all optional tools and retains repository tracking, code activity, weekly planning, insights, reporting, and integrations. The main navigation follows **Today → Tasks → Activity → Repositories → Reports → Insights**. Weekly planning is available from Tasks; the work journal is available under Activity.

Existing installations and settings exports without experience preferences retain Developer behavior. A chosen experience and optional tools persist across restarts and settings exports/imports.

## Data behavior

Switching experiences preserves task IDs, repository links, task types, progress, estimates, report inclusion, journal records, history, and integration configuration. Repository and Sparc Force auto-sync in the main workspace run in Developer. Switching to Essentials does not disconnect configured services.

Reports in Essentials use tasks and journal notes. New tasks and notes are included when Reports is enabled. Existing inclusion flags remain unchanged; previously excluded items can be included explicitly when generating a report.

Local queries and saves run without an internet connection. The browser preview cannot access SQLite, native capture, keyring credentials, or desktop windows; it explains when the desktop app is required.

## Verification

Use `npm run build`, `npm run test:run`, and `npm run tauri:test`. Regression coverage includes fresh and legacy databases, mode persistence, settings import/export, task-history retrieval, title-only creation, completion/reopening, metadata preservation, optional-tool disclosure, and offline query/mutation behavior.

For desktop acceptance, use `npm run tauri:dev` to check first-run selection, switching experiences with existing data, quick capture, widget updates, and native attachments. Browser layout previews do not establish native-window acceptance.
