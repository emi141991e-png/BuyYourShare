# BuyYourShare Web Server & Webhook Receiver
param([int]$Port = 3000)

$prefix = "http://localhost:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
    Write-Host "====================================================" -ForegroundColor Green
    Write-Host "  BuyYourShare Web Server attivo su: $prefix" -ForegroundColor Cyan
    Write-Host "  Endpoint Webhook PayPal: $prefix" + "api/webhooks/paypal" -ForegroundColor Yellow
    Write-Host "  Endpoint Webhook Stripe: $prefix" + "api/webhooks/stripe" -ForegroundColor Yellow
    Write-Host "====================================================" -ForegroundColor Green

    $basePath = (Get-Location).Path

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $localPath = $request.Url.LocalPath
        $httpMethod = $request.HttpMethod

        # Gestione Webhook POST Server-Side
        if ($httpMethod -eq "POST" -and ($localPath -eq "/api/webhooks/paypal" -or $localPath -eq "/api/webhooks/stripe")) {
            $reader = New-Object System.IO.StreamReader($request.InputStream, $request.ContentEncoding)
            $body = $reader.ReadToEnd()
            $reader.Close()

            Write-Host "[WEBHOOK INCOMING] $httpMethod $localPath" -ForegroundColor Magenta
            
            $response.StatusCode = 200
            $response.ContentType = "application/json; charset=utf-8"
            $respBytes = [System.Text.Encoding]::UTF8.GetBytes('{"status":"received","timestamp":"' + (Get-Date).ToString("o") + '"}')
            $response.ContentLength64 = $respBytes.Length
            $response.OutputStream.Write($respBytes, 0, $respBytes.Length)
            $response.OutputStream.Close()
            continue
        }

        if ($localPath -eq "/" -or $localPath -eq "") {
            $localPath = "/index.html"
        }

        $filePath = Join-Path $basePath $localPath.TrimStart('/')

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".js"   { "application/javascript; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".json" { "application/json; charset=utf-8" }
                ".png"  { "image/png" }
                ".jpg"  { "image/jpeg" }
                ".svg"  { "image/svg+xml" }
                default { "application/octet-stream" }
            }

            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $localPath")
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }
        $response.OutputStream.Close()
    }
} catch {
    Write-Host "Server interrotto: $_" -ForegroundColor Red
} finally {
    $listener.Stop()
    $listener.Close()
}
