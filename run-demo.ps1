$repoRoot = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($repoRoot)) {
    $repoRoot = (Get-Location).Path
}

$backendDirectory = Join-Path $repoRoot 'backend'
$pythonPath = Join-Path $backendDirectory '.venv\Scripts\python.exe'
$backendMain = Join-Path $backendDirectory 'app\main.py'
$frontendDirectory = Join-Path $repoRoot 'frontend'
$frontendIndex = Join-Path $frontendDirectory 'index.html'

$requiredPaths = @(
    $pythonPath,
    $backendMain,
    $frontendIndex
)

foreach ($requiredPath in $requiredPaths) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        Write-Host "Required file not found: $requiredPath" -ForegroundColor Red
        exit 1
    }
}

[string]$pythonExe = (Resolve-Path -LiteralPath $pythonPath -ErrorAction Stop).Path
if ([string]::IsNullOrWhiteSpace($pythonExe)) {
    Write-Host "Could not resolve Python executable: $pythonPath" -ForegroundColor Red
    exit 1
}

function Get-ListeningPortOwners {
    param(
        [Parameter(Mandatory = $true)]
        [int[]]$Ports
    )

    $owners = @()
    foreach ($port in $Ports) {
        $usedNetTcpConnection = $false
        try {
            $connections = @(Get-NetTCPConnection `
                -State Listen `
                -LocalPort $port `
                -ErrorAction Stop)
            $usedNetTcpConnection = $true
            foreach ($connection in $connections) {
                $owners += [PSCustomObject]@{
                    Port = $port
                    OwnerPid = [int]$connection.OwningProcess
                }
            }
        }
        catch {
            # Fall back to netstat on systems without Get-NetTCPConnection.
        }

        if (-not $usedNetTcpConnection) {
            $netstatPath = Join-Path $env:SystemRoot 'System32\netstat.exe'
            if (-not (Test-Path -LiteralPath $netstatPath -PathType Leaf)) {
                throw 'Could not inspect listening ports because neither Get-NetTCPConnection nor netstat is available.'
            }

            $netstatLines = @(& $netstatPath -ano -p TCP 2>$null)
            foreach ($line in $netstatLines) {
                if ($line -match "^\s*TCP\s+\S+:$port\s+\S+\s+LISTENING\s+(\d+)\s*$") {
                    $owners += [PSCustomObject]@{
                        Port = $port
                        OwnerPid = [int]$Matches[1]
                    }
                }
            }
        }
    }

    return @($owners | Sort-Object Port, OwnerPid -Unique)
}

try {
    $portConflicts = @(Get-ListeningPortOwners -Ports @(8000, 5510))
}
catch {
    Write-Host "Unable to check demo ports: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

if ($portConflicts.Count -gt 0) {
    foreach ($conflict in $portConflicts) {
        Write-Host "Port $($conflict.Port) is already in use by PID $($conflict.OwnerPid)." -ForegroundColor Red
    }
    Write-Host 'Stop the existing process or processes before starting the demo. No processes were terminated.' -ForegroundColor Red
    exit 1
}

$logDirectory = Join-Path $repoRoot 'demo-logs'
if (-not (Test-Path -LiteralPath $logDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
}

$backendOutputLog = Join-Path $logDirectory 'backend-output.log'
$backendErrorLog = Join-Path $logDirectory 'backend-error.log'
$frontendOutputLog = Join-Path $logDirectory 'frontend-output.log'
$frontendErrorLog = Join-Path $logDirectory 'frontend-error.log'

foreach ($logPath in @($backendOutputLog, $backendErrorLog, $frontendOutputLog, $frontendErrorLog)) {
    Set-Content -LiteralPath $logPath -Value '' -Encoding UTF8
}

function Wait-ForHttpEndpoint {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri,

        [Parameter(Mandatory = $true)]
        [int]$TimeoutSeconds,

        [Parameter(Mandatory = $true)]
        [System.Diagnostics.Process]$Process,

        [Parameter(Mandatory = $true)]
        [string]$ErrorLogPath
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $Process.Refresh()
        if ($Process.HasExited) {
            throw "The child process exited before becoming ready. Review the error log: $ErrorLogPath"
        }

        $requestSucceeded = $false
        try {
            $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                $requestSucceeded = $true
            }
        }
        catch {
            # The service may still be starting.
        }

        if ($requestSucceeded) {
            $Process.Refresh()
            if ($Process.HasExited) {
                throw "The child process exited during its readiness check. Review the error log: $ErrorLogPath"
            }
            return $true
        }

        Start-Sleep -Seconds 1
    }

    return $false
}

function Stop-LauncherProcess {
    param(
        [System.Diagnostics.Process]$Process
    )

    if ($null -eq $Process) {
        return
    }

    try {
        $Process.Refresh()
        if (-not $Process.HasExited) {
            $taskkillPath = Join-Path $env:SystemRoot 'System32\taskkill.exe'
            if (Test-Path -LiteralPath $taskkillPath -PathType Leaf) {
                [string]$taskkillExe = (Resolve-Path -LiteralPath $taskkillPath).Path
                $taskkillProcess = Start-Process `
                    -FilePath $taskkillExe `
                    -ArgumentList @('/PID', [string]$Process.Id, '/T', '/F') `
                    -WindowStyle Hidden `
                    -Wait `
                    -PassThru
                if ($taskkillProcess.ExitCode -ne 0) {
                    throw "taskkill exited with code $($taskkillProcess.ExitCode)"
                }
            }
            else {
                Stop-Process -Id $Process.Id -Force -ErrorAction Stop
            }
            [void]$Process.WaitForExit(5000)
        }
    }
    catch {
        Write-Warning "Could not stop launcher process $($Process.Id): $($_.Exception.Message)"
    }
}

