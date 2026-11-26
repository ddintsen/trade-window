#!/usr/bin/env bash
# Registers a readable namespace, e.g. nym-tradewindow001, so the realms can
# live at gno.land/r/<name>/rooms instead of gno.land/r/<g1 address>/rooms.
#
#   scripts/gno/register-name.sh <gnokey-key> <nym-name> [onyx|mainnet|local]
#
# The name must match nym-<5 to 13 lowercase letters><3 digits> and its
# letters may not start with gno, gl, atom, atone, photon or cosmos.
# Registration is free while the registry price is zero.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
. "$here/networks.sh"

key="${1:?gnokey key name or address}"
name="${2:?name, e.g. nym-tradewindow001}"
network_config "${3:-onyx}"
if [ "$CHAIN_ID" = gnoland-1 ] && [ "${CONFIRM_MAINNET:-}" != yes ]; then
  echo "Refusing to touch mainnet without CONFIRM_MAINNET=yes." >&2
  exit 1
fi

gnokey maketx call \
  -pkgpath gno.land/r/sys/namereg/v0 -func Register -args "$name" \
  -gas-fee 1000000ugnot -gas-wanted 30000000 \
  -chainid "$CHAIN_ID" -remote "$REMOTE" -broadcast "$key"
echo "Registered $name on $CHAIN_ID. Deploy with: scripts/gno/deploy.sh $key $name ${3:-onyx}"
