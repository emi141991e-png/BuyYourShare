[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$targetDir = Join-Path $PSScriptRoot "..\tools\git"
$zipPath = Join-Path $PSScriptRoot "..\tools\mingit.zip"

if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
}

$url = "https://github.com/git-for-windows/git/releases/download/v2.46.0.windows.1/MinGit-2.46.0-64-bit.zip"
Write-Host "Downloading MinGit from $url..."
Invoke-WebRequest -Uri $url -OutFile $zipPath

Write-Host "Extracting MinGit to $targetDir..."
Expand-Archive -Path $zipPath -DestinationPath $targetDir -Force

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

$gitExe = Join-Path $targetDir "cmd\git.exe"
if (Test-Path $gitExe) {
    Write-Host "MinGit successfully installed!"
    & $gitExe --version
} else {
    Write-Error "MinGit executable not found at $gitExe"
}
