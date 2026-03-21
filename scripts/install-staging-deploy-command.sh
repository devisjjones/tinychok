#!/usr/bin/env bash

set -euo pipefail

COMMAND_NAME="${TINYCHOK_STAGING_COMMAND_NAME:-tinychok-staging-deploy}"
BIN_DIR="${TINYCHOK_STAGING_COMMAND_DIR:-$HOME/bin}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_PATH="$BIN_DIR/$COMMAND_NAME"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/install-staging-deploy-command.sh

Optional env vars:
  TINYCHOK_STAGING_COMMAND_NAME
  TINYCHOK_STAGING_COMMAND_DIR

Result:
  Installs a wrapper command that runs the repo staging deploy script from any directory.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

mkdir -p "$BIN_DIR"

cat >"$TARGET_PATH" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec "$REPO_DIR/scripts/deploy-staging.sh" "\$@"
EOF

chmod +x "$TARGET_PATH"

echo "Installed: $TARGET_PATH"

if [[ ":$PATH:" == *":$BIN_DIR:"* ]]; then
  echo "Command is ready:"
  echo "  $COMMAND_NAME"
else
  echo "Command installed, but $BIN_DIR is not in PATH for this shell."
  echo "Run it explicitly:"
  echo "  $TARGET_PATH"
  echo "Or add this to ~/.bashrc or ~/.zshrc:"
  echo "  export PATH=\"$BIN_DIR:\$PATH\""
fi
