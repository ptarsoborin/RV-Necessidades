#!/usr/bin/env bash
cd "$(dirname "$0")"
[ -x venv/bin/python ] || { echo "Rode primeiro a instalacao descrita no README.md."; exit 1; }
exec venv/bin/python -m rvn servir --host 127.0.0.1 --porta 8080
