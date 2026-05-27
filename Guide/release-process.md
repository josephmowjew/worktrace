# WorkTrace Release Process

## Version sync
Update all three files together before each release:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

## Required environment

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `TAURI_UPDATER_PUBLIC_KEY`

## Release artifacts contract

Each release must include:

- Bundled installer artifacts from `tauri build`
- `latest.json` updater metadata
- Release notes body (copied from `CHANGELOG.md`)

## Recommended publish flow

1. Bump semantic version in all three version files.
2. Add release notes in `CHANGELOG.md` using `## [x.y.z] - YYYY-MM-DD`.
3. Run:
   - `npm run build`
   - `cargo test --manifest-path src-tauri/Cargo.toml`
4. Build release:
   - `npm run tauri:build`
5. Publish GitHub release and attach artifacts, including `latest.json`.
