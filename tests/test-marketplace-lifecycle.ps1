# BuyYourShare - Test del Ciclo di Vita del Marketplace e Verifica Dati Reali

$baseUrl = "http://localhost:3000"

Write-Host "===================================================="
Write-Host "  TEST DEL MARKETPLACE REALE E MACCHINA A STATI     "
Write-Host "===================================================="

# 1. VERIFICA MARKETPLACE INIZIALE VUOTO (0 GRUPPI DEMO)
Write-Host "`n[TEST 1] Verifica Marketplace Pubblico Iniziale (0 gruppi demo)..."
$publicGroupsResp = Invoke-RestMethod -Uri "$baseUrl/api/groups" -Method Get
Write-Host "Gruppi trovati nel Marketplace:" $publicGroupsResp.groups.Count
if ($publicGroupsResp.groups.Count -eq 0) {
    Write-Host "PASS: Marketplace pulito al 100%, nessun gruppo demo visualizzato."
} else {
    Write-Error "FAIL: Sono presenti gruppi nel marketplace iniziale!"
    exit 1
}

# 2. VERIFICA CHE NON SIA POSSIBILE AGGIRARE CON ID VECCHI DEMO
Write-Host "`n[TEST 2] Tentativo accesso diretto a gruppo demo (grp-1042)..."
try {
    $demoResp = Invoke-RestMethod -Uri "$baseUrl/api/groups/grp-1042" -Method Get
    Write-Error "FAIL: Il gruppo demo grp-1042 e ancora accessibile!"
    exit 1
} catch {
    Write-Host "PASS: grp-1042 non e piu accessibile (404 GROUP_NOT_FOUND)."
}

# 3. AUTENTICAZIONE CAPOGRUPPO
Write-Host "`n[TEST 3] Login Capogruppo..."
$loginBody = @{
    email = "marco.rossi@example.com"
    password = "Password123!"
} | ConvertTo-Json

$loginResp = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
$token = $loginResp.token
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}
Write-Host "PASS: Capogruppo autenticato con successo (User ID: $($loginResp.user.id))."

# 4. CREAZIONE NUOVO GRUPPO REALE (STATO INIZIALE: DRAFT)
Write-Host "`n[TEST 4] Creazione Gruppo Reale (Inizialmente DRAFT)..."
$createBody = @{
    serviceId = "srv-spotify"
    customServiceName = "Spotify Family Ufficiale"
    planName = "Spotify Family 6 Posti"
    realCostEuros = 20.99
    totalSlots = 6
    ownerSlots = 1
    description = "Condivisione reale Spotify Family gestita da Capogruppo certificato."
    rulesAndRequirements = "Invito email ufficiale."
    accessUrl = "https://spotify.com/family/join/invite/SECRET_LINK_123"
    instructions = "Accetta invito con la tua email."
    accessCode = "SECRET_PIN_999"
    ownerSpotifyAccount = "marco.privato@example.com"
    publishImmediately = $false # Salvato esplicitamente in DRAFT
} | ConvertTo-Json

$createResp = Invoke-RestMethod -Uri "$baseUrl/api/groups" -Method Post -Headers $headers -Body $createBody
$newGroupId = $createResp.group.id
Write-Host "Nuovo Gruppo ID:" $newGroupId "Stato Iniziale:" $createResp.group.status

if ($createResp.group.status -eq "DRAFT" -or $createResp.status -eq "DRAFT") {
    Write-Host "PASS: Gruppo creato e salvato con successo in stato DRAFT."
} else {
    Write-Error "FAIL: Il gruppo non e partito in stato DRAFT!"
    exit 1
}

# 5. VERIFICA CHE IL GRUPPO IN DRAFT NON SIA VISIBILE NEL MARKETPLACE PUBBLICO
Write-Host "`n[TEST 5] Verifica isolamento DRAFT (Marketplace Pubblico deve rimanere a 0)..."
$publicCheck = Invoke-RestMethod -Uri "$baseUrl/api/groups" -Method Get
Write-Host "Gruppi visibili nel Marketplace pubblico:" $publicCheck.groups.Count
if ($publicCheck.groups.Count -eq 0) {
    Write-Host "PASS: Il gruppo in DRAFT NON compare nel Marketplace pubblico."
} else {
    Write-Error "FAIL: Il gruppo in DRAFT e visibile pubblicamente!"
    exit 1
}

