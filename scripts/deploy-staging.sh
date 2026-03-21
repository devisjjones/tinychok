#!/usr/bin/env bash

set -euo pipefail

BRANCH="${TINYCHOK_STAGING_BRANCH:-codex/staging-deploy}"
SERVICE_NAME="${TINYCHOK_STAGING_SERVICE:-tinychok-staging}"
FRONTEND_DIR="${TINYCHOK_STAGING_FRONTEND_DIR:-/var/www/tinychok-staging}"
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

if [[ "$SKIP_PULL" -eq 0 ]]; then
  echo "==> Fetching branch $BRANCH"
  git fetch origin
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
else
  echo "==> Skipping git fetch/pull"
fi

CURRENT_HEAD="$(git rev-parse --short HEAD)"
echo "==> Deploying commit $CURRENT_HEAD"

echo "==> Installing dependencies"
npm ci

echo "==> Building project"
npm run build

echo "==> Restarting service $SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

echo "==> Syncing dist/ to $FRONTEND_DIR"
sudo rsync -av --delete dist/ "$FRONTEND_DIR/"

echo "==> Done"
echo "Commit: $CURRENT_HEAD"
echo "Next check:"
echo "  curl -I https://staging.tinychok.ru"
echo "  curl -s https://api.staging.tinychok.ru/healthz"
