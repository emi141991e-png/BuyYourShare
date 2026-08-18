$baseDir = (Get-Item $PSScriptRoot).Parent.FullName
$gitDir = Join-Path $baseDir "tools\git\cmd"
$ghDir = Join-Path $baseDir "tools\gh\bin"

$env:PATH = "$gitDir;$ghDir;" + $env:PATH

Write-Host "Setting up git credential helper with GitHub CLI..."
& gh auth setup-git

Write-Host "Pushing code to https://github.com/emi141991e-png/BuyYourShare.git..."
& git push -u origin main --force

Write-Host "Verifying remote commit..."
& git log -1 --oneline
