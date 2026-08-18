[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$targetDir = Join-Path $PSScriptRoot "..\tools\gh"
$zipPath = Join-Path $PSScriptRoot "..\tools\gh.zip"

if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
}

$url = "https://github.com/cli/cli/releases/download/v2.54.0/gh_2.54.0_windows_amd64.zip"
Write-Host "Downloading GitHub CLI from $url..."
Invoke-WebRequest -Uri $url -OutFile $zipPath

Write-Host "Extracting GitHub CLI..."
Expand-Archive -Path $zipPath -DestinationPath $targetDir -Force

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

$ghExe = Get-ChildItem -Path $targetDir -Filter "gh.exe" -Recurse | Select-Object -First 1
if ($ghExe) {
    Write-Host "GitHub CLI successfully installed at $($ghExe.FullName)!"
    & $ghExe.FullName --version
} else {
    Write-Error "gh.exe not found in $targetDir"
}
