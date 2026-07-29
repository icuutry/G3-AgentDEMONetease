$repoRoot = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($repoRoot)) {
    $repoRoot = (Get-Location).Path
}

$backendScript = Join-Path $repoRoot 'backend\run.ps1'
$frontendIndex = Join-Path $repoRoot 'frontend\index.html'
$backendDirectory = Join-Path $repoRoot 'backend'

if (-not (Test-Path -LiteralPath $backendScript -PathType Leaf)) {
    Write-Host "Required file not found: $backendScript" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -LiteralPath $frontendIndex -PathType Leaf)) {
    Write-Host "Required file not found: $frontendIndex" -ForegroundColor Red
    exit 1
}

function ConvertTo-SingleQuotedPowerShellString {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    return "'" + $Value.Replace("'", "''") + "'"
}

function ConvertTo-EncodedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command
    )

    return [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Command))
}

function Wait-ForHttpEndpoint {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri,

        [Parameter(Mandatory = $true)]
        [int]$TimeoutSeconds
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                return $true
            }
        }
        catch {
            # The server may still be starting.
        }

        Start-Sleep -Seconds 1
    }

    return $false
}

Write-Host 'Starting backend...'
$quotedBackendDirectory = ConvertTo-SingleQuotedPowerShellString $backendDirectory
$quotedBackendScript = ConvertTo-SingleQuotedPowerShellString $backendScript
$backendCommand = "Set-Location -LiteralPath $quotedBackendDirectory; & $quotedBackendScript"
$backendEncodedCommand = ConvertTo-EncodedCommand $backendCommand
Start-Process -FilePath 'powershell.exe' -ArgumentList @(
    '-NoExit',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    $backendEncodedCommand
)

if (-not (Wait-ForHttpEndpoint -Uri 'http://127.0.0.1:8000/health' -TimeoutSeconds 30)) {
    Write-Warning 'Backend did not become ready within 30 seconds. Check the backend window for details.'
    exit 1
}
Write-Host 'Backend is ready.'

Write-Host 'Starting frontend...'
$quotedRepoRoot = ConvertTo-SingleQuotedPowerShellString $repoRoot
$frontendCommand = "Set-Location -LiteralPath $quotedRepoRoot; py -m http.server 5500 --directory frontend"
$frontendEncodedCommand = ConvertTo-EncodedCommand $frontendCommand
Start-Process -FilePath 'powershell.exe' -ArgumentList @(
    '-NoExit',
    '-EncodedCommand',
    $frontendEncodedCommand
)

$demoUrl = 'http://127.0.0.1:5500/'
if (-not (Wait-ForHttpEndpoint -Uri $demoUrl -TimeoutSeconds 15)) {
    Write-Warning 'Frontend did not become ready within 15 seconds. Check the frontend window for details.'
    exit 1
}

Write-Host 'Opening demo in Chrome...'
$chrome = Get-Command 'chrome.exe' -ErrorAction SilentlyContinue
if ($null -ne $chrome) {
    Start-Process -FilePath $chrome.Source -ArgumentList $demoUrl
}
else {
    Write-Warning 'Chrome was not found on PATH. Opening the demo in the default browser.'
    Start-Process $demoUrl
}

Write-Host 'Demo started successfully.'
