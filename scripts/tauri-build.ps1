$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$vcvars = "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat"

if (-not (Test-Path $vcvars)) {
  throw "Visual Studio Build Tools vcvars64.bat was not found at: $vcvars"
}

cmd.exe /d /s /c "call `"$vcvars`" && cd /d `"$repoRoot`" && npm.cmd run tauri build"
