#!/bin/bash
set -eu
sentiscope_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
exec /bin/bash "$sentiscope_root/scripts/trial-command.sh" start "$@"
