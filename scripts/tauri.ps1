$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$tauriArgs = $args

$vcEnvCandidates = @(
  "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat",
  "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\Common7\Tools\VsDevCmd.bat",
  "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat",
  "C:\Program Files\Microsoft Visual Studio\18\Community\Common7\Tools\VsDevCmd.bat",
  "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat",
  "C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat",
  "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat",
  "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
)

$vcEnv = $vcEnvCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $vcEnv) {
  throw "Visual Studio developer command prompt was not found. Install Visual Studio Build Tools with Desktop development with C++."
}

$msvcHeader = Get-ChildItem @(
  "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Tools\MSVC",
  "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Tools\MSVC",
  "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC",
  "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC"
) -Recurse -Filter excpt.h -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $msvcHeader) {
  throw "MSVC C++ headers are missing. Install or repair the Visual Studio component 'MSVC x64/x86 build tools'. Missing header: excpt.h"
}

$ucrtHeader = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\Include" -Recurse -Filter corecrt.h -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $ucrtHeader) {
  throw "Windows SDK UCRT headers are missing. Install or repair the Windows 10/11 SDK or the Visual Studio component 'Windows Universal CRT SDK'. Missing header: corecrt.h"
}

$escapedArgs = ($tauriArgs | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }) -join " "
if ((Split-Path -Leaf $vcEnv) -ieq "VsDevCmd.bat") {
  cmd.exe /d /s /c "call `"$vcEnv`" -arch=x64 -host_arch=x64 && cd /d `"$repoRoot`" && npx.cmd tauri $escapedArgs"
} else {
  cmd.exe /d /s /c "call `"$vcEnv`" && cd /d `"$repoRoot`" && npx.cmd tauri $escapedArgs"
}
