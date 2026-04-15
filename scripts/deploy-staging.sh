#!/usr/bin/env bash

set -euo pipefail

BRANCH="${TINYCHOK_STAGING_BRANCH:-codex/staging-deploy}"
SERVICE_NAME="${TINYCHOK_STAGING_SERVICE:-tinychok-staging}"
FRONTEND_DIR="${TINYCHOK_STAGING_FRONTEND_DIR:-/var/www/tinychok-staging}"
EXPECTED_ANALYTICS_PROVIDER="${TINYCHOK_EXPECTED_ANALYTICS_PROVIDER:-clickhouse}"
SKIP_PULL=0

usage() {
  cat <<'EOF'
Usage:
  bash scripts/deploy-staging.sh [--skip-pull] [--branch <name>] [--service <name>] [--frontend-dir <path>]

Defaults:
  branch:       codex/staging-deploy
  service:      tinychok-staging
  frontend-dir: /var/www/tinychok-staging

Examples:
  bash scripts/deploy-staging.sh
  bash scripts/deploy-staging.sh --skip-pull
  TINYCHOK_STAGING_BRANCH=codex/staging-deploy bash scripts/deploy-staging.sh
EOF
}

ensure_clean_worktree() {
  local dirty_status
  dirty_status="$(git status --porcelain)"

  if [[ -n "$dirty_status" ]]; then
    echo "Staging deploy requires a clean commit-backed worktree." >&2
    echo "Dirty paths:" >&2
    echo "$dirty_status" >&2
    exit 1
  fi
}

ensure_origin_remote_contract() {
  local origin_url
  origin_url="$(git remote get-url origin 2>/dev/null || true)"

  case "$origin_url" in
    git@github.com:devisjjones/tinychok.git|https://github.com/devisjjones/tinychok.git)
      ;;
    *)
      echo "Staging deploy requires origin to point directly at github.com for devisjjones/tinychok.git." >&2
      echo "Current origin: ${origin_url:-<missing>}" >&2
      exit 1
      ;;
  esac
}

verify_staging_runtime_release() {
  node scripts/verify-release-runtime.mjs \
    --client-config-url https://api.staging.tinychok.ru/api/client-config \
    --health-url https://api.staging.tinychok.ru/healthz \
    --ready-url https://api.staging.tinychok.ru/readyz \
    --require-analytics \
    --expected-metrica-counter-id 108249405 \
    --expected-analytics-provider "$EXPECTED_ANALYTICS_PROVIDER"
}

wait_for_staging_runtime_release() {
  local attempt=1
  local max_attempts=12
  local retry_delay_seconds=2

  until verify_staging_runtime_release; do
    if (( attempt >= max_attempts )); then
      echo "Staging runtime contracts did not recover after ${max_attempts} attempts." >&2
      return 1
    fi

    echo "Runtime not ready yet; retrying release verification in ${retry_delay_seconds}s (attempt ${attempt}/${max_attempts})."
    sleep "$retry_delay_seconds"
    attempt=$((attempt + 1))
  done
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-pull)
      SKIP_PULL=1
      shift
      ;;
    --branch)
      [[ $# -ge 2 ]] || {
        echo "Missing value for --branch" >&2
        exit 1
      }
      BRANCH="$2"
      shift 2
      ;;
    --service)
      [[ $# -ge 2 ]] || {
        echo "Missing value for --service" >&2
        exit 1
      }
      SERVICE_NAME="$2"
      shift 2
      ;;
    --frontend-dir)
      [[ $# -ge 2 ]] || {
        echo "Missing value for --frontend-dir" >&2
        exit 1
      }
      FRONTEND_DIR="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

for cmd in git npm sudo rsync; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Required command not found: $cmd" >&2
    exit 1
  }
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> Repo dir: $REPO_DIR"
cd "$REPO_DIR"

ensure_origin_remote_contract

if [[ "$SKIP_PULL" -eq 0 ]]; then
  echo "==> Fetching branch $BRANCH"
  git fetch origin
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
else
  echo "==> Skipping git fetch/pull"
fi

ensure_clean_worktree

CURRENT_HEAD="$(git rev-parse --short HEAD)"
echo "==> Deploying commit $CURRENT_HEAD"

echo "==> Installing dependencies"
npm ci

echo "==> Verifying release audit gate"
npm run audit:release

echo "==> Building project for staging"
# Staging must never be deployed from plain `npm run build` output.
# If the frontend falls back to same-origin `/api`, Chrome re-opens nginx basic auth
# in a loop because the web host challenges those requests. `build:staging` now
# verifies that dist embeds `api.staging.tinychok.ru` and `wss://api.staging.tinychok.ru`.
npm run build:staging

echo "==> Restarting service $SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

echo "==> Verifying staging runtime release contracts"
# Release must fail if live runtime contracts drift even when the app still boots.
# Staging analytics must stay explicitly enabled with the expected sink provider and
# counter id 108249405, otherwise Metrica or internal analytics can silently stop
# receiving new events. After restart, nginx can briefly return 502 before the backend
# has rebound the socket, so the release gate must wait for live healthz/readyz to
# recover before failing.
wait_for_staging_runtime_release

echo "==> Syncing dist/ to $FRONTEND_DIR"
sudo rsync -av --delete --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r dist/ "$FRONTEND_DIR/"

echo "==> Verifying staging static web icon contracts"
node scripts/verify-web-static-assets.mjs \
  --root-url https://staging.tinychok.ru

echo "==> Verifying live user/admin app asset chain"
node scripts/verify-live-app-assets.mjs \
  --root-url https://staging.tinychok.ru

echo "==> Done"
echo "Commit: $CURRENT_HEAD"
echo "Next check:"
echo "  curl -I https://staging.tinychok.ru"
echo "  curl -s https://api.staging.tinychok.ru/healthz"
