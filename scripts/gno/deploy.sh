#!/usr/bin/env bash
# Deploys the Trade Window realms with gnokey: rooms (the trade rooms and
# their custody) and board (public listings). Only production files are
# sent; tests stay in the repository.
#
#   scripts/gno/deploy.sh <gnokey-key> <namespace> [onyx|mainnet|local]
#
# namespace is your g1 address or a name you registered with
# register-name.sh. The realms land at gno.land/r/<namespace>/rooms and
# gno.land/r/<namespace>/board. The deploying key becomes the rooms admin
# and treasury: it can pause new activity, set the fee for rooms opened
# later (at most 1%), move the treasury and verify assets (each counting a
# day later), and it can never move a deposit. Hand both roles to your own
# wallet right after deploying: SetTreasury, then ProposeAdmin and
# AcceptAdmin (docs/CONTRACT.md).
#
# Onyx and mainnet park new packages until the gpao approval oracle enables
# them, usually within a few blocks; the script waits for that.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
. "$here/networks.sh"

key="${1:?gnokey key name or address}"
ns="${2:?namespace: your g1 address or a registered nym- name}"
net="${3:-onyx}"
network_config "$net"
if [ "$CHAIN_ID" = gnoland-1 ] && [ "${CONFIRM_MAINNET:-}" != yes ]; then
  echo "Refusing to deploy to mainnet without CONFIRM_MAINNET=yes." >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf -- "${work:?}"' EXIT

# Unattended local runs only: GNOKEY_PASSWORD_STDIN=1 makes gnokey read the
# key password from stdin instead of asking for it.
password=""
if [ "${GNOKEY_PASSWORD_STDIN:-}" = 1 ]; then IFS= read -r password || true; fi
addpkg() {
  if [ "${GNOKEY_PASSWORD_STDIN:-}" = 1 ]; then
    printf '%s\n' "$password" | gnokey maketx addpkg "$@" -insecure-password-stdin "$key"
  else
    gnokey maketx addpkg "$@" "$key"
  fi
}

for realm in rooms board; do
  path="gno.land/r/$ns/$realm"
  dir="$work/$realm"
  mkdir -p "$dir"
  for f in "$root/gno/realms/tradewindow/$realm"/*.gno "$root/gno/realms/tradewindow/$realm/gnomod.toml"; do
    case "$f" in *_test.gno) ;; *) cp "$f" "$dir/" ;; esac
  done
  if gnokey query vm/qeval --data "$path.Render(\"\")" -remote "$REMOTE" >/dev/null 2>&1; then
    echo "$path is already deployed on $CHAIN_ID; skipping it."
    continue
  fi
  # The rooms deploy used 98.7 million gas on a local chain with gno.land's
  # parameters (preprocessing alone is 1,250 gas a byte): 200 million leaves room.
  echo "Deploying $path to $CHAIN_ID"
  addpkg \
    -pkgpath "$path" -pkgdir "$dir" \
    -gas-fee 1000000ugnot -gas-wanted 200000000 -max-deposit 10000000ugnot \
    -chainid "$CHAIN_ID" -remote "$REMOTE" -broadcast

  printf 'Waiting for %s to become callable' "$path"
  for _ in $(seq 1 60); do
    if gnokey query vm/qeval --data "$path.Render(\"\")" -remote "$REMOTE" >/dev/null 2>&1; then
      echo " done."
      break
    fi
    printf '.'
    sleep 5
  done
done

rooms_addr="$(gnokey query vm/qeval --data "gno.land/r/$ns/rooms.Address()" -remote "$REMOTE" 2>/dev/null | sed -n 's/^data: ("\(.*\)" string)$/\1/p')"
cat <<OUT

Deployed. Frontend environment for this network:

  NEXT_PUBLIC_GNO_CHAIN_ID=$CHAIN_ID
  NEXT_PUBLIC_GNO_RPC_URL=$REMOTE
  NEXT_PUBLIC_GNO_WEB_URL=$GNOWEB
  NEXT_PUBLIC_GNO_ROOMS_PATH=gno.land/r/$ns/rooms
  NEXT_PUBLIC_GNO_BOARD_PATH=gno.land/r/$ns/board

Rooms realm address (approve this for GRC20 and NFT deposits): ${rooms_addr:-query failed}
On gnoweb: $GNOWEB/r/$ns/rooms and $GNOWEB/r/$ns/board
OUT
