#Requires -Version 7
<#
.SYNOPSIS
  Memex dev/prod lifecycle manager.
.DESCRIPTION
  Manages local Docker services (Postgres, Ollama) and Node.js processes
  for the Memex Personal Knowledge OS.
.EXAMPLE
  .\memex.ps1 dev   start              # hot-reload dev (server + client)
  .\memex.ps1 dev   start -Follow      # ...then tail server log
  .\memex.ps1 dev   stop               # stop everything
  .\memex.ps1 prod  start              # build + start production
  .\memex.ps1 prod  start -SkipBuild   # restart prod without rebuilding
  .\memex.ps1 prod  start -Follow      # build, start, then tail server log
  .\memex.ps1 prod  stop               # stop prod server + Docker
#>
param(
    [Parameter(Position = 0, Mandatory)]
    [ValidateSet('dev', 'prod')]
    [string] $Mode,

    [Parameter(Position = 1, Mandatory)]
    [ValidateSet('start', 'stop')]
    [string] $Action,

    [switch] $SkipBuild,
    [switch] $Follow
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Paths ─────────────────────────────────────────────────────────────────────
$Root   = $PSScriptRoot
$RunDir = Join-Path $Root '.memex'
$LogDir = Join-Path $RunDir 'logs'

# ── Output helpers ────────────────────────────────────────────────────────────
function step([string]$m) { Write-Host "  -> $m" -ForegroundColor Cyan }
function ok  ([string]$m) { Write-Host "  OK $m" -ForegroundColor Green }
function warn([string]$m) { Write-Host "  !! $m" -ForegroundColor Yellow }
function head([string]$m) { Write-Host "`n  $m" -ForegroundColor White }
function bail([string]$m) { Write-Host "  ERR $m" -ForegroundColor Red; exit 1 }

function Get-PidFile([string]$name) { Join-Path $RunDir "$name.pid" }

# ── Run an npm script in a subdirectory, abort on failure ─────────────────────
function Invoke-Npm {
    param([string]$WorkDir, [string]$Script, [string]$Label)
    step $Label
    Push-Location $WorkDir
    try {
        npm run $Script
        if ($LASTEXITCODE -ne 0) { bail "$Label failed (exit $LASTEXITCODE)" }
    }
    finally { Pop-Location }
}

# ── Start a long-running process in the background, record its PID ────────────
function Start-BgProcess {
    param(
        [string]   $Name,
        [string]   $WorkDir,
        [string]   $Exe,
        [string[]] $ProcArgs
    )
    $null = New-Item -ItemType Directory -Force -Path $RunDir, $LogDir

    # Auto-gitignore the run directory
    $gi = Join-Path $RunDir '.gitignore'
    if (-not (Test-Path $gi)) { '*' | Set-Content $gi }

    $logStdout = Join-Path $LogDir "$Name.log"
    $logStderr = Join-Path $LogDir "$Name.err.log"

    $proc = Start-Process `
        -FilePath         $Exe `
        -ArgumentList     $ProcArgs `
        -WorkingDirectory $WorkDir `
        -RedirectStandardOutput $logStdout `
        -RedirectStandardError  $logStderr `
        -NoNewWindow -PassThru

    $proc.Id | Set-Content (Get-PidFile $Name)
    ok "$Name started  pid=$($proc.Id)"
    step "log -> $logStdout"
    return $logStdout
}

# ── Stop a tracked process — kills the full Windows process tree ──────────────
function Stop-BgProcess([string]$name) {
    $pidFile = Get-PidFile $name
    if (-not (Test-Path $pidFile)) {
        warn "$name — no pid file, skipping"
        return
    }

    $savedId = [int](Get-Content $pidFile -Raw).Trim()
    $proc    = Get-Process -Id $savedId -ErrorAction SilentlyContinue

    if ($proc) {
        # /T kills the entire child tree: npm.cmd -> node -> tsx -> node
        $null = taskkill /F /T /PID $savedId 2>&1
        ok "Stopped $name  pid=$savedId"
    }
    else {
        warn "$name — not running (stale pid $savedId)"
    }

    Remove-Item $pidFile -Force
}

# ── Guard: abort if the process is already running ────────────────────────────
function Assert-NotRunning([string]$name) {
    $pidFile = Get-PidFile $name
    if (-not (Test-Path $pidFile)) { return }
    $savedId = [int](Get-Content $pidFile -Raw).Trim()
    if (Get-Process -Id $savedId -ErrorAction SilentlyContinue) {
        bail "$name is already running (pid $savedId).  Run: .\memex.ps1 $Mode stop"
    }
    # Stale file from a crashed run — remove it silently
    Remove-Item $pidFile -Force
}

# ══════════════════════════════════════════════════════════════════════════════
#  START
# ══════════════════════════════════════════════════════════════════════════════
function Invoke-Start {
    head "[$Mode] Starting Memex..."

    Assert-NotRunning 'server'
    if ($Mode -eq 'dev') { Assert-NotRunning 'client' }

    # ── Docker: only Postgres — Ollama runs natively on port 11434 ───────────
    step "Starting Docker services (postgres)..."
    docker compose -f "$Root\docker-compose.yml" up -d --wait postgres
    if ($LASTEXITCODE -ne 0) { bail "Postgres failed to become healthy" }
    ok "Postgres is healthy"

    # ── Migrations (idempotent, safe to run every start) ─────────────────────
    Invoke-Npm -WorkDir (Join-Path $Root 'server') -Script 'migrate' -Label 'Running DB migrations'
    ok "Migrations applied"

    # ── Build (prod only, skip with -SkipBuild) ───────────────────────────────
    if ($Mode -eq 'prod' -and -not $SkipBuild) {
        head "[prod] Building..."
        Invoke-Npm -WorkDir (Join-Path $Root 'server') -Script 'build' -Label 'Compiling server  (tsc)'
        Invoke-Npm -WorkDir (Join-Path $Root 'client') -Script 'build' -Label 'Bundling client   (vite build)'
        ok "Build complete"
    }

    # ── Launch processes ──────────────────────────────────────────────────────
    head "[$Mode] Launching processes..."

    if ($Mode -eq 'dev') {
        $serverLog = Start-BgProcess 'server' (Join-Path $Root 'server') 'npm.cmd' @('run', 'dev')
        $null      = Start-BgProcess 'client' (Join-Path $Root 'client') 'npm.cmd' @('run', 'dev')
    }
    else {
        $serverLog = Start-BgProcess 'server' (Join-Path $Root 'server') 'npm.cmd' @('start')
    }

    Write-Host ""
    Write-Host "  Memex is up" -ForegroundColor White
    if ($Mode -eq 'dev') {
        Write-Host "    Client  http://localhost:5175" -ForegroundColor Cyan
    }
    Write-Host "    API     http://localhost:3002/api/health" -ForegroundColor Cyan
    Write-Host "    Logs    $LogDir" -ForegroundColor Gray
    Write-Host "    Stop    .\memex.ps1 $Mode stop" -ForegroundColor Gray
    Write-Host ""

    if ($Follow) {
        step "Tailing server log  (Ctrl+C stops tailing — servers keep running)"
        Get-Content $serverLog -Wait
    }
}

# ══════════════════════════════════════════════════════════════════════════════
#  STOP
# ══════════════════════════════════════════════════════════════════════════════
function Invoke-Stop {
    head "[$Mode] Stopping Memex..."

    Stop-BgProcess 'server'
    if ($Mode -eq 'dev') { Stop-BgProcess 'client' }

    step "Stopping Docker services (postgres)..."
    docker compose -f "$Root\docker-compose.yml" stop postgres
    if ($LASTEXITCODE -eq 0) { ok "Postgres stopped" }

    Write-Host ""
}

# ── Dispatch ──────────────────────────────────────────────────────────────────
switch ($Action) {
    'start' { Invoke-Start }
    'stop'  { Invoke-Stop  }
}