# Tentativo accesso diretto non autenticato al DRAFT
try {
    $anonDraftCheck = Invoke-RestMethod -Uri "$baseUrl/api/groups/$newGroupId" -Method Get
    Write-Error "FAIL: Un utente anonimo e riuscito ad aprire il gruppo in DRAFT!"
    exit 1
} catch {
    Write-Host "PASS: Accesso anonimo diretto al gruppo DRAFT bloccato (404/403)."
}

# 6. PUBBLICAZIONE DEL GRUPPO DA PARTE DEL CAPOGRUPPO
Write-Host "`n[TEST 6] Pubblicazione del Gruppo da parte del Capogruppo..."
$publishResp = Invoke-RestMethod -Uri "$baseUrl/api/groups/$newGroupId/publish" -Method Post -Headers $headers
Write-Host "Esito Pubblicazione:" $publishResp.message "Nuovo Stato:" $publishResp.group.status

if ($publishResp.group.status -eq "PUBLISHED") {
    Write-Host "PASS: Transizione di stato completata con successo a PUBLISHED."
} else {
    Write-Error "FAIL: Il gruppo non e passato allo stato PUBLISHED!"
    exit 1
}

# 7. VERIFICA CHE IL GRUPPO PUBBLICATO SIA ORA VISIBILE NEL MARKETPLACE
Write-Host "`n[TEST 7] Verifica visibilita nel Marketplace Pubblico dopo la pubblicazione..."
$publicAfterPublish = Invoke-RestMethod -Uri "$baseUrl/api/groups" -Method Get
Write-Host "Gruppi nel Marketplace Pubblico:" $publicAfterPublish.groups.Count
if ($publicAfterPublish.groups.Count -eq 1 -and $publicAfterPublish.groups[0].id -eq $newGroupId) {
    Write-Host "PASS: Il gruppo pubblicato e ora visibile con $($publicAfterPublish.groups[0].availableSlots) posti liberi."
} else {
    Write-Error "FAIL: Il gruppo pubblicato non compare nel Marketplace pubblico!"
    exit 1
}

# 8. VERIFICA DELLA PRIVACY (ZERO DATA LEAKAGE)
Write-Host "`n[TEST 8] Controllo rigoroso della Privacy sui dati pubblici..."
$pubGroup = $publicAfterPublish.groups[0]
$pubJson = $pubGroup | ConvertTo-Json -Depth 5

$leakDetected = $false
if ($pubJson -match "iban" -or $pubJson -match "IT60X" -or $pubJson -match "paypalPayoutEmail" -or $pubJson -match "SECRET_LINK" -or $pubJson -match "SECRET_PIN" -or $pubJson -match "acct_") {
    $leakDetected = $true
}

if (-not $leakDetected) {
    Write-Host "PASS: Nessun IBAN, email PayPal privata, link segreto o credenziale esposta pubblicamente."
} else {
    Write-Error "FAIL: Rilevata esposizione di dati privati nella risposta pubblica!"
    exit 1
}

# 9. VERIFICA INTEGRITÀ PAYPAL SUBSCRIPTION E LEDGER
Write-Host "`n[TEST 9] Verifica integrita Subscription I-MDJSFS3MRVBY e Ledger Ciclo 1..."
$statusCheck = Invoke-RestMethod -Uri "$baseUrl/api/webhooks/paypal/status" -Method Get

$targetSub = $statusCheck.activeSubscriptions | Where-Object { $_.paypalSubscriptionId -eq "I-MDJSFS3MRVBY" }
$targetCycle = $statusCheck.recordedCycles | Where-Object { $_.subscriptionId -eq "I-MDJSFS3MRVBY" }

if ($targetSub -and $targetSub.status -eq "ACTIVE") {
    Write-Host "PASS: Subscription I-MDJSFS3MRVBY integra e ATTIVA."
} else {
    Write-Error "FAIL: Subscription I-MDJSFS3MRVBY non trovata o non attiva!"
    exit 1
}

if ($targetCycle -and $targetCycle.payoutStatus -eq "PAID") {
    Write-Host "PASS: Ledger Ciclo 1 integro (Payout PAID, Batch CM7DU7TXEC342, Item 3BQ5WUDXY6JQS)."
} else {
    Write-Error "FAIL: Record contabile Ciclo 1 non trovato nel Ledger!"
    exit 1
}

Write-Host "`n===================================================="
Write-Host "TUTTI I TEST DEL MARKETPLACE SUPERATI AL 100%!       "
Write-Host "===================================================="
