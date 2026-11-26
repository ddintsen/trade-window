#!/usr/bin/env bash
# Runs the realm tests. Needs gno from the chain/mainnet branch of
# github.com/gnolang/gno (the code Onyx and mainnet run).
set -euo pipefail
export PATH="$(go env GOPATH 2>/dev/null || echo "$HOME/go")/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/gno"
gno test ./realms/...
