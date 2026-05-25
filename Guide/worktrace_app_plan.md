# WorkTrace - Developer Weekly Work Tracker

WorkTrace is a local-first productivity and reporting application for developers who need to track weekly work across multiple projects and generate professional weekly updates.

The MVP focuses on:

- Add and manage projects.
- Link each project to a local Git repository.
- Scan commits for a selected date range.
- Save commits to a local SQLite database.
- Add manual logs for meetings and non-code work.
- View weekly activity grouped by project and day.
- Generate a Markdown weekly report.
- Copy the report to clipboard.
- Save generated reports.

Recommended stack:

- Desktop: Tauri
- Frontend: React + TypeScript
- Styling: Tailwind CSS
- Database: SQLite
- Git integration: local Git commands
- Report format: Markdown

Core screens:

- Dashboard
- Projects
- Activity Timeline
- Manual Log
- Reports
- Settings

MVP excludes GitHub OAuth, calendar integrations, AI summaries, PDF export, team management, time tracking, screenshots, browser tracking, keystroke logging, and other invasive monitoring.

Success criteria:

The app is successful if it helps the developer produce a weekly report in less than five minutes. The report should be accurate, professional, easy to understand, grouped by project, clear for management, and editable before sending.
