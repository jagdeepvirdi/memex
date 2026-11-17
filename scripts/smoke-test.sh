#!/usr/bin/env bash
# End-to-end smoke test of the Docker install: builds the image, starts postgres + app in a SEPARATE compose project on
# spare ports (your own Memex is never touched), then checks the things a new user and an attacker would meet first.
#
#   bash scripts/smoke-test.sh          needs Docker, bash, curl and node; takes a few minutes the first time
#
# It runs in CI (.github/workflows/ci.yml) and works the same on your machine. Everything it creates is removed on exit.
set -u
cd "$(dirname "$0")/.."

export COMPOSE_PROJECT_NAME=memex_smoke
export MEMEX_PORT="${SMOKE_APP_PORT:-3912}"
export MEMEX_DB_PORT="${SMOKE_DB_PORT:-5937}"
# A random strong secret, so the production start-up checks pass the way they do for a real install.
export JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
BASE="http://127.0.0.1:${MEMEX_PORT}"
FAILED=0

cleanup() { docker compose down -v --remove-orphans >/dev/null 2>&1; }
trap cleanup EXIT

pass() { echo "  ok   $1"; }
fail() { echo "  FAIL $1"; FAILED=1; }
check() { # check "<what>" <command...>
  local what="$1"; shift
  if "$@" >/dev/null 2>&1; then pass "$what"; else fail "$what"; fi
}
json() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const v=JSON.parse(d);console.log(eval('v.'+process.argv[1]))}catch(e){console.log('')}})" "$1"; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "Building and starting (project $COMPOSE_PROJECT_NAME, app $MEMEX_PORT, db $MEMEX_DB_PORT) ..."
docker compose up -d --build postgres app || { echo "FAIL could not build or start"; docker compose logs --tail 40; exit 1; }

echo "Waiting for the app to be healthy ..."
STATUS=""
for _ in $(seq 1 90); do
  STATUS="$(curl -s "$BASE/api/health/status" | json status)"
  [ "$STATUS" = "ok" ] && break
  sleep 2
done
if [ "$STATUS" != "ok" ]; then
  echo "FAIL the app did not become healthy (last status: '${STATUS}')"
  docker compose logs --tail 60 app
  exit 1
fi

echo "Checks:"
HEALTH="$(curl -s "$BASE/api/health/status")"
[ "$(echo "$HEALTH" | json migrations.pending)" = "0" ] && pass "migrations applied on boot" || fail "migrations pending: $HEALTH"
[ "$(echo "$HEALTH" | json database.ok)" = "true" ] && pass "database reachable" || fail "database not ok"
echo "$HEALTH" | grep -qiE "postgresql://|password|memex@" && fail "health endpoint leaks connection details" || pass "health endpoint shows no connection details"
[ "$(curl -s "$BASE/api/auth/status" | json needsSetup)" = "true" ] && pass "fresh install asks for setup" || fail "needsSetup is not true"
curl -s "$BASE/" | grep -q '<div id="root"' && pass "web app is served at /" || fail "web app not served"
[ "$(code "$BASE/api/items")" = "401" ] && pass "API needs a login" || fail "API answered without a login"
[ "$(code "$BASE/api/vault/status")" = "401" ] && pass "vault routes need a login" || fail "vault routes open"

WEAK="$(code -X POST "$BASE/api/auth/setup" -H 'Content-Type: application/json' -d '{"email":"smoke@example.com","password":"short"}')"
[ "$WEAK" = "400" ] && pass "a weak password is refused" || fail "weak password answered $WEAK"
SETUP="$(curl -s -X POST "$BASE/api/auth/setup" -H 'Content-Type: application/json' -d '{"email":"smoke@example.com","password":"a-long-enough-pass"}')"
TOKEN="$(echo "$SETUP" | json token)"
[ -n "$TOKEN" ] && pass "account created" || fail "setup failed: $SETUP"
[ "$(code "$BASE/api/items" -H "Authorization: Bearer $TOKEN")" = "200" ] && pass "login token works" || fail "token rejected"
[ "$(code -X POST "$BASE/api/auth/setup" -H 'Content-Type: application/json' -d '{"email":"two@example.com","password":"a-long-enough-pass"}')" = "403" ] && pass "a second account is refused" || fail "second setup allowed"

DEMO="$(curl -s -X POST "$BASE/api/demo" -H "Authorization: Bearer $TOKEN")"
[ "$(echo "$DEMO" | json items)" -ge 35 ] 2>/dev/null && pass "sample data loads" || fail "sample data: $DEMO"
CLEAR="$(curl -s -X DELETE "$BASE/api/demo" -H "Authorization: Bearer $TOKEN")"
[ "$(echo "$CLEAR" | json items)" -ge 35 ] 2>/dev/null && pass "sample data clears" || fail "clear: $CLEAR"

ACAO_EVIL="$(curl -s -D - -o /dev/null "$BASE/api/health" -H 'Origin: https://evil.example' | tr -d '\r' | grep -i '^access-control-allow-origin' || true)"
[ -z "$ACAO_EVIL" ] && pass "a random website gets no CORS access to the API" || fail "CORS open to a random site: $ACAO_EVIL"
ACAO_BM="$(curl -s -D - -o /dev/null -X OPTIONS "$BASE/api/ingest/quicksave" -H 'Origin: https://some-page.example' -H 'Access-Control-Request-Method: POST' | tr -d '\r' | grep -i '^access-control-allow-origin' || true)"
[ -n "$ACAO_BM" ] && pass "the bookmarklet route still works from any page" || fail "bookmarklet preflight blocked"

APP_BIND="$(docker compose port app 3002 2>/dev/null)"
DB_BIND="$(docker compose port postgres 5432 2>/dev/null)"
case "$APP_BIND" in 127.0.0.1:*) pass "app is published on loopback only ($APP_BIND)";; *) fail "app published on '$APP_BIND'";; esac
case "$DB_BIND" in 127.0.0.1:*) pass "database is published on loopback only ($DB_BIND)";; *) fail "database published on '$DB_BIND'";; esac

docker compose exec -T app printenv JWT_SECRET >/dev/null 2>&1 && pass "app got its secret from the environment" || fail "no JWT_SECRET in the app"

echo
if [ "$FAILED" -eq 0 ]; then echo "Smoke test passed."; else echo "Smoke test FAILED."; docker compose logs --tail 40 app; fi
exit "$FAILED"
