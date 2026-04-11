$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$healthUrl = "http://127.0.0.1:3217/api/health"
$appUrl = "http://127.0.0.1:3217"

function Test-AppReady {
  param(
    [string]$Url
  )

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

if (-not (Test-AppReady -Url $healthUrl)) {
  Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location -LiteralPath '$projectRoot'; npm run start"
  ) -WindowStyle Normal

  for ($index = 0; $index -lt 60; $index += 1) {
    Start-Sleep -Seconds 1

    if (Test-AppReady -Url $healthUrl) {
      break
    }
  }
}

Start-Process $appUrl
