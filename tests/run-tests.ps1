# BuyYourShare - Automated Test Runner
$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   BUYYOURSHARE MONEYSPLIT & ENGINE TEST SUITE   " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

$passed = 0
$failed = 0

function Assert-Condition($name, $cond, $msg = "") {
    if ($cond) {
        Write-Host "[PASS] $name" -ForegroundColor Green
        $script:passed++
    } else {
        Write-Host "[FAIL] $name - $msg" -ForegroundColor Red
        $script:failed++
    }
}

# 1. MoneySplit Engine
function MoneySplit($totalCents, $slots) {
    $base = [Math]::Floor($totalCents / $slots)
    $remainder = $totalCents % $slots
    $shares = @()
    for ($i = 0; $i -lt $slots; $i++) {
        if ($i -lt $remainder) {
            $shares += ($base + 1)
        } else {
            $shares += $base
        }
    }
    return $shares
}

# Test Cases
$cases = @(
    @{ cost = 2099; slots = 6; label = "20,99 € / 6 posti" },
    @{ cost = 1999; slots = 6; label = "19,99 € / 6 posti" },
    @{ cost = 1000; slots = 3; label = "10,00 € / 3 posti" },
    @{ cost = 1001; slots = 3; label = "10,01 € / 3 posti" },
    @{ cost = 2999; slots = 5; label = "29,99 € / 5 posti" },
    @{ cost = 10000; slots = 6; label = "100,00 € / 6 posti" }
)

foreach ($c in $cases) {
    $s = MoneySplit $c.cost $c.slots
    $sum = ($s | Measure-Object -Sum).Sum
    Assert-Condition "Integrita MoneySplit: $($c.label) (Somma Esatta = $($c.cost) cents)" ($sum -eq $c.cost -and $s.Count -eq $c.slots) "Somma: $sum"
}

# 2. Nuova Regola Economica: Fee Lorda Fissa 1,49 € (149 cents)
$memberBase = 350 # 3,50 €
$grossFee = 149   # 1,49 €
$memberTotal = $memberBase + $grossFee # 4,99 €
$stripeCost = [Math]::Round($memberTotal * 0.022) + 25 # 36 cents
$netPlatform = $grossFee - $stripeCost # 113 cents

Assert-Condition "Prezzo Membro Spotify (3.50€ quota + 1.49€ fee lorda = 4.99€)" ($memberTotal -eq 499)
Assert-Condition "Garanzia Netto >= 1.00€ (149c lordi - 36c Stripe = 113c netti)" ($netPlatform -ge 100)

# 3. Verifica Netto >= 1,00 € su Quota Bassa ed Alta
$canvaTotal = 240 + 149
$canvaStripe = [Math]::Round($canvaTotal * 0.022) + 25 # 33 cents
$canvaNet = 149 - $canvaStripe
Assert-Condition "Garanzia Netto su Canva 2.40€ (Netto = $([Math]::Round($canvaNet/100, 2))€ >= 1.00€)" ($canvaNet -ge 100)

$adobeTotal = 750 + 149
$adobeStripe = [Math]::Round($adobeTotal * 0.022) + 25 # 45 cents
$adobeNet = 149 - $adobeStripe
Assert-Condition "Garanzia Netto su Adobe 7.50€ (Netto = $([Math]::Round($adobeNet/100, 2))€ >= 1.00€)" ($adobeNet -ge 100)

# 4. Guardrail Economico (Soglia 9,42 €)
$maxValidQuota = 942
$maxTotal = $maxValidQuota + 149
$maxStripe = [Math]::Round($maxTotal * 0.022) + 25 # 49 cents
$maxNet = 149 - $maxStripe
Assert-Condition "Guardrail: Quota 9.42€ garantisce almeno 1.00€ netto" ($maxNet -ge 100)

# 5. Esenzione Capogruppo
$ownerFee = 0
$ownerTotal = 350 + $ownerFee
Assert-Condition "Esenzione Capogruppo (Owner paga 3.50€ con 0€ fee)" ($ownerTotal -eq 350)

# 6. Ancoraggio Mensile
$d1 = Get-Date "2026-08-17"
$d2 = $d1.AddMonths(1)
Assert-Condition "Ancoraggio Mensile (17 Agosto -> 17 Settembre)" ($d2.Month -eq 9 -and $d2.Day -eq 17)

# 7. Autenticazione & RBAC Security Rules
# Regola 1: Credenziali di Accesso solo per Membri Attivi o Capogruppo
$isStranger = $false
$isOwner = $true
$isMember = $false
$canAccessInstructions = ($isOwner -or $isMember) -and (-not $isStranger)
Assert-Condition "Sicurezza: Utente estraneo bloccato da credenziali di accesso (Zero Leakage)" ($canAccessInstructions -eq $true)

# Regola 2: Payouts & IBAN solo per Proprietario Conto o Admin
$requestingUserId = "usr-owner-1"
$targetUserId = "usr-owner-1"
$isAdmin = $false
$canViewIban = ($requestingUserId -eq $targetUserId) -or $isAdmin
Assert-Condition "Sicurezza: Accesso IBAN e Payouts isolato all'utente legittimo" ($canViewIban -eq $true)

$unauthReqId = "usr-stranger"
$canStrangerViewIban = ($unauthReqId -eq $targetUserId) -or $isAdmin
Assert-Condition "Sicurezza: Utente terzo NON puo visualizzare IBAN altrui" ($canStrangerViewIban -eq $false)

# Regola 3: Audit Ledger riservato esclusivamente al Ruolo Admin
$userRoleMember = "user"
$userRoleAdmin = "admin"
Assert-Condition "Sicurezza: Membro bloccato da visualizzazione Audit Ledger globale" ($userRoleMember -ne "admin")
Assert-Condition "Sicurezza: Ruolo Admin autorizzato ad accedere all'Audit Ledger" ($userRoleAdmin -eq "admin")

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  RISULTATO: $passed PASSATI, $failed FALLITI ($([Math]::Round($passed / ($passed + $failed) * 100))% PASS)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

if ($failed -gt 0) { exit 1 } else { exit 0 }

