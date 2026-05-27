$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$candidates = @(
  "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat",
  "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat",
  "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat",
  "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat",
  "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
)

$vcvars = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $vcvars) {
  throw "Visual Studio Build Tools vcvars64.bat was not found in expected locations."
}

cmd.exe /d /s /c "call `"$vcvars`" && cd /d `"$repoRoot`" && cargo test --manifest-path src-tauri/Cargo.toml"