$backendProcess = $null
$frontendProcess = $null
$exitCode = 0

try {
    Write-Host 'Starting backend...'
    $backendProcess = Start-Process `
        -FilePath $pythonExe `
        -ArgumentList @(
            '-m',
            'uvicorn',
            'app.main:app',
            '--host',
            '127.0.0.1',
            '--port',
            '8000'
        ) `
        -WorkingDirectory $backendDirectory `
        -WindowStyle Hidden `
        -RedirectStandardOutput $backendOutputLog `
        -RedirectStandardError $backendErrorLog `
        -PassThru

    if (-not (Wait-ForHttpEndpoint `
        -Uri 'http://127.0.0.1:8000/health' `
        -TimeoutSeconds 30 `
        -Process $backendProcess `
        -ErrorLogPath $backendErrorLog)) {
        throw "Backend did not become ready. Review the error log: $backendErrorLog"
    }
    Write-Host 'Backend is ready.'

    Write-Host 'Starting frontend...'
    $quotedFrontendDirectory = '"' + $frontendDirectory.Replace('"', '\"') + '"'
    $frontendProcess = Start-Process `
        -FilePath $pythonExe `
        -ArgumentList @(
            '-m',
            'http.server',
            '5510',
            '--bind',
            '127.0.0.1',
            '--directory',
            $quotedFrontendDirectory
        ) `
        -WorkingDirectory $repoRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $frontendOutputLog `
        -RedirectStandardError $frontendErrorLog `
        -PassThru

    if (-not (Wait-ForHttpEndpoint `
        -Uri 'http://127.0.0.1:5510/' `
        -TimeoutSeconds 15 `
        -Process $frontendProcess `
        -ErrorLogPath $frontendErrorLog)) {
        throw "Frontend did not become ready. Review the error log: $frontendErrorLog"
    }
    Write-Host 'Frontend is ready.'

    $cacheBuster = [DateTime]::UtcNow.ToString(
        'yyyyMMddHHmmssfff',
        [Globalization.CultureInfo]::InvariantCulture
    )
    [string]$demoUrl = "http://127.0.0.1:5510/?v=$cacheBuster"
    Write-Host 'Opening demo...'
    $chromeCommands = @(Get-Command 'chrome.exe' -CommandType Application -ErrorAction SilentlyContinue)
    if ($chromeCommands.Count -gt 0) {
        [string]$chromeExe = $chromeCommands[0].Source
        if ([string]::IsNullOrWhiteSpace($chromeExe)) {
            throw 'Chrome was found but its executable path could not be resolved.'
        }
        Start-Process -FilePath $chromeExe -ArgumentList @($demoUrl)
    }
    else {
        Start-Process -FilePath $demoUrl
    }

    Write-Host 'Demo is running.'
    Read-Host 'Press Enter to stop both servers' | Out-Null
}
catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    $exitCode = 1
}
finally {
    Stop-LauncherProcess -Process $frontendProcess
    Stop-LauncherProcess -Process $backendProcess
}

if ($exitCode -ne 0) {
    exit $exitCode
}
