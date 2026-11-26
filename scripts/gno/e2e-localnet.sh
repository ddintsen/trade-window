#!/usr/bin/env bash
# End-to-end check of the realms on a throwaway local chain, with real
# signed transactions. Starts gnodev, deploys rooms and board, runs a full
# GNOT <-> wugnot swap plus the refusals that protect it, the service fee,
# an NFT swap through a test collection that registers itself with rooms,
# and offers that fill in one transaction, then stops.
#
#   scripts/gno/e2e-localnet.sh
#
# Needs gno, gnokey and gnodev built from the chain/mainnet branch of
# github.com/gnolang/gno, and free ports 26657 and 8888.
set -euo pipefail
export PATH="$(go env GOPATH 2>/dev/null || echo "$HOME/go")/bin:$PATH"
root="$(cd "$(dirname "$0")/../.." && pwd)"
remote=http://127.0.0.1:26657
work="$(mktemp -d)"
export GNOHOME="$work/gnohome"
devpid=""
cleanup() {
  [ -n "$devpid" ] && kill "$devpid" 2>/dev/null || true
  rm -rf -- "${work:?}"
}
trap cleanup EXIT

pass=0
fail=0
check() { # check <label> <haystack> <needle>
  if printf '%s' "$2" | grep -qF -- "$3"; then
    pass=$((pass + 1)); echo "  ok    $1"
  else
    fail=$((fail + 1)); echo "  FAIL  $1"
    printf '        expected to find: %s\n' "$3"
    printf '%s\n' "$2" | grep -E "Data:|errors.go:[0-9]+ -|VM panic|^OK|GAS" | head -6 | sed 's/^/        /' || true
  fi
}

addr_of() { gnokey list | sed -n "s/.*$1 (local) - addr: \(g1[a-z0-9]*\).*/\1/p"; }
for name in alice bob carol dave; do printf '\n\n' | gnokey add --insecure-password-stdin "$name" >/dev/null 2>&1; done
alice="$(addr_of alice)"; bob="$(addr_of bob)"; carol="$(addr_of carol)"; dave="$(addr_of dave)"

mkdir -p "$work/empty"
(cd "$work/empty" && exec gnodev local -no-watch -no-web=false \
  -add-account "$alice=100000000000ugnot" -add-account "$bob=100000000000ugnot" -add-account "$carol=100000000000ugnot" \
  -paths gno.land/r/nt/grc20reg/v0,gno.land/r/gnoland/wugnot >"$work/gnodev.log" 2>&1) &
devpid=$!
ready=no
for _ in $(seq 1 90); do
  if gnokey query "auth/accounts/$alice" -remote "$remote" 2>/dev/null | grep -q '"account_number"'; then ready=yes; break; fi
  sleep 1
done
if [ "$ready" != yes ]; then
  echo "gnodev did not come up:"; tail -20 "$work/gnodev.log"; exit 1
fi

tx() { # tx <key> <pkgpath> <func> <send> [args...]
  local key=$1 pkg=$2 fn=$3 send=$4; shift 4
  local args=()
  for a in "$@"; do args+=(-args "$a"); done
  echo "" | gnokey maketx call -pkgpath "$pkg" -func "$fn" ${send:+-send "$send"} "${args[@]}" \
    -gas-fee 1000000ugnot -gas-wanted 60000000 -broadcast -chainid dev -remote "$remote" \
    -insecure-password-stdin "$key" 2>&1 || true
}
q() { gnokey query vm/qeval --data "$1" -remote "$remote" 2>&1 | sed -n 's/^data: //p'; }

