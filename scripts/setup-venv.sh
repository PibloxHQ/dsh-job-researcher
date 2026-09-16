#!/usr/bin/env bash
# Create plugin-owned Python venv under $DSH_HOME/job-researcher/.venv
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/dsh-lab/runtime/dsh-home}"
DATA_DIR="${JOB_RESEARCHER_DATA_DIR:-$DSH_HOME/job-researcher}"
VENV="$DATA_DIR/.venv"
PY_SRC="$ROOT/runtime/python"

mkdir -p "$DATA_DIR"
if [[ ! -x "$VENV/bin/python" ]]; then
  python3.12 -m venv "$VENV"
fi
"$VENV/bin/pip" install -U pip setuptools wheel
"$VENV/bin/pip" install -e "$PY_SRC"
echo "VENV_OK=$VENV"
"$VENV/bin/python" -c "import job_radar; print('job_radar', job_radar.__version__)"
