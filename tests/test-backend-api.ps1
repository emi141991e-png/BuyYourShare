# Test Suite for Real Node.js Backend REST APIs
$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   BUYYOURSHARE REAL BACKEND API TEST SUITE       " -ForegroundColor Cyan
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

# 1. Health Check
$health = Invoke-RestMethod -Uri "http://localhost:3000/api/health"
Assert-Condition "Health Check status == HEALTHY" ($health.status -eq "HEALTHY")

# 2. Public Groups (Sanitized)
$groupsResp = Invoke-RestMethod -Uri "http://localhost:3000/api/groups"
Assert-Condition "Catalogo Gruppi restituisce 3 gruppi" ($groupsResp.groups.Count -eq 3)
Assert-Condition "Dati sensibili Capogruppo rimossi dal catalogo pubblico" ($null -eq $groupsResp.groups[0].owner.iban)

# 3. Registrazione Nuovo Utente
$regEmail = "test.user." + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + "@example.com"
$regBody = @{
    firstName = "Mario"
    lastName = "Rossi"
    email = $regEmail
    password = "Password123!"
    confirmPassword = "Password123!"
    termsConsent = $true
    privacyConsent = $true
} | ConvertTo-Json

$regResp = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/register" -Method Post -Body $regBody -ContentType "application/json"
Assert-Condition "Registrazione Utente crea sessione e utente valido" ($regResp.success -and $null -ne $regResp.token -and $regResp.user.fullName -eq "Mario Rossi")

# 4. Login Capogruppo
$loginBody = @{
    email = "marco.rossi@example.com"
    password = "Password123!"
} | ConvertTo-Json

$loginResp = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
$ownerToken = $loginResp.token
Assert-Condition "Login Capogruppo restituisce token di sessione" ($null -ne $ownerToken -and $loginResp.user.id -eq "usr-owner-1")

# 5. Protected Route: /api/auth/me
$headers = @{ "Authorization" = "Bearer $ownerToken" }
$meResp = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/me" -Headers $headers
Assert-Condition "GET /api/auth/me restituisce profilo utente autenticato" ($meResp.user.email -eq "marco.rossi@example.com")

# 6. Protected Route: /api/access/:groupId (Autorizzato per Owner)
$accessResp = Invoke-RestMethod -Uri "http://localhost:3000/api/access/grp-1042" -Headers $headers
Assert-Condition "GET /api/access/grp-1042 sblocca credenziali per il Capogruppo" ($null -ne $accessResp.instructions.accessCode)

# 7. Zero Data Leakage: Utente estraneo bloccato da /api/access/:groupId
$strangerHeaders = @{ "Authorization" = "Bearer $($regResp.token)" }
try {
    Invoke-RestMethod -Uri "http://localhost:3000/api/access/grp-1042" -Headers $strangerHeaders
    Assert-Condition "Utente estraneo bloccato da credenziali private" $false "Doveva restituire 403"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Assert-Condition "Utente estraneo bloccato da credenziali private (HTTP $statusCode)" ($statusCode -eq 403)
}

# 8. RBAC Admin Ledger: Utente normale bloccato (403)
try {
    Invoke-RestMethod -Uri "http://localhost:3000/api/ledger/admin" -Headers $strangerHeaders
    Assert-Condition "Utente normale bloccato da Audit Ledger Admin" $false "Doveva restituire 403"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Assert-Condition "Utente normale bloccato da Audit Ledger Admin (HTTP $statusCode)" ($statusCode -eq 403)
}

# 9. RBAC Admin Ledger: Admin autorizzato
$adminLoginBody = @{ email = "admin@buyyourshare.com"; password = "Password123!" } | ConvertTo-Json
$adminLogin = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method Post -Body $adminLoginBody -ContentType "application/json"
$adminHeaders = @{ "Authorization" = "Bearer $($adminLogin.token)" }
$adminLedger = Invoke-RestMethod -Uri "http://localhost:3000/api/ledger/admin" -Headers $adminHeaders
Assert-Condition "Admin autorizzato ad accedere all'Audit Ledger completo" ($null -ne $adminLedger.summary)

# 10. Test Flusso Cattura Pagamento PayPal Sandbox Server-Side
$testCaptureId = "2GG" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$testOrderId = "ORD-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$captureBody = @{
    orderId = $testOrderId
    captureId = $testCaptureId
    sessionData = @{
        groupId = "grp-1042"
        slotNumber = 2
        baseShareCents = 350
        platformFeeCents = 149
        totalAmountCents = 499
    }
} | ConvertTo-Json -Depth 10

$captureResp = Invoke-RestMethod -Uri "http://localhost:3000/api/checkout/paypal/capture" -Method Post -Body $captureBody -Headers $strangerHeaders -ContentType "application/json"
Assert-Condition "Cattura PayPal Server-Side attiva Membership e registra nel Ledger" ($captureResp.success -and $captureResp.transactionId -eq $testCaptureId)

# 11. Test Idempotenza Cattura PayPal (chiamata ripetuta con stesso capture ID)
$dupCaptureResp = Invoke-RestMethod -Uri "http://localhost:3000/api/checkout/paypal/capture" -Method Post -Body $captureBody -Headers $strangerHeaders -ContentType "application/json"
Assert-Condition "Idempotenza: Transazione duplicata gestita correttamente (ALREADY_PROCESSED)" ($dupCaptureResp.status -eq "ALREADY_PROCESSED")

# 12. Verifica Sblocco Credenziali post-pagamento per il nuovo membro
$memberAccessResp = Invoke-RestMethod -Uri "http://localhost:3000/api/access/grp-1042" -Headers $strangerHeaders
Assert-Condition "Membro pagante accede ora alle credenziali protette di Spotify" ($null -ne $memberAccessResp.instructions.accessCode)

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  RISULTATO: $passed PASSATI, $failed FALLITI ($([Math]::Round($passed / ($passed + $failed) * 100))% PASS)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

if ($failed -gt 0) { exit 1 } else { exit 0 }