echo "Deploying"
for realm in rooms board; do
  dir="$work/pkg-$realm"; mkdir -p "$dir"
  for f in "$root/gno/realms/tradewindow/$realm"/*.gno "$root/gno/realms/tradewindow/$realm/gnomod.toml"; do
    case "$f" in *_test.gno) ;; *) cp "$f" "$dir/" ;; esac
  done
  out="$(echo "" | gnokey maketx addpkg -pkgpath "gno.land/r/tradewindow/$realm" -pkgdir "$dir" \
    -gas-fee 1000000ugnot -gas-wanted 100000000 -max-deposit 10000000ugnot -broadcast -chainid dev \
    -remote "$remote" -insecure-password-stdin alice 2>&1 || true)"
  check "addpkg $realm" "$out" "OK!"
done

R=gno.land/r/tradewindow/rooms
B=gno.land/r/tradewindow/board
W=gno.land/r/gnoland/wugnot
WK=gno.land/r/gnoland/wugnot.wugnot
raddr="$(q "$R.Address()" | sed 's/^("\(.*\)" string)$/\1/')"

echo "Fee: 0.5% on settlement, paid to a treasury"
check "fee is 0.5% by default" "$(q "$R.FeeBps()")" "(50 uint64)"
check "a stranger cannot move the treasury" "$(tx bob $R SetTreasury "" "$bob")" "admin only"
check "admin sets dave as treasury" "$(tx alice $R SetTreasury "" "$dave")" "OK!"
check "the fee is capped" "$(tx alice $R SetFee "" 101)" "the fee can be at most 100 basis points"

echo "Swap: 5 GNOT from alice for 3 wugnot from bob"
check "deployer is admin" "$(q "$R.Admin()")" "$alice"
check "open room" "$(tx alice $R Open "" "$bob" 0)" "OK!"
check "alice deposits GNOT" "$(tx alice $R DepositCoins 5000000ugnot 1)" "OK!"
check "bob wraps GNOT" "$(tx bob $W Deposit 3000000ugnot)" "OK!"
check "bob approves the room realm" "$(tx bob $W Approve "" "$raddr" 3000000)" "OK!"
check "bob deposits wugnot" "$(tx bob $R DepositToken "" 1 "$WK" 3000000)" "OK!"
check "room shows version 3" "$(q "$R.RoomJSON(1)")" '\"version\":3'
check "stranger cannot lock" "$(tx carol $R Lock "" 1 3)" "only the two parties of this room can do that"
check "stale version refused" "$(tx alice $R Lock "" 1 2)" "the room changed: review version 3 and lock again"
check "coins on a lock refused" "$(tx alice $R Lock 1ugnot 1 3)" "this call does not take coins"
check "alice locks" "$(tx alice $R Lock "" 1 3)" "OK!"
before="$(gnokey query "bank/balances/$bob" -remote "$remote" | sed -n 's/^data: "\([0-9]*\)ugnot"$/\1/p')"
check "bob locks and settles" "$(tx bob $R Lock "" 1 3)" "OK!"
after="$(gnokey query "bank/balances/$bob" -remote "$remote" | sed -n 's/^data: "\([0-9]*\)ugnot"$/\1/p')"
check "bob received GNOT" "$((after - before > 3000000))" "1"
check "alice received wugnot less 0.5%" "$(q "$W.BalanceOf(\"$alice\")")" "(2985000 int64)"
check "the treasury got the token fee" "$(q "$W.BalanceOf(\"$dave\")")" "(15000 int64)"
check "stats count the coin fee" "$(q "$R.StatsJSON()")" '{\"kind\":\"coin\",\"denom\":\"ugnot\",\"amount\":\"25000\"}'
check "room settled" "$(q "$R.RoomJSON(1)")" '\"status\":\"settled\"'

echo "Cancel returns deposits"
check "open seat room" "$(tx bob $R Open "" "" 60)" "OK!"
check "alice joins" "$(tx alice $R Join "" 2)" "OK!"
check "alice approves" "$(tx alice $W Approve "" "$raddr" 1000000)" "OK!"
check "alice deposits wugnot" "$(tx alice $R DepositToken "" 2 "$WK" 1000000)" "OK!"
check "wugnot left alice" "$(q "$W.BalanceOf(\"$alice\")")" "(1985000 int64)"
check "alice cancels" "$(tx alice $R Cancel "" 2)" "OK!"
check "wugnot came back in full" "$(q "$W.BalanceOf(\"$alice\")")" "(2985000 int64)"

echo "Board"
check "carol posts" "$(tx carol $B Post "" sell "40,000 GNOT" "wugnot 1:1" "" 7)" "OK!"
check "listing is open" "$(q "$B.OpenJSON(\"\", 0, 10)")" '\"give\":\"40,000 GNOT\"'
check "carol closes" "$(tx carol $B Close "" 1)" "OK!"
check "gnoweb renders rooms" "$(curl -s http://127.0.0.1:8888/r/tradewindow/rooms)" "Trade Window rooms"

echo "NFT: a lantern from bob for 2 GNOT from alice"
L=gno.land/r/tradewindow/testing/lanterns
LK=$L.LAMP
dir="$work/pkg-lanterns"; mkdir -p "$dir"
cp "$root/gno/testing/lanterns/"*.gno "$root/gno/testing/lanterns/gnomod.toml" "$dir/"
out="$(echo "" | gnokey maketx addpkg -pkgpath "$L" -pkgdir "$dir" \
  -gas-fee 1000000ugnot -gas-wanted 100000000 -max-deposit 10000000ugnot -broadcast -chainid dev \
  -remote "$remote" -insecure-password-stdin carol 2>&1 || true)"
check "addpkg test collection" "$out" "OK!"
check "it registered itself" "$(q "$R.CollectionsJSON(0, 10)")" "\\\"key\\\":\\\"$LK\\\""
check "bob mints lantern 7" "$(tx bob $L Mint "" 7)" "OK!"
check "the wallet read lists it" "$(q "$R.OwnedJSON(\"$bob\", 0, 10)")" '\"tokenId\":\"7\",\"approved\":false'
check "open room 3 as an open market" "$(tx alice $R OpenMarket "" "$bob" 0)" "OK!"
check "alice deposits GNOT" "$(tx alice $R DepositCoins 2000000ugnot 3)" "OK!"
check "unapproved NFT refused" "$(tx bob $R DepositNFT "" 3 "$LK" 7)" "approve this realm for that NFT first"
check "someone else's NFT refused" "$(tx alice $R DepositNFT "" 3 "$LK" 7)" "you do not own that NFT"
check "bob approves the room realm" "$(tx bob $L Approve "" "$raddr" 7)" "OK!"
check "bob deposits the lantern" "$(tx bob $R DepositNFT "" 3 "$LK" 7)" "OK!"
check "the room holds it" "$(q "$R.RoomJSON(3)")" "\\\"kind\\\":\\\"nft\\\",\\\"denom\\\":\\\"$LK#7\\\",\\\"amount\\\":\\\"1\\\""
check "bob takes it back" "$(tx bob $R WithdrawNFT "" 3 "$LK" 7)" "OK!"
check "bob owns it again" "$(q "$R.NFTJSON(\"$LK\", \"7\")")" "\\\"owner\\\":\\\"$bob\\\""
check "bob approves again" "$(tx bob $L Approve "" "$raddr" 7)" "OK!"
check "bob puts it back" "$(tx bob $R DepositNFT "" 3 "$LK" 7)" "OK!"
check "alice locks version 5" "$(tx alice $R Lock "" 3 5)" "OK!"
check "bob locks and settles" "$(tx bob $R Lock "" 3 5)" "OK!"
check "alice owns the lantern" "$(q "$R.NFTJSON(\"$LK\", \"7\")")" "\\\"owner\\\":\\\"$alice\\\""
check "gnoweb shows the NFT" "$(curl -s http://127.0.0.1:8888/r/tradewindow/rooms:room/3)" "NFT Lanterns #7"

echo "Offer: 0.2 wugnot from bob for 0.7 GNOT, filled by anyone in one call"
check "bob wraps more GNOT" "$(tx bob $W Deposit 1000000ugnot)" "OK!"
check "bob opens room 4 with an open seat" "$(tx bob $R Open "" "" 60)" "OK!"
check "bob approves" "$(tx bob $W Approve "" "$raddr" 200000)" "OK!"
check "bob deposits wugnot" "$(tx bob $R DepositToken "" 4 "$WK" 200000)" "OK!"
check "bob offers it for 0.7 GNOT" "$(tx bob $R Offer "" 4 2 "coin 700000 ugnot")" "OK!"
check "the offer is public" "$(q "$R.RoomJSON(4)")" '\"want\":[{\"kind\":\"coin\",\"denom\":\"ugnot\",\"amount\":\"700000\"}]'
check "joining an offer is refused" "$(tx carol $R Join "" 4)" "this room is an offer: fill it instead"
check "the wrong coins are refused" "$(tx carol $R Fill 600000ugnot 4 3)" "attach exactly 700000ugnot"
check "a stale version is refused" "$(tx carol $R Fill 700000ugnot 4 2)" "the offer changed: review version 3 and fill again"
check "carol fills it" "$(tx carol $R Fill 700000ugnot 4 3)" "OK!"
check "room 4 settled" "$(q "$R.RoomJSON(4)")" '\"status\":\"settled\"'
check "carol received wugnot less 0.5%" "$(q "$W.BalanceOf(\"$carol\")")" "(199000 int64)"

echo "Offer: the lantern from alice for 0.1 wugnot, approval and fill"
check "open room 5 for carol, open market" "$(tx alice $R OpenMarket "" "$carol" 0)" "OK!"
check "alice approves the lantern" "$(tx alice $L Approve "" "$raddr" 7)" "OK!"
check "alice puts the lantern in" "$(tx alice $R DepositNFT "" 5 "$LK" 7)" "OK!"
check "alice offers it for 0.1 wugnot" "$(tx alice $R Offer "" 5 2 "token 100000 $WK")" "OK!"
check "bob is not the invited account" "$(tx bob $R Fill "" 5 3)" "this offer is for another account"
check "carol needs an approval first" "$(tx carol $R Fill "" 5 3)" "approve this realm for wugnot first"
check "carol approves" "$(tx carol $W Approve "" "$raddr" 100000)" "OK!"
check "carol fills it" "$(tx carol $R Fill "" 5 3)" "OK!"
check "carol owns the lantern" "$(q "$R.NFTJSON(\"$LK\", \"7\")")" "\\\"owner\\\":\\\"$carol\\\""

echo "Verified assets: ordinary rooms take only them"
check "open ordinary room 6 for carol" "$(tx alice $R Open "" "$carol" 0)" "OK!"
check "the unverified lantern stays out" "$(tx carol $R DepositNFT "" 6 "$LK" 7)" "this room takes only verified assets"
check "GNOT is verified from the start" "$(tx carol $R DepositCoins 1000ugnot 6)" "OK!"
check "a stranger cannot verify" "$(tx bob $R Verify "" nft "$LK" "looks fine")" "admin only"
check "the admin proposes the lanterns" "$(tx alice $R Verify "" nft "$LK" "Test collection, local chain only.")" "OK!"
check "it waits a day, in public" "$(q "$R.VerifiedJSON(0, 10)")" '\"active\":false'
check "still out until then" "$(tx carol $R DepositNFT "" 6 "$LK" 7)" "this room takes only verified assets"

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
