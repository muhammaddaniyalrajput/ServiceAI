<#
.SYNOPSIS
  Deploy the KaamEasy AI backend to DigitalOcean App Platform via the REST API.

.DESCRIPTION
  Posts a full app spec to https://api.digitalocean.com/v2/apps.

  Reads:
    - $env:DO_API_TOKEN     DigitalOcean Personal Access Token
    - GitHub repo path       hard-coded below (muhammaddaniyalrajput/kaameasy-backend)
    - Firebase credentials   $env:TEMP\firebase-admin.min.json
    - Gemini + Maps API keys read from the local .env

  Writes the created app ID + URL to standard output.
#>

$ErrorActionPreference = 'Stop'

if (-not $env:DO_API_TOKEN) {
    Write-Host ""
    Write-Host "ERROR: Set your DigitalOcean API token first:" -ForegroundColor Red
    Write-Host '  $env:DO_API_TOKEN = "dop_v1_your_token_here"' -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Get a token at: https://cloud.digitalocean.com/account/api/tokens"
    exit 1
}

# Load non-secret env vars from the local .env
$envFile = "D:\ServiceAI\backend\.env"
if (Test-Path -LiteralPath $envFile) {
    Get-Content -LiteralPath $envFile | ForEach-Object {
        if ($_ -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$') {
            $name = $Matches[1]
            $val  = $Matches[2]
            # Skip empty / comment / known-secret keys — those are set explicitly below
            if ($val -and $name -notin @('FIREBASE_CREDENTIALS_JSON_PATH')) {
                Set-Item -Path "Env:$name" -Value $val
            }
        }
    }
}

if (-not $env:GEMINI_API_KEY) {
    Write-Host "ERROR: GEMINI_API_KEY not set (read from .env or pass it explicitly)" -ForegroundColor Red
    exit 1
}

# Load the Firebase admin JSON
$credPath = Join-Path $env:TEMP 'firebase-admin.min.json'
if (-not (Test-Path -LiteralPath $credPath)) {
    Write-Host "ERROR: $credPath not found. Re-run the prep step to regenerate it." -ForegroundColor Red
    exit 1
}
$firebaseCred = Get-Content -LiteralPath $credPath -Raw
# JSON-escape the credentials for embedding in a JSON string
$firebaseCredJson = $firebaseCred | ConvertTo-Json -Compress

# ── App Platform spec ────────────────────────────────────────────────────
$spec = @{
    spec = @{
        name   = "kaameasy-backend"
        region = "nyc"
        services = @(
            @{
                name             = "api"
                source_dir       = "/"
                build_command    = "pip install -r requirements.txt"
                run_command      = "uvicorn app.main:app --host 0.0.0.0 --port 8080"
                environment_slug = "python"
                instance_count   = 1
                instance_size_slug = "basic-xxs"
                http_port        = 8080
                health_check = @{
                    http_path              = "/health"
                    initial_delay_seconds = 10
                    period_seconds        = 30
                    timeout_seconds       = 5
                    success_threshold     = 1
                    failure_threshold     = 3
                }
                routes = @(
                    @{
                        path = "/"
                    }
                )
                # envs are defined at the app level (below) and shared with this service
            }
        )
        envs = @(
            @{ key = "APP_ENV";          scope = "RUN_TIME"; type = "GENERAL"; value = "production" }
            @{ key = "LOG_LEVEL";        scope = "RUN_TIME"; type = "GENERAL"; value = "INFO" }
            @{ key = "USE_MOCK_MAPS";    scope = "RUN_TIME"; type = "GENERAL"; value = "false" }
            @{ key = "CORS_ORIGINS";     scope = "RUN_TIME"; type = "GENERAL"; value = "https://expo.dev,http://localhost:8081,http://localhost:19006" }
            @{ key = "GEMINI_API_KEY";   scope = "RUN_TIME"; type = "SECRET";  value = $env:GEMINI_API_KEY }
            @{ key = "GOOGLE_MAPS_API_KEY"; scope = "RUN_TIME"; type = "SECRET"; value = $env:GOOGLE_MAPS_API_KEY }
            @{ key = "FIREBASE_CREDENTIALS_JSON"; scope = "RUN_TIME"; type = "SECRET"; value = $firebaseCred }
        )
        # Source: GitHub repo
        github = @{
            repo            = "muhammaddaniyalrajput/kaameasy-backend"
            branch          = "main"
            deploy_on_push  = $true
        }
    }
}

$body = $spec | ConvertTo-Json -Depth 20

Write-Host ""
Write-Host "=== POST https://api.digitalocean.com/v2/apps ===" -ForegroundColor Cyan
Write-Host "  Repo:           $($spec.spec.github.repo)@$($spec.spec.github.branch)"
Write-Host "  Build:          $($spec.spec.services[0].build_command)"
Write-Host "  Run:            $($spec.spec.services[0].run_command)"
Write-Host "  Instance:       $($spec.spec.services[0].instance_size_slug) (Starter \$5/mo)"
Write-Host "  Region:         $($spec.spec.region)"
Write-Host "  Env vars:       $($spec.spec.envs.Count) total"
Write-Host ""

try {
    $response = Invoke-RestMethod `
        -Method Post `
        -Uri 'https://api.digitalocean.com/v2/apps' `
        -Headers @{ Authorization = "Bearer $env:DO_API_TOKEN"; "Content-Type" = "application/json" } `
        -Body $body `
        -TimeoutSec 60

    Write-Host "✅ App created!" -ForegroundColor Green
    Write-Host "   ID:           $($response.app.id)"
    Write-Host "   Default URL:  $($response.app.default_ingress)"
    Write-Host "   Live URL:     $($response.app.live_url)"
    Write-Host ""
    Write-Host "The build takes ~3-5 min. The app will be live at:" -ForegroundColor Yellow
    Write-Host "  $($response.app.live_url)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Poll the deployment status with:"
    Write-Host "  curl -H `"Authorization: Bearer `$DO_API_TOKEN`" https://api.digitalocean.com/v2/apps/$($response.app.id)/deployments"
} catch {
    Write-Host ""
    Write-Host "❌ Deploy failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    }
    exit 1
}
