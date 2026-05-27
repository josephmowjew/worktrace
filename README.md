# WorkTrace

WorkTrace is a local-first desktop app for developers who want to turn day-to-day work into clear weekly updates. It scans local Git repositories, combines commits with manual notes, focus sessions, daily plans, calendar context, and imported task data, then helps generate professional status reports without sending your work history to a hosted service.

Developed by Joseph Mojoo. GitHub profile: https://github.com/josephmowjew
Repository: https://github.com/josephmowjew/worktrace

The app is built with Tauri 2, React 19, TypeScript, Tailwind CSS 4, and a Rust backend backed by SQLite.

## What It Does

- Tracks projects and workspaces, including local repository paths, branch focus, refs, and worktrees.
- Syncs commits from local Git history into a private SQLite database.
- Captures non-code work with manual logs, focus sessions, daily plans, and weekly tasks.
- Shows dashboards, activity timelines, heatmaps, project breakdowns, and weekly summaries.
- Generates and saves weekly reports from commits, tasks, notes, and manual activity.
- Supports optional report polishing through configured AI providers.
- Supports optional GitHub PAT integration for connection checks and pull request creation.
- Supports optional Sparc Force import and native WorkTrace task linking.
- Provides settings import/export and backup-location validation.
- Includes a floating always-on-top todo widget at `/widget`.

## Tech Stack

- **Desktop shell:** Tauri 2
- **Frontend:** React 19, React Router 7, TanStack Query 5, TypeScript, Tailwind CSS 4
- **Backend:** Rust, Tauri commands, SQLx, SQLite
- **Native integrations:** local filesystem, local Git commands, OS keyring, native dialogs
- **Build tooling:** Vite 7, Tauri CLI, PowerShell helper scripts for Windows build environments

## Project Layout

```text
.
├── src/                       React application
│   ├── app/                   App providers and route shell
│   ├── components/            Layout, UI, timeline, and widget components
│   ├── lib/api/               Typed Tauri command clients
│   ├── pages/                 Route-level screens
│   ├── styles/                Global Tailwind CSS
│   └── types/                 Frontend domain/API types
├── src-tauri/                 Tauri/Rust backend
│   ├── src/application/       Use-case and integration logic
│   ├── src/domain/            Rust domain models
│   ├── src/infrastructure/    SQLite, filesystem, and Git infrastructure
│   ├── src/interface/         Tauri command handlers and DTOs
│   ├── capabilities/          Tauri capability manifests
│   └── resources/             Bundled AI and voice resource folders
├── Guide/                     Product and implementation planning docs
├── scripts/                   Windows Tauri dev/build wrappers
└── public/                    Static frontend assets
```

## Requirements

- Node.js and npm
- Rust toolchain
- Tauri 2 prerequisites for your OS
- Git available on `PATH`
- On Windows, Visual Studio Build Tools with `vcvars64.bat`

The included PowerShell scripts currently expect Windows Build Tools at:

```text
C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat
```

Adjust `scripts/tauri-dev.ps1` and `scripts/tauri-build.ps1` if your Visual Studio Build Tools path differs.

## Getting Started

Install dependencies:

```powershell
npm install
```

Run the frontend only:

```powershell
npm run dev
```

The browser-only Vite app is useful for layout work, but data commands require the Tauri runtime. Features backed by SQLite, Git sync, native dialogs, and keyring access only work in the desktop app.

Run the desktop app:

```powershell
npm run tauri:dev
```

Build the frontend:

```powershell
npm run build
```

Build the desktop app:

```powershell
npm run tauri:build
```

## Development Workflow

1. Start with `npm run tauri:dev` when working on real app behavior.
2. Use `npm run dev` for quick frontend-only styling or routing checks.
3. Keep frontend command calls in `src/lib/api/*` and backend implementations in matching `src-tauri/src/interface/commands/*` modules.
4. Put cross-command business logic in `src-tauri/src/application/*`.
5. Put persistence code in `src-tauri/src/infrastructure/database/repositories.rs`.
6. Update TypeScript types in `src/types/*` when Rust DTOs or command payloads change.

## Verification

Run TypeScript and Vite build checks:

```powershell
npm run build
```

Run Rust tests:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

For changes that touch native behavior, also smoke test through:

```powershell
npm run tauri:dev
```

## Data And Privacy

WorkTrace is designed as a local-first app. The main application database is created in the platform app data directory as `worktrace.sqlite`. Sensitive integration tokens are stored through the OS keyring where supported.

The app can connect to external services only when a user configures those integrations, such as GitHub, calendar sources, or an AI report provider. Local Git scanning reads repositories from paths the user adds or imports.

## Main Screens

- **Today:** command center for daily plan, tasks, focus, nudges, and upcoming work.
- **Dashboard:** high-level activity, project, and weekly progress views.
- **Projects:** tracked repositories, project metadata, Git focus, and project details.
- **Activity Timeline:** commit and manual-log activity grouped by date.
- **Backup:** settings and export/import support.
- **Manual Log:** meetings, support work, and other non-code activity.
- **Weekly Plan:** weekly tasks and progress tracking.
- **Reports:** report generation, saved reports, daily review notes, and optional AI polish.
- **Guide:** in-app guide content.
- **Settings:** sync, backup, integrations, preferences, and provider configuration.

## Notes For Contributors

- This repository may contain local generated files such as logs, settings exports, and build output. Keep commits focused and avoid sweeping unrelated cleanup.
- The Tauri command client intentionally fails outside the desktop runtime with `TAURI_RUNTIME_UNAVAILABLE`; this is expected in browser-only mode.
- Preserve the local-first privacy posture when adding integrations. Make network calls explicit, user-configured, and easy to disconnect.
