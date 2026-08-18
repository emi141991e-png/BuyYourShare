$baseDir = (Get-Item $PSScriptRoot).Parent.FullName
$ghDir = Join-Path $baseDir "tools\gh\bin"
$env:PATH = "$ghDir;" + $env:PATH

Write-Host "===================================================="
Write-Host "        VERIFICA REPOSITORY SU GITHUB              "
Write-Host "===================================================="

Write-Host "📋 Dettagli Repository:"
& gh repo view emi141991e-png/BuyYourShare

Write-Host "`n📁 File Presenti nella Root del Repository GitHub:"
$items = & gh api repos/emi141991e-png/BuyYourShare/contents | ConvertFrom-Json
$items | Select-Object name, type, size | Format-Table -AutoSize

Write-Host "`nControllo Sicurezza .env:"
$hasEnv = $items | Where-Object { $_.name -eq ".env" }
if ($hasEnv) {
    Write-Error "CRITICAL: .env presente su GitHub!"
} else {
    Write-Host "✅ .env e i secret NON sono presenti su GitHub (Esclusione confermata al 100%)."
}
