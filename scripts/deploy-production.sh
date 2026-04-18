#!/usr/bin/env bash

set -euo pipefail

BRANCH="${TINYCHOK_PRODUCTION_BRANCH:-codex/global-release-prep}"
SERVICE_NAME="${TINYCHOK_PRODUCTION_SERVICE:-tinychok-production}"
FRONTEND_DIR="${TINYCHOK_PRODUCTION_FRONTEND_DIR:-/var/www/tinychok-production}"
EXPECTED_ANALYTICS_PROVIDER="${TINYCHOK_EXPECTED_ANALYTICS_PROVIDER:-log}"
FORBIDDEN_STAGING_METRICA_COUNTER_ID="${TINYCHOK_FORBIDDEN_STAGING_METRICA_COUNTER_ID:-108249405}"
SKIP_PULL=0

usage() {
  cat <<'EOF'
Usage:
  bash scripts/deploy-production.sh [--skip-pull] [--branch <name>] [--service <name>] [--frontend-dir <path>]

Defaults:
  branch:       codex/global-release-prep
  service:      tinychok-production
  frontend-dir: /var/www/tinychok-production

Examples:
  bash scripts/deploy-production.sh
  bash scripts/deploy-production.sh --skip-pull
  TINYCHOK_PRODUCTION_BRANCH=codex/global-release-prep bash scripts/deploy-production.sh
EOF
}

ensure_clean_worktree() {
  local dirty_status
  dirty_status="$(git status --porcelain)"

  if [[ -n "$dirty_status" ]]; then
    echo "Production deploy requires a clean commit-backed worktree." >&2
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
      echo "Production deploy requires origin to point directly at github.com for devisjjones/tinychok.git." >&2
      echo "Current origin: ${origin_url:-<missing>}" >&2
      exit 1
      ;;
  esac
}

verify_production_runtime_release() {
  node scripts/verify-release-runtime.mjs \
    --client-config-url https://api.tinychok.ru/api/client-config \
    --health-url https://api.tinychok.ru/healthz \
    --ready-url https://api.tinychok.ru/readyz \
    --require-analytics \
    --expected-analytics-provider "$EXPECTED_ANALYTICS_PROVIDER" \
    --forbid-metrica-counter-id "$FORBIDDEN_STAGING_METRICA_COUNTER_ID" \
    --expected-ready-environment production \
    --expected-admin-environment production \
    --expected-public-app-url https://tinychok.ru \
    --expected-public-api-url https://api.tinychok.ru \
    --expected-captcha-provider smartcaptcha \
    --require-trust-proxy
}

wait_for_production_runtime_release() {
  local attempt=1
  local max_attempts=15
  local retry_delay_seconds=2

  until verify_production_runtime_release; do
    if (( attempt >= max_attempts )); then
      echo "Production runtime contracts did not recover after ${max_attempts} attempts." >&2
      return 1
    fi

    echo "Production runtime not ready yet; retrying release verification in ${retry_delay_seconds}s (attempt ${attempt}/${max_attempts})."
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

echo "==> Building project for production"
# Global release must never reuse a staging build or a plain same-origin dist.
# Production frontend has to embed api.tinychok.ru and the dedicated realtime host,
# otherwise the runtime contour, payments and auth contracts are being verified
# against a different surface than the one the live users actually load.
npm run build:production

echo "==> Restarting service $SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

echo "==> Verifying production runtime release contracts"
# Production must come back with the real production environment markers:
# - readyz.environment=production
# - public urls pinned to tinychok.ru / api.tinychok.ru
# - SmartCaptcha enabled
# - trust proxy enabled
# - analytics enabled with a non-staging counter id
wait_for_production_runtime_release

echo "==> Syncing dist/ to $FRONTEND_DIR"
sudo rsync -av --delete --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r dist/ "$FRONTEND_DIR/"

echo "==> Verifying production static web icon contracts"
node scripts/verify-web-static-assets.mjs \
  --root-url https://tinychok.ru

echo "==> Verifying live production app asset chain"
node scripts/verify-live-app-assets.mjs \
  --root-url https://tinychok.ru

echo "==> Done"
echo "Commit: $CURRENT_HEAD"
echo "Next check:"
echo "  curl -I https://tinychok.ru"
echo "  curl -s https://api.tinychok.ru/healthz"
