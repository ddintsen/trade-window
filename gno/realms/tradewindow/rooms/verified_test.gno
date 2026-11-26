package rooms

import (
	"chain"
	"strings"
	"testing"
	"time"

	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	test20 "gno.land/r/tradewindow/testing/token20"
)

func TestVerifyRules(cur realm, t *testing.T) {
	verifyTestAssets()
	boss := testutils.TestAddress("ver-admin")
	alice := testutils.TestAddress("ver-alice")
	admin = boss
	defer func() {
		admin = ""
		verifyTestAssets()
	}()

	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "admin only", func() { Verify(cross(cur), KindToken, tst, "fine") })

	testing.SetRealm(testing.NewUserRealm(boss))
	uassert.AbortsWithMessage(t, cur, "kind must be coin, token or nft", func() { Verify(cross(cur), "gift", tst, "fine") })
	uassert.AbortsWithMessage(t, cur, "token is not in the GRC20 registry", func() {
		Verify(cross(cur), KindToken, "gno.land/r/nobody/fake.USDC", "looks real")
	})
	uassert.AbortsWithMessage(t, cur, "collection is not registered with rooms", func() {
		Verify(cross(cur), KindNFT, "gno.land/r/nobody/art.ART", "nice")
	})
	uassert.AbortsWithMessage(t, cur, "give a reason of 1 to 280 bytes", func() { Verify(cross(cur), KindToken, tst, " ") })
	uassert.AbortsWithMessage(t, cur, "give a reason of 1 to 280 bytes", func() {
		Verify(cross(cur), KindToken, tst, strings.Repeat("x", 281))
	})
	uassert.AbortsWithMessage(t, cur, "the reason has a control character", func() { Verify(cross(cur), KindToken, tst, "a\nb") })

	// A new verification waits a day, and is public meanwhile.
	verified.Remove("token:" + tst)
	Verify(cross(cur), KindToken, tst, "Test token with no mint after launch.")
	now := time.Now().Unix()
	uassert.False(t, isVerified(KindToken, tst, now))
	uassert.True(t, isVerified(KindToken, tst, now+VerifyDelay))
	uassert.True(t, strings.Contains(VerifiedJSON(0, 50), `"key":"`+tst+`","reason":"Test token with no mint after launch.","since":`))
	uassert.True(t, strings.Contains(VerifiedJSON(0, 50), `"kind":"coin","key":"ugnot","reason":"The native coin of gno.land.","since":0,"active":true`))

	// Removing it counts at once.
	Unverify(cross(cur), KindToken, tst, "Issuer can burn balances.")
	uassert.False(t, isVerified(KindToken, tst, now+VerifyDelay))
	uassert.AbortsWithMessage(t, cur, "that asset is not verified", func() { Unverify(cross(cur), KindToken, tst, "again") })
}

func TestOpenMarketTakesAnyRegisteredAsset(cur realm, t *testing.T) {
	alice := testutils.TestAddress("om-alice")
	testing.SetRealm(testing.NewUserRealm(alice))

	plain := Open(cross(cur), "", 0)
	withCoins(chain.Coins{{Denom: "uscam", Amount: 10}})
	uassert.AbortsWithMessage(t, cur, "this room takes only verified assets, and uscam is not verified: trade it in an open-market room", func() {
		DepositCoins(cross(cur), plain)
	})

	testing.SetOriginSend(nil)
	market := OpenMarket(cross(cur), "", 0)
	withCoins(chain.Coins{{Denom: "uscam", Amount: 10}})
	DepositCoins(cross(cur), market)
	testing.SetOriginSend(nil)
	uassert.True(t, mustRoom(market).openMarket)
	uassert.False(t, mustRoom(plain).openMarket)
	uassert.True(t, strings.Contains(RoomJSON(market), `"openMarket":true`))

	// An ordinary room's offer cannot ask for an unverified asset either.
	withCoins(ugnot(5))
	DepositCoins(cross(cur), plain)
	testing.SetOriginSend(nil)
	uassert.AbortsWithMessage(t, cur, "this room takes only verified assets, and uscam is not verified: trade it in an open-market room", func() {
		Offer(cross(cur), plain, mustRoom(plain).version, "coin 10 uscam")
	})
}

// T8. A worthless look-alike cannot enter an ordinary room.
func TestThreatScamAssetStaysOut(cur realm, t *testing.T) {
	alice := testutils.TestAddress("t8-alice")
	bob := testutils.TestAddress("t8-bob")
	id := openFunded(cur, alice, bob, 1_000, 10)
	verified.Remove("token:" + tst) // as if TT were a fake nobody verified
	defer verifyTestAssets()

	fundTokens(bob, 5)
	verified.Remove("token:" + tst)
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "this room takes only verified assets, and "+tst+" is not verified: trade it in an open-market room", func() {
		DepositToken(cross(cur), id, tst, 5)
	})
}

// T9. An asset found bad mid-trade stops the room from settling, and
// everyone still gets their own items back.
func TestThreatUnverifiedMidTradeCannotSettle(cur realm, t *testing.T) {
	alice := testutils.TestAddress("t9-alice")
	bob := testutils.TestAddress("t9-bob")
	boss := testutils.TestAddress("t9-admin")
	id := openFunded(cur, alice, bob, 2_000_000, 20)
	r := mustRoom(id)
	testing.SetRealm(testing.NewUserRealm(alice))
	Lock(cross(cur), id, r.version)

	admin = boss
	defer func() {
		admin = ""
		verifyTestAssets()
	}()
	testing.SetRealm(testing.NewUserRealm(boss))
	Unverify(cross(cur), KindToken, tst, "Found an admin mint.")

	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, tst+" is no longer verified, so this room cannot settle: take your items back", func() {
		Lock(cross(cur), id, r.version)
	})
	WithdrawToken(cross(cur), id, tst, 20)
	testing.SetRealm(testing.NewUserRealm(alice))
	Cancel(cross(cur), id)
	uassert.Equal(t, StatusCancelled, r.status)
}

// T10. A stolen admin key cannot make a fake count at once: the
// verification waits a day in public.
func TestThreatStolenAdminWaits(cur realm, t *testing.T) {
	alice := testutils.TestAddress("t10-alice")
	mallory := testutils.TestAddress("t10-mallory")
	verified.Remove("token:" + tst)
	admin = mallory
	defer func() {
		admin = ""
		verifyTestAssets()
	}()
	testing.SetRealm(testing.NewUserRealm(mallory))
	Verify(cross(cur), KindToken, tst, "Totally real.")

	test20.Ledger.Mint(alice, 5)
	test20.Ledger.Approve(alice, realmAddr, 5)
	testing.SetRealm(testing.NewUserRealm(alice))
	id := Open(cross(cur), "", 0)
	uassert.AbortsWithMessage(t, cur, "this room takes only verified assets, and "+tst+" is not verified: trade it in an open-market room", func() {
		DepositToken(cross(cur), id, tst, 5)
	})
}
