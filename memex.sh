#!/usr/bin/env bash
# Memex dev/prod lifecycle manager.
#
# Usage:
#   ./memex.sh dev  start [--follow]         hot-reload dev (server + client)
#   ./memex.sh dev  stop                     stop dev servers and Postgres
#   ./memex.sh prod start [--skip-build]     build + start production
#   ./memex.sh prod start --follow           build, start, then tail server log
#   ./memex.sh prod stop                     stop prod server and Postgres

set -euo pipefail

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$SCRIPT_DIR/.memex"
LOG_DIR="$RUN_DIR/logs"

# ── Colors (only when stdout is a terminal) ───────────────────────────────────
if [[ -t 1 ]]; then
    CY=$'\033[36m' GR=$'\033[32m' YL=$'\033[33m'
    RD=$'\033[31m' WT=$'\033[97m' DM=$'\033[90m' RS=$'\033[0m'
else
    CY='' GR='' YL='' RD='' WT='' DM='' RS=''
fi

step() { printf "  ${CY}->${RS} %s\n" "$*"; }
ok()   { printf "  ${GR}OK${RS} %s\n" "$*"; }
warn() { printf "  ${YL}!!${RS} %s\n" "$*"; }
head() { printf "\n  ${WT}%s${RS}\n"  "$*"; }
bail() { printf "  ${RD}ERR${RS} %s\n" "$*"; exit 1; }

pid_file() { echo "$RUN_DIR/$1.pid"; }

# ── Guard: abort if the process is already running ────────────────────────────
assert_not_running() {
    local name="$1"
    local f; f=$(pid_file "$name")
    [[ -f "$f" ]] || return 0
    local pid; pid=$(cat "$f")
    if kill -0 "$pid" 2>/dev/null; then
        bail "$name is already running (pid $pid).  Run: ./memex.sh $MODE stop"
    fi
    rm -f "$f"  # stale file from a crashed run
}

# ── Start a long-running process in the background, record its PID ────────────
start_proc() {
    local name="$1" workdir="$2"; shift 2
    mkdir -p "$RUN_DIR" "$LOG_DIR"

    # Auto-gitignore the run directory
    [[ -f "$RUN_DIR/.gitignore" ]] || echo '*' > "$RUN_DIR/.gitignore"

    local log="$LOG_DIR/$name.log"
    : > "$log"   # truncate / create

    # exec replaces the subshell so $! is the real process PID, not a wrapper
    (cd "$workdir" && exec "$@") >> "$log" 2>&1 &
    local pid=$!
    echo "$pid" > "$(pid_file "$name")"
    ok "$name started  pid=$pid"
    step "log -> $log"
}

# ── Stop a tracked process — kills the process and all its children ───────────
stop_proc() {
    local name="$1"
    local f; f=$(pid_file "$name")
    if [[ ! -f "$f" ]]; then
        warn "$name — no pid file, skipping"
        return
    fi
    local pid; pid=$(cat "$f")
    if kill -0 "$pid" 2>/dev/null; then
        # Kill children first (node spawned by npm/tsx), then the parent
        pkill -P "$pid" 2>/dev/null || true
        kill    "$pid"  2>/dev/null || true
        ok "Stopped $name  pid=$pid"
    else
        warn "$name — not running (stale pid $pid)"
    fi
    rm -f "$f"
}

# ── Run an npm script in a subdirectory, abort on failure ─────────────────────
run_npm() {
    local workdir="$1" script="$2" label="$3"
    step "$label"
    (cd "$workdir" && npm run "$script")
}

# ── Parse arguments ───────────────────────────────────────────────────────────
usage() {
    sed -n '3,10p' "${BASH_SOURCE[0]}"   # re-print the header comment
    exit 1
}

[[ $# -ge 2 ]] || usage
MODE="$1"; ACTION="$2"; shift 2

[[ "$MODE"   == "dev"   || "$MODE"   == "prod"  ]] || usage
[[ "$ACTION" == "start" || "$ACTION" == "stop"  ]] || usage

SKIP_BUILD=false
FOLLOW=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-build) SKIP_BUILD=true ;;
        --follow)     FOLLOW=true ;;
        *) usage ;;
    esac
    shift
done

# ══════════════════════════════════════════════════════════════════════════════
#  START
# ══════════════════════════════════════════════════════════════════════════════
cmd_start() {
    head "[$MODE] Starting Memex..."

    assert_not_running server
    [[ "$MODE" == "dev" ]] && assert_not_running client

    # ── Docker: only Postgres — Ollama runs natively on port 11434 ───────────
    step "Starting Docker services (postgres)..."
    docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d --wait postgres
    ok "Postgres is healthy"

    # ── Migrations (idempotent, safe to run every start) ─────────────────────
    run_npm "$SCRIPT_DIR/server" migrate "Running DB migrations"
    ok "Migrations applied"

    # ── Build (prod only, skip with --skip-build) ─────────────────────────────
    if [[ "$MODE" == "prod" && "$SKIP_BUILD" == false ]]; then
        head "[prod] Building..."
        run_npm "$SCRIPT_DIR/server" build "Compiling server  (tsc)"
        run_npm "$SCRIPT_DIR/client" build "Bundling client   (vite build)"
        ok "Build complete"
    fi

    # ── Launch processes ──────────────────────────────────────────────────────
    head "[$MODE] Launching processes..."

    if [[ "$MODE" == "dev" ]]; then
        start_proc server "$SCRIPT_DIR/server" npm run dev
        start_proc client "$SCRIPT_DIR/client" npm run dev
    else
        start_proc server "$SCRIPT_DIR/server" npm start
    fi

    echo ""
    printf "  ${WT}Memex is up${RS}\n"
    [[ "$MODE" == "dev" ]] && printf "    ${CY}Client  http://localhost:5175${RS}\n"
    printf "    ${CY}API     http://localhost:3002/api/health${RS}\n"
    printf "    ${DM}Logs    %s${RS}\n" "$LOG_DIR"
    printf "    ${DM}Stop    ./memex.sh %s stop${RS}\n" "$MODE"
    echo ""

    if [[ "$FOLLOW" == true ]]; then
        step "Tailing server log  (Ctrl+C stops tailing — servers keep running)"
        tail -f "$LOG_DIR/server.log"
    fi
}

# ══════════════════════════════════════════════════════════════════════════════
#  STOP
# ══════════════════════════════════════════════════════════════════════════════
cmd_stop() {
    head "[$MODE] Stopping Memex..."

    stop_proc server
    [[ "$MODE" == "dev" ]] && stop_proc client

    step "Stopping Docker services (postgres)..."
    docker compose -f "$SCRIPT_DIR/docker-compose.yml" stop postgres
    ok "Postgres stopped"

    echo ""
}

# ── Dispatch ──────────────────────────────────────────────────────────────────
case "$ACTION" in
    start) cmd_start ;;
    stop)  cmd_stop  ;;
esac
