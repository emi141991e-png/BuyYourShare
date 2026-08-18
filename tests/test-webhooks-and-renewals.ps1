# Test Suite for Real Server Webhooks, Stripe Connect, Renewals & Accounting
$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   BUYYOURSHARE WEBHOOKS & RENEWALS TEST SUITE    " -ForegroundColor Cyan
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

# 1. Login Membro & Admin
$memLogin = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method Post -Body (@{ email = "elena.conti@example.com"; password = "Password123!" } | ConvertTo-Json) -ContentType "application/json"
$memToken = $memLogin.token
$memHeaders = @{ "Authorization" = "Bearer $memToken" }

$adminLogin = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method Post -Body (@{ email = "admin@buyyourshare.com"; password = "Password123!" } | ConvertTo-Json) -ContentType "application/json"
$adminHeaders = @{ "Authorization" = "Bearer $($adminLogin.token)" }

# 2. Primo Acquisto Membro via Stripe
$stripeTxId = "pi_test_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$sessionData = @{
    groupId = "grp-1042"
    slotNumber = 3
    baseShareCents = 350
    platformFeeCents = 149
    totalAmountCents = 499
    memberId = $memLogin.user.id
    memberEmail = $memLogin.user.email
    memberName = $memLogin.user.fullName
    ownerId = "usr-owner-1"
}

$payResp = Invoke-RestMethod -Uri "http://localhost:3000/api/checkout/stripe/process" -Method Post -Body (@{ sessionData = $sessionData; testScenario = "success" } | ConvertTo-Json -Depth 5) -Headers $memHeaders -ContentType "application/json"
Assert-Condition "Primo Pagamento Membro Carta riuscito (4,99 € = 3,50 € + 1,49 €)" ($payResp.success -eq $true)

$initialMemId = $payResp.membershipId
$myMems = Invoke-RestMethod -Uri "http://localhost:3000/api/memberships/my" -Headers $memHeaders
$targetMem = $myMems.memberships | Where-Object { $_.id -eq $initialMemId }
Assert-Condition "Membership creata con stato ACTIVE per Posto #3" ($targetMem.status -eq "ACTIVE")

# 3. Test Webhook Stripe Reale: Rinnovo Mensile (Ciclo 2)
$renewInvoiceId = "in_renew_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$stripeWebhookEvent = @{
    id = "evt_renew_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    type = "invoice.payment_succeeded"
    data = @{
        object = @{
            id = $renewInvoiceId
            subscription = $targetMem.stripeSubscriptionId
            payment_intent = "pi_renew_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            status = "paid"
            amount_paid = 499
            currency = "eur"
            metadata = @{
                groupId = "grp-1042"
                memberId = $memLogin.user.id
                slotNumber = 3
                baseShareCents = 350
                cycleNumber = 2
            }
        }
    }
} | ConvertTo-Json -Depth 10

$webhookResp = Invoke-RestMethod -Uri "http://localhost:3000/api/webhooks/stripe" -Method Post -Body $stripeWebhookEvent -ContentType "application/json"
Assert-Condition "Webhook Stripe POST /api/webhooks/stripe elaborato con successo (received: true)" ($webhookResp.received -eq $true)

# 4. Verifica nel Ledger Contabile per il Ciclo 2
$ledgerResp = Invoke-RestMethod -Uri "http://localhost:3000/api/ledger/admin" -Headers $adminHeaders
$renewLog = $ledgerResp.logs | Where-Object { $_.invoiceId -eq $renewInvoiceId }
Assert-Condition "Ledger registra Ciclo 2 con Quota Capogruppo esatta (3,50 €)" ($renewLog.baseShareCents -eq 350)
Assert-Condition "Ledger applica Fee BuyYourShare fissa di 1,49 € anche al Ciclo 2" ($renewLog.buyyourshareFeeCents -eq 149)
Assert-Condition "Ledger registra separatamente il costo gateway (36 centesimi)" ($renewLog.paymentProviderFeeCents -eq 36)
Assert-Condition "Ledger calcola Ricavo Netto BYS esatto (113 centesimi = 1,13 €)" ($renewLog.netPlatformAmountCents -eq 113)
Assert-Condition "Regola Zero-Trust: Payout confermato con transferId reale" ($null -ne $renewLog.transferId -and $renewLog.payoutStatus -eq "PAID")

# 5. Test Webhook Stripe: Fallimento Rinnovo (invoice.payment_failed)
$failWebhookEvent = @{
    id = "evt_fail_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    type = "invoice.payment_failed"
    data = @{
        object = @{
            id = "in_fail_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            subscription = $targetMem.stripeSubscriptionId
        }
    }
} | ConvertTo-Json -Depth 10

$failResp = Invoke-RestMethod -Uri "http://localhost:3000/api/webhooks/stripe" -Method Post -Body $failWebhookEvent -ContentType "application/json"
Assert-Condition "Webhook Stripe di fallimento elaborato" ($failResp.received -eq $true)

$updatedMems = Invoke-RestMethod -Uri "http://localhost:3000/api/memberships/my" -Headers $memHeaders
$failedMem = $updatedMems.memberships | Where-Object { $_.id -eq $initialMemId }
Assert-Condition "Membership marcata come PAST_DUE a seguito di pagamento fallito" ($failedMem.status -eq "PAST_DUE")

# 6. Test Webhook PayPal Reale: Rinnovo Mensile (PAYMENT.SALE.COMPLETED)
$ppSaleId = "SALE_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$ppWebhookEvent = @{
    id = "WH-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    event_type = "PAYMENT.SALE.COMPLETED"
    resource = @{
        id = $ppSaleId
        billing_agreement_id = "2GG8509311090124K" # capture iniziale test
        amount = @{
            total = "4.99"
            currency = "EUR"
        }
    }
} | ConvertTo-Json -Depth 10

$ppWebResp = Invoke-RestMethod -Uri "http://localhost:3000/api/webhooks/paypal" -Method Post -Body $ppWebhookEvent -ContentType "application/json"
Assert-Condition "Webhook PayPal POST /api/webhooks/paypal elaborato con successo" ($ppWebResp.received -eq $true)

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  RISULTATO: $passed PASSATI, $failed FALLITI ($([Math]::Round($passed / ($passed + $failed) * 100))% PASS)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

if ($failed -gt 0) { exit 1 } else { exit 0 }
