#!/usr/bin/env bash
set -euo pipefail

# Re-run with sudo if needed.
if [[ "${EUID}" -ne 0 ]]; then
  exec sudo "$0" "$@"
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYSTEMD_DIR="/etc/systemd/system"
SCRIPTS_DIR="${REPO_DIR}/scripts"
UI_DIR="${REPO_DIR}/reborn_ui"

TARGET_UNIT="reborn-native.target"
API_UNIT="reborn-api.service"
POLLER_UNIT="reborn-poller.service"
UI_UNIT="reborn-ui.service"
ENV_EXAMPLE="reborn-native.env.example"
ENV_FILE="reborn-native.env"

install -m 0644 "${SCRIPTS_DIR}/${TARGET_UNIT}" "${SYSTEMD_DIR}/${TARGET_UNIT}"
install -m 0644 "${SCRIPTS_DIR}/${API_UNIT}" "${SYSTEMD_DIR}/${API_UNIT}"
install -m 0644 "${SCRIPTS_DIR}/${POLLER_UNIT}" "${SYSTEMD_DIR}/${POLLER_UNIT}"
install -m 0644 "${SCRIPTS_DIR}/${UI_UNIT}" "${SYSTEMD_DIR}/${UI_UNIT}"

if [[ ! -f "${SCRIPTS_DIR}/${ENV_FILE}" ]]; then
  install -m 0644 "${SCRIPTS_DIR}/${ENV_EXAMPLE}" "${SCRIPTS_DIR}/${ENV_FILE}"
  echo "Created ${SCRIPTS_DIR}/${ENV_FILE} from example."
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required for reborn-ui.service. Install Node.js/npm first."
  exit 1
fi

if [[ ! -d "${UI_DIR}/node_modules" ]]; then
  echo "Installing reborn UI dependencies..."
  cd "${UI_DIR}"
  npm install --no-fund --no-audit
fi

systemctl daemon-reload
systemctl enable "${TARGET_UNIT}"
systemctl restart "${TARGET_UNIT}"

systemctl --no-pager --full status "${API_UNIT}" || true
systemctl --no-pager --full status "${POLLER_UNIT}" || true
systemctl --no-pager --full status "${UI_UNIT}" || true

echo
echo "Reborn native stack installed and started."
echo "Check logs with: journalctl -u ${API_UNIT} -f"
echo "Check logs with: journalctl -u ${POLLER_UNIT} -f"
echo "Check logs with: journalctl -u ${UI_UNIT} -f"
