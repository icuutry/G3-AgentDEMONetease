param(
    [switch]$FreshDemo
)

$repoRoot = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($repoRoot)) {
    $repoRoot = (Get-Location).Path
}

$backendDirectory = Join-Path $repoRoot 'backend'
$pythonPath = Join-Path $backendDirectory '.venv\Scripts\python.exe'
$backendMain = Join-Path $backendDirectory 'app\main.py'
$frontendDirectory = Join-Path $repoRoot 'frontend'
$frontendIndex = Join-Path $frontendDirectory 'index.html'
$frontendServer = Join-Path $repoRoot 'scripts\serve_frontend_no_cache.py'

$requiredPaths = @(
    $pythonPath,
    $backendMain,
    $frontendIndex,
    $frontendServer
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

function Confirm-FreshDemoData {
    $loginBody = @{
        role = 'officer'
        email = 'officer@demo.com'
        password = 'demo123'
    } | ConvertTo-Json -Compress

    $login = Invoke-RestMethod `
        -Method Post `
        -Uri 'http://127.0.0.1:8000/auth/login' `
        -ContentType 'application/json' `
        -Body $loginBody `
        -TimeoutSec 10

    [string]$accessToken = $login.accessToken
    if ([string]::IsNullOrWhiteSpace($accessToken)) {
        throw 'Fresh demo login did not return an access token.'
    }

    $headers = @{ Authorization = "Bearer $accessToken" }
    Invoke-RestMethod `
        -Method Post `
        -Uri 'http://127.0.0.1:8000/demo/reset' `
        -Headers $headers `
        -TimeoutSec 15 | Out-Null

    $response = Invoke-RestMethod `
        -Method Get `
        -Uri 'http://127.0.0.1:8000/applications' `
        -Headers $headers `
        -TimeoutSec 15
    $applications = @($response.items)

    $expected = @{
        'CAR-2026-001' = @('Sarah Lee', 'Nissan Sylphy 1.6', 'approved')
        'CAR-2026-002' = @('Daniel Lim', 'Honda Civic 1.5 Turbo', 'reviewing')
        'CAR-2026-003' = @('Marcus Wong', 'Mazda 3 1.5', 'rejected')
        'CAR-2026-004' = @('Daniel Lim (second application)', 'Honda HR-V 1.5', 'need_info')
        'CAR-2026-005' = @('Amelia Tan', 'Toyota Corolla Altis 1.6', 'reviewing')
    }

    if ($applications.Count -ne 5 -or [int]$response.total -ne 5) {
        throw "Fresh demo validation expected exactly 5 records but received $($applications.Count)."
    }
    if (@($applications | Where-Object { $_.id -eq 'CAR-2026-006' }).Count -gt 0) {
        throw 'Fresh demo validation found unexpected record CAR-2026-006.'
    }

    foreach ($applicationId in $expected.Keys) {
        $matches = @($applications | Where-Object { $_.id -eq $applicationId })
        if ($matches.Count -ne 1) {
            throw "Fresh demo validation expected one record for $applicationId."
        }
        $application = $matches[0]
        $values = $expected[$applicationId]
        if (
            $application.name -ne $values[0] -or
            $application.carModel -ne $values[1] -or
            $application.status -ne $values[2]
        ) {
            throw "Fresh demo validation failed for $applicationId."
        }
    }

    Write-Host 'Fresh demo data verified: 5 current records.' -ForegroundColor Green
}

function Find-ChromeExecutable {
    $candidates = @()
    $chromeCommands = @(Get-Command 'chrome.exe' -CommandType Application -ErrorAction SilentlyContinue)
    foreach ($command in $chromeCommands) {
        if (-not [string]::IsNullOrWhiteSpace($command.Source)) {
            $candidates += $command.Source
        }
    }

    $programFiles = [Environment]::GetFolderPath('ProgramFiles')
    $programFilesX86 = [Environment]::GetFolderPath('ProgramFilesX86')
    $localAppData = [Environment]::GetFolderPath('LocalApplicationData')
    $candidates += @(
        (Join-Path $programFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $programFilesX86 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $localAppData 'Google\Chrome\Application\chrome.exe')
    )

    foreach ($candidate in @($candidates | Select-Object -Unique)) {
        if (
            -not [string]::IsNullOrWhiteSpace($candidate) -and
            (Test-Path -LiteralPath $candidate -PathType Leaf)
        ) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    return $null
}

function Remove-TemporaryBrowserProfile {
    param(
        [string]$ProfilePath
    )

    if ([string]::IsNullOrWhiteSpace($ProfilePath) -or -not (Test-Path -LiteralPath $ProfilePath)) {
        return
    }

    try {
        [string]$resolvedProfile = (Resolve-Path -LiteralPath $ProfilePath -ErrorAction Stop).Path
        [string]$resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
        [string]$resolvedRepo = [IO.Path]::GetFullPath($repoRoot).TrimEnd('\') + '\'
        if (
            -not $resolvedProfile.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase) -or
            $resolvedProfile.StartsWith($resolvedRepo, [StringComparison]::OrdinalIgnoreCase)
        ) {
            Write-Warning "Refusing to remove unexpected browser profile path: $resolvedProfile"
            return
        }
        Remove-Item -LiteralPath $resolvedProfile -Recurse -Force -ErrorAction Stop
    }
    catch {
        Write-Warning "Could not remove temporary Chrome profile '$ProfilePath': $($_.Exception.Message)"
    }
}

$backendProcess = $null
$frontendProcess = $null
$browserProcess = $null
$browserProfileDirectory = $null
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

    if ($FreshDemo) {
        Write-Host 'Resetting and validating fresh demo data...'
        Confirm-FreshDemoData
    }

    Write-Host 'Starting frontend...'
    $frontendProcess = Start-Process `
        -FilePath $pythonExe `
        -ArgumentList @(
            ('"{0}"' -f $frontendServer),
            '--directory',
            ('"{0}"' -f $frontendDirectory),
            '--bind',
            '127.0.0.1',
            '--port',
            '5510'
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
    [string]$demoUrl = "http://127.0.0.1:5510/?build=20260730-ui-final-2&t=$cacheBuster#/login/officer"
    Write-Host 'Opening demo...'
    [string]$chromeExe = Find-ChromeExecutable
    if (-not [string]::IsNullOrWhiteSpace($chromeExe)) {
        $browserProfileDirectory = Join-Path `
            ([IO.Path]::GetTempPath()) `
            "ai-car-loan-demo-chrome-$([Guid]::NewGuid().ToString('N'))"
        New-Item -ItemType Directory -Path $browserProfileDirectory -ErrorAction Stop | Out-Null
        $browserProcess = Start-Process `
            -FilePath $chromeExe `
            -ArgumentList @(
                "--user-data-dir=$browserProfileDirectory",
                '--new-window',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-application-cache',
                '--disable-background-networking',
                $demoUrl
            ) `
            -PassThru
        Write-Host "Browser executable: $chromeExe"
        Write-Host "Temporary profile: $browserProfileDirectory"
    }
    else {
        Write-Warning 'Chrome was not found. The default browser will open without a guaranteed isolated profile.'
        Start-Process -FilePath $demoUrl
        Write-Host 'Browser executable: system default'
        Write-Host 'Temporary profile: unavailable'
    }
    Write-Host "Opened URL: $demoUrl"

    Write-Host 'Demo is running.'
    Read-Host 'Press Enter to stop the browser and both servers' | Out-Null
}
catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    $exitCode = 1
}
finally {
    Stop-LauncherProcess -Process $browserProcess
    Stop-LauncherProcess -Process $frontendProcess
    Stop-LauncherProcess -Process $backendProcess
    Remove-TemporaryBrowserProfile -ProfilePath $browserProfileDirectory
}

if ($exitCode -ne 0) {
    exit $exitCode
}
