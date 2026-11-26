package rooms

import (
	"math"
	"testing"

	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	test20 "gno.land/r/tradewindow/testing/token20"
)

// Attacks on the escrow, one per guarantee in docs/SECURITY-REVIEW.md.
// Each test plays the attacker and checks that nothing moved.

// T1. Bait and switch: bob changes his side after alice got ready, then
// gets ready himself. Alice's mark named the old version, so nothing
// settles, and the old version cannot be used again.
func TestThreatBaitAndSwitch(cur realm, t *testing.T) {
	alice := testutils.TestAddress("t1-alice")
	bob := testutils.TestAddress("t1-bob")
	id := openFunded(cur, alice, bob, 5_000_000, 500)
	r := mustRoom(id)
	seen := r.version

	testing.SetRealm(testing.NewUserRealm(alice))
	Lock(cross(cur), id, seen)

	testing.SetRealm(testing.NewUserRealm(bob))
	WithdrawToken(cross(cur), id, tst, 499) // leaves 1 token on his side
	uassert.Equal(t, "locked", Lock(cross(cur), id, r.version))
	uassert.Equal(t, StatusOpen, r.status)
	uassert.AbortsWithMessage(t, cur, "the room changed: review version "+idString(r.version)+" and lock again", func() {
		Lock(cross(cur), id, seen)
	})
}

// T2. Nobody but the depositor can take a deposit out: not the other
// party, not a stranger, not the admin.
func TestThreatOnlyTheOwnerWithdraws(cur realm, t *testing.T) {
	alice := testutils.TestAddress("t2-alice")
	bob := testutils.TestAddress("t2-bob")
	mallory := testutils.TestAddress("t2-mallory")
	id := openFunded(cur, alice, bob, 3_000_000, 300)

	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "you have not deposited that asset", func() {
		WithdrawCoins(cross(cur), id, "ugnot", 3_000_000)
	})
	testing.SetRealm(testing.NewUserRealm(mallory))
	uassert.AbortsWithMessage(t, cur, "only the two parties of this room can do that", func() {
		WithdrawToken(cross(cur), id, tst, 300)
	})
	admin = mallory
	defer func() { admin = "" }()
	uassert.AbortsWithMessage(t, cur, "only the two parties of this room can do that", func() {
		WithdrawCoins(cross(cur), id, "ugnot", 1)
	})
	uassert.AbortsWithMessage(t, cur, "only the two parties can cancel a room before it expires", func() {
		Cancel(cross(cur), id)
	})
}

// T3. After expiry anyone may cancel, but the deposits go to their owners,
// never to the account that cancels.
func TestThreatExpiredCancelPaysOwners(cur realm, t *testing.T) {
	alice := testutils.TestAddress("t3-alice")
	bob := testutils.TestAddress("t3-bob")
	mallory := testutils.TestAddress("t3-mallory")
	id := openFunded(cur, alice, bob, 2_000_000, 200)
	r := mustRoom(id)
	r.expiresAt = r.createdAt - 1

	aliceCoins, bobTokens := coinBalance(alice), test20.Token.BalanceOf(bob)
	malloryCoins, malloryTokens := coinBalance(mallory), test20.Token.BalanceOf(mallory)
	testing.SetRealm(testing.NewUserRealm(mallory))
	Cancel(cross(cur), id)
	uassert.Equal(t, aliceCoins+2_000_000, coinBalance(alice))
	uassert.Equal(t, bobTokens+200, test20.Token.BalanceOf(bob))
	uassert.Equal(t, malloryCoins, coinBalance(mallory))
	uassert.Equal(t, malloryTokens, test20.Token.BalanceOf(mallory))
}

// T4. While a Fill moves assets in, the room is held: nothing an NFT's
// transfer hook could call reaches it.
func TestThreatRoomIsHeldDuringFill(cur realm, t *testing.T) {
	alice := testutils.TestAddress("t4-alice")
	bob := testutils.TestAddress("t4-bob")
	id := openFunded(cur, alice, bob, 1_000_000, 100)
	r := mustRoom(id)
	r.status = statusFilling
	defer func() { r.status = StatusOpen }()

	held := "this room is filling"
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, held, func() { WithdrawToken(cross(cur), id, tst, 100) })
	uassert.AbortsWithMessage(t, cur, held, func() { DepositToken(cross(cur), id, tst, 1) })
	uassert.AbortsWithMessage(t, cur, held, func() { Lock(cross(cur), id, r.version) })
	uassert.AbortsWithMessage(t, cur, held, func() { Unlock(cross(cur), id) })
	uassert.AbortsWithMessage(t, cur, held, func() { Cancel(cross(cur), id) })
	uassert.AbortsWithMessage(t, cur, held, func() { Fill(cross(cur), id, r.version) })
	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, held, func() { Offer(cross(cur), id, r.version, "coin 1 ugnot") })
}

// T5. An approval to this realm cannot be spent by anyone else: the realm
// only ever pulls from the account that is calling it.
func TestThreatApprovalsOnlyServeTheirOwner(cur realm, t *testing.T) {
	alice := testutils.TestAddress("t5-alice")
	bob := testutils.TestAddress("t5-bob")
	mallory := testutils.TestAddress("t5-mallory")
	fundTokens(bob, 1_000) // bob left a standing approval of 1,000

	testing.SetRealm(testing.NewUserRealm(mallory))
	id := Open(cross(cur), alice.String(), 0)
	uassert.AbortsWithMessage(t, cur, "insufficient balance", func() { DepositToken(cross(cur), id, tst, 1_000) })

	offer, v := offerTokens(cur, alice, "", 10, "token 1000 "+tst)
	testing.SetRealm(testing.NewUserRealm(mallory))
	uassert.AbortsWithMessage(t, cur, "you do not have enough TT", func() { Fill(cross(cur), offer, v) })
	uassert.Equal(t, int64(1_000), test20.Token.BalanceOf(bob))
}

// T6. A code realm cannot pretend coins arrived: only a direct call from
// the signing account can deposit coins.
func TestThreatNoCoinsFromCode(cur realm, t *testing.T) {
	alice := testutils.TestAddress("t6-alice")
	testing.SetRealm(testing.NewUserRealm(alice))
	id := Open(cross(cur), "", 0)
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/tradewindow/testing/forger"))
	uassert.AbortsWithMessage(t, cur, "send coins with a direct call from your account", func() { DepositCoins(cross(cur), id) })
}

// T7. Amounts cannot wrap around: a side's total of one asset stays within
// int64.
func TestThreatNoOverflow(cur realm, t *testing.T) {
	s := &side{}
	s.add(KindCoin, "ugnot", math.MaxInt64)
	uassert.PanicsWithMessage(t, cur, "amount is too large", func() { s.add(KindCoin, "ugnot", 1) })
	uassert.Equal(t, int64(math.MaxInt64), s.assets[0].amount)
}
