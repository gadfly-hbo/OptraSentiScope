#!/bin/bash
# Finder starts with a minimal PATH. Resolve and verify a runtime before using it.
set -eu
export NODE_OPTIONS=--use-bundled-ca
unset NODE_TLS_REJECT_UNAUTHORIZED NODE_EXTRA_CA_CERTS SSL_CERT_FILE SSL_CERT_DIR NODE_USE_SYSTEM_CA
sentiscope_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
sentiscope_node=''
for sentiscope_candidate in \
  "$sentiscope_root/.runtime/node/bin/node" \
  "$HOME/.local/node/bin/node" \
  "$HOME/Library/Application Support/OptraSentiScope/runtime/node/bin/node" \
  /opt/homebrew/bin/node \
  /usr/local/bin/node \
  "$(command -v node 2>/dev/null || true)"; do
  if [ -n "$sentiscope_candidate" ] && [ -x "$sentiscope_candidate" ] && \
    "$sentiscope_candidate" -e 'const [major,minor]=process.versions.node.split(".").map(Number);process.exit(major>24||major===24&&minor>=9?0:1)' >/dev/null 2>&1; then
    sentiscope_node=$sentiscope_candidate
    break
  fi
done
if [ -z "$sentiscope_node" ]; then
  printf '%s\n' 'OptraSentiScope 需要 Node.js 24.9 或更新版本。启动入口不会自动安装或更新。' >&2
  exit 1
fi
PATH="$(dirname -- "$sentiscope_node"):$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
export PATH
cd -- "$sentiscope_root"
exec "$sentiscope_node" "$sentiscope_root/scripts/trial-launcher.mjs" "$@"
