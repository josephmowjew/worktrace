$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
& "$repoRoot\scripts\tauri.ps1" dev
