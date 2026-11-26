package rooms

import (
	"chain"
	"chain/banker"
	"strings"
	"testing"

	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
	test20 "gno.land/r/tradewindow/testing/token20"
)

const tst = "gno.land/r/tradewindow/testing/token20.TT"

var realmAddr = chain.PackageAddress("gno.land/r/tradewindow/rooms")

// withCoins makes the next call look like it carried coins, and puts those
// coins where the bank would: at this realm's address.
func withCoins(coins chain.Coins) {
	testing.SetOriginSend(coins)
	testing.IssueCoins(realmAddr, coins)
}

func ugnot(n int64) chain.Coins {
	return chain.Coins{{Denom: "ugnot", Amount: n}}
}

func coinBalance(who address) int64 {
	return banker.NewReadonlyBanker().GetCoin(who, "ugnot")
}

// verifyTestAssets lets ordinary rooms take the test token and the test
// collection, as the admin's verification would after its delay.
func verifyTestAssets() {
	verified.Set("token:"+tst, &verification{reason: "test token"})
	verified.Set("nft:"+lanternsPath+".LAMP", &verification{reason: "test collection"})
}

func fundTokens(who address, amount int64) {
	verifyTestAssets()
	test20.Ledger.Mint(who, amount)
	test20.Ledger.Approve(who, realmAddr, amount)
}

// openFunded opens a room between maker and taker; the maker puts in
// makerUgnot and the taker puts in takerTst of test20.
func openFunded(cur realm, maker, taker address, makerUgnot, takerTst int64) uint64 {
	testing.SetRealm(testing.NewUserRealm(maker))
	id := Open(cross(cur), taker.String(), 0)
	withCoins(ugnot(makerUgnot))
	DepositCoins(cross(cur), id)
	testing.SetOriginSend(nil)

	fundTokens(taker, takerTst)
	testing.SetRealm(testing.NewUserRealm(taker))
	DepositToken(cross(cur), id, tst, takerTst)
	return id
}

func TestAddressIsRealm(t *testing.T) {
	uassert.Equal(t, realmAddr.String(), Address())
}

func TestOpenValidation(cur realm, t *testing.T) {
	alice := testutils.TestAddress("open-alice")
	bob := testutils.TestAddress("open-bob")
	testing.SetRealm(testing.NewUserRealm(alice))

	uassert.AbortsWithMessage(t, cur, "counterparty is not a valid address", func() {
		Open(cross(cur), "not-an-address", 0)
	})
	uassert.AbortsWithMessage(t, cur, "you cannot open a room with yourself", func() {
		Open(cross(cur), alice.String(), 0)
	})
	uassert.AbortsWithMessage(t, cur, "room lifetime must be between 10 minutes and 7 days", func() {
		Open(cross(cur), bob.String(), 5)
	})
	uassert.AbortsWithMessage(t, cur, "room lifetime must be between 10 minutes and 7 days", func() {
		Open(cross(cur), bob.String(), MaxTTLMinutes+1)
	})

	id := Open(cross(cur), " "+bob.String()+" ", 60)
	r := mustRoom(id)
	uassert.Equal(t, alice, r.maker.owner)
	uassert.Equal(t, bob, r.taker.owner)
	uassert.False(t, r.openSeat)
	uassert.Equal(t, uint64(1), r.version)
	uassert.Equal(t, StatusOpen, r.status)
	uassert.Equal(t, int64(3600), r.expiresAt-r.createdAt)

	open := Open(cross(cur), "", 0)
	uassert.True(t, mustRoom(open).openSeat)
	uassert.Equal(t, int64(DefaultTTLMinutes*60), mustRoom(open).expiresAt-mustRoom(open).createdAt)
}

func TestJoin(cur realm, t *testing.T) {
	alice := testutils.TestAddress("join-alice")
	bob := testutils.TestAddress("join-bob")
	carol := testutils.TestAddress("join-carol")

	testing.SetRealm(testing.NewUserRealm(alice))
	invite := Open(cross(cur), bob.String(), 0)
	seat := Open(cross(cur), "", 0)

	uassert.AbortsWithMessage(t, cur, "you opened this room", func() { Join(cross(cur), seat) })

	testing.SetRealm(testing.NewUserRealm(carol))
	uassert.AbortsWithMessage(t, cur, "this room is invite only", func() { Join(cross(cur), invite) })
	Join(cross(cur), seat)
	uassert.Equal(t, carol, mustRoom(seat).taker.owner)
	uassert.Equal(t, uint64(2), mustRoom(seat).version)

	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "the seat is already taken", func() { Join(cross(cur), seat) })
	uassert.AbortsWithMessage(t, cur, "room not found", func() { Join(cross(cur), 999999) })
}

func TestDepositCoinsGuards(cur realm, t *testing.T) {
	alice := testutils.TestAddress("dc-alice")
	bob := testutils.TestAddress("dc-bob")
	carol := testutils.TestAddress("dc-carol")

	testing.SetRealm(testing.NewUserRealm(alice))
	id := Open(cross(cur), bob.String(), 0)

	// Nothing attached.
	testing.SetOriginSend(nil)
	uassert.AbortsWithMessage(t, cur, "attach the coins to this call", func() { DepositCoins(cross(cur), id) })

	// A code realm in the middle could have spent the envelope.
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/evil/wrapper"))
	testing.SetOriginSend(ugnot(500))
	uassert.AbortsWithMessage(t, cur, "send coins with a direct call from your account", func() { DepositCoins(cross(cur), id) })

	// Strangers cannot deposit.
	testing.SetRealm(testing.NewUserRealm(carol))
	withCoins(ugnot(500))
	uassert.AbortsWithMessage(t, cur, "only the two parties of this room can do that", func() { DepositCoins(cross(cur), id) })

	// Deposits of the same denom merge and raise the version each time.
	testing.SetRealm(testing.NewUserRealm(alice))
	withCoins(ugnot(300))
	DepositCoins(cross(cur), id)
	withCoins(ugnot(200))
	DepositCoins(cross(cur), id)
	testing.SetOriginSend(nil)

	r := mustRoom(id)
	urequire.Equal(t, 1, len(r.maker.assets))
	uassert.Equal(t, int64(500), r.maker.assets[0].amount)
	uassert.Equal(t, KindCoin, r.maker.assets[0].kind)
	uassert.Equal(t, uint64(3), r.version)
}

func TestDepositTokenGuards(cur realm, t *testing.T) {
	alice := testutils.TestAddress("dt-alice")
	bob := testutils.TestAddress("dt-bob")

	testing.SetRealm(testing.NewUserRealm(alice))
	id := Open(cross(cur), bob.String(), 0)

	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "token is not in the GRC20 registry", func() {
		DepositToken(cross(cur), id, "gno.land/r/nobody/fake.FAKE", 10)
	})
	uassert.AbortsWithMessage(t, cur, "amount must be positive", func() {
		DepositToken(cross(cur), id, tst, 0)
	})

	// No allowance yet: the transfer fails and nothing is recorded.
	test20.Ledger.Mint(bob, 1_000)
	uassert.AbortsContains(t, cur, "allowance", func() {
		DepositToken(cross(cur), id, tst, 400)
	})
	uassert.Equal(t, 0, len(mustRoom(id).taker.assets))

	test20.Ledger.Approve(bob, realmAddr, 400)
	DepositToken(cross(cur), id, tst, 400)
	uassert.Equal(t, int64(600), test20.Token.BalanceOf(bob))
	r := mustRoom(id)
	urequire.Equal(t, 1, len(r.taker.assets))
	uassert.Equal(t, KindToken, r.taker.assets[0].kind)
	uassert.Equal(t, tst, r.taker.assets[0].denom)
	uassert.Equal(t, int64(400), r.taker.assets[0].amount)
}

func TestSwapSettlesOnSecondLock(cur realm, t *testing.T) {
	alice := testutils.TestAddress("swap-alice")
	bob := testutils.TestAddress("swap-bob")

	id := openFunded(cur, alice, bob, 2_000_000, 750)
	r := mustRoom(id)
	v := r.version

	aliceTokensBefore := test20.Token.BalanceOf(alice)
	bobCoinsBefore := coinBalance(bob)

	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.Equal(t, "locked", Lock(cross(cur), id, v))
	uassert.Equal(t, "locked", Lock(cross(cur), id, v)) // repeating is harmless
	uassert.Equal(t, StatusOpen, r.status)

	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.Equal(t, StatusSettled, Lock(cross(cur), id, v))

	uassert.Equal(t, StatusSettled, r.status)
	uassert.Equal(t, bob, r.closedBy)
	uassert.Equal(t, bobCoinsBefore+2_000_000, coinBalance(bob))
	uassert.Equal(t, aliceTokensBefore+750, test20.Token.BalanceOf(alice))

	// A settled room accepts nothing more.
	uassert.AbortsWithMessage(t, cur, "this room is settled", func() { Lock(cross(cur), id, v) })
	uassert.AbortsWithMessage(t, cur, "this room is settled", func() { WithdrawToken(cross(cur), id, tst, 1) })
	uassert.AbortsWithMessage(t, cur, "this room is settled", func() { Cancel(cross(cur), id) })
}

func TestLockNeedsCurrentVersionAndBothSides(cur realm, t *testing.T) {
	alice := testutils.TestAddress("lv-alice")
	bob := testutils.TestAddress("lv-bob")

	testing.SetRealm(testing.NewUserRealm(alice))
	seat := Open(cross(cur), "", 0)
	withCoins(ugnot(1_000))
	DepositCoins(cross(cur), seat)
	testing.SetOriginSend(nil)
	uassert.AbortsWithMessage(t, cur, "waiting for a counterparty to join", func() {
		Lock(cross(cur), seat, mustRoom(seat).version)
	})

	testing.SetRealm(testing.NewUserRealm(bob))
	Join(cross(cur), seat)
	v := mustRoom(seat).version
	uassert.AbortsWithMessage(t, cur, "both sides need at least one asset", func() { Lock(cross(cur), seat, v) })

	fundTokens(bob, 10)
	DepositToken(cross(cur), seat, tst, 10)
	uassert.AbortsWithMessage(t, cur, "the room changed: review version 4 and lock again", func() {
		Lock(cross(cur), seat, v)
	})
	uassert.Equal(t, "locked", Lock(cross(cur), seat, 4))
}

func TestChangeAfterLockNeedsNewLocks(cur realm, t *testing.T) {
	alice := testutils.TestAddress("chg-alice")
	bob := testutils.TestAddress("chg-bob")

	id := openFunded(cur, alice, bob, 1_000_000, 100)
	r := mustRoom(id)
	v := r.version

	testing.SetRealm(testing.NewUserRealm(alice))
	Lock(cross(cur), id, v)

	// Bob adds more. Alice's lock no longer matches the room.
	fundTokens(bob, 50)
	testing.SetRealm(testing.NewUserRealm(bob))
	DepositToken(cross(cur), id, tst, 50)
	uassert.Equal(t, v+1, r.version)
	uassert.Equal(t, "locked", Lock(cross(cur), id, v+1))
	uassert.Equal(t, StatusOpen, r.status)

	// Alice's stale lock cannot settle anything; she must lock again.
	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "the room changed: review version "+idString(v+1)+" and lock again", func() {
		Lock(cross(cur), id, v)
	})
	aliceBefore := test20.Token.BalanceOf(alice)
	uassert.Equal(t, StatusSettled, Lock(cross(cur), id, v+1))
	uassert.Equal(t, aliceBefore+150, test20.Token.BalanceOf(alice))
}

func TestWithdraw(cur realm, t *testing.T) {
	alice := testutils.TestAddress("wd-alice")
	bob := testutils.TestAddress("wd-bob")
	carol := testutils.TestAddress("wd-carol")

	id := openFunded(cur, alice, bob, 900, 300)
	r := mustRoom(id)

	testing.SetRealm(testing.NewUserRealm(alice))
	Lock(cross(cur), id, r.version)

	testing.SetRealm(testing.NewUserRealm(carol))
	uassert.AbortsWithMessage(t, cur, "only the two parties of this room can do that", func() {
		WithdrawCoins(cross(cur), id, "ugnot", 1)
	})

	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "you have less than that in the room", func() {
		WithdrawCoins(cross(cur), id, "ugnot", 901)
	})
	uassert.AbortsWithMessage(t, cur, "you have not deposited that asset", func() {
		WithdrawToken(cross(cur), id, tst, 1)
	})
	uassert.AbortsWithMessage(t, cur, "amount must be positive", func() {
		WithdrawCoins(cross(cur), id, "ugnot", 0)
	})

	before := coinBalance(alice)
	v := r.version
	WithdrawCoins(cross(cur), id, "ugnot", 400)
	uassert.Equal(t, before+400, coinBalance(alice))
	uassert.Equal(t, int64(500), r.maker.assets[0].amount)
	uassert.Equal(t, v+1, r.version)

	WithdrawCoins(cross(cur), id, "ugnot", 500)
	uassert.Equal(t, 0, len(r.maker.assets))

	testing.SetRealm(testing.NewUserRealm(bob))
	bobBefore := test20.Token.BalanceOf(bob)
	WithdrawToken(cross(cur), id, tst, 300)
	uassert.Equal(t, bobBefore+300, test20.Token.BalanceOf(bob))
	uassert.Equal(t, 0, len(r.taker.assets))
}

func TestUnlock(cur realm, t *testing.T) {
	alice := testutils.TestAddress("ul-alice")
	bob := testutils.TestAddress("ul-bob")

	id := openFunded(cur, alice, bob, 10, 10)
	r := mustRoom(id)

	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "you have not locked this version", func() { Unlock(cross(cur), id) })
	Lock(cross(cur), id, r.version)
	Unlock(cross(cur), id)
	uassert.Equal(t, uint64(0), r.maker.locked)

	// Bob's lock alone does not settle after Alice unlocked.
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.Equal(t, "locked", Lock(cross(cur), id, r.version))
	uassert.Equal(t, StatusOpen, r.status)
}

func TestCancelReturnsDeposits(cur realm, t *testing.T) {
	alice := testutils.TestAddress("cx-alice")
	bob := testutils.TestAddress("cx-bob")
	carol := testutils.TestAddress("cx-carol")

	id := openFunded(cur, alice, bob, 5_000, 70)
	r := mustRoom(id)

	testing.SetRealm(testing.NewUserRealm(carol))
	uassert.AbortsWithMessage(t, cur, "only the two parties can cancel a room before it expires", func() {
		Cancel(cross(cur), id)
	})

	aliceCoins := coinBalance(alice)
	bobTokens := test20.Token.BalanceOf(bob)
	testing.SetRealm(testing.NewUserRealm(bob))
	Cancel(cross(cur), id)
	uassert.Equal(t, StatusCancelled, r.status)
	uassert.Equal(t, bob, r.closedBy)
	uassert.Equal(t, aliceCoins+5_000, coinBalance(alice))
	uassert.Equal(t, bobTokens+70, test20.Token.BalanceOf(bob))

	uassert.AbortsWithMessage(t, cur, "this room is cancelled", func() { Cancel(cross(cur), id) })
	uassert.AbortsWithMessage(t, cur, "this room is cancelled", func() { Lock(cross(cur), id, r.version) })
}

func TestExpiry(cur realm, t *testing.T) {
	alice := testutils.TestAddress("ex-alice")
	bob := testutils.TestAddress("ex-bob")
	carol := testutils.TestAddress("ex-carol")

	testing.SetRealm(testing.NewUserRealm(alice))
	id := Open(cross(cur), bob.String(), MinTTLMinutes)
	withCoins(ugnot(800))
	DepositCoins(cross(cur), id)
	testing.SetOriginSend(nil)
	fundTokens(bob, 20)
	testing.SetRealm(testing.NewUserRealm(bob))
	DepositToken(cross(cur), id, tst, 20)
	r := mustRoom(id)

	// Ten minutes is 120 blocks of 5 seconds.
	testing.SkipHeights(121)

	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "this room has expired: withdraw or cancel to get deposits back", func() {
		Lock(cross(cur), id, r.version)
	})
	withCoins(ugnot(1))
	uassert.AbortsWithMessage(t, cur, "this room has expired: withdraw or cancel to get deposits back", func() {
		DepositCoins(cross(cur), id)
	})
	testing.SetOriginSend(nil)

	// Withdrawing still works after expiry.
	before := coinBalance(alice)
	WithdrawCoins(cross(cur), id, "ugnot", 300)
	uassert.Equal(t, before+300, coinBalance(alice))

	// Anyone may close an expired room; deposits go home.
	aliceBefore := coinBalance(alice)
	bobBefore := test20.Token.BalanceOf(bob)
	testing.SetRealm(testing.NewUserRealm(carol))
	Cancel(cross(cur), id)
	uassert.Equal(t, StatusCancelled, r.status)
	uassert.Equal(t, carol, r.closedBy)
	uassert.Equal(t, aliceBefore+500, coinBalance(alice))
	uassert.Equal(t, bobBefore+20, test20.Token.BalanceOf(bob))
}

func TestAssetCapPerSide(cur realm, t *testing.T) {
	alice := testutils.TestAddress("cap-alice")
	bob := testutils.TestAddress("cap-bob")

	testing.SetRealm(testing.NewUserRealm(alice))
	id := OpenMarket(cross(cur), bob.String(), 0) // the ucap* coins are not verified
	for i := 0; i < MaxAssetsPerSide; i++ {
		withCoins(chain.Coins{{Denom: "ucap" + string(rune('a'+i)), Amount: 1}})
		DepositCoins(cross(cur), id)
	}
	withCoins(chain.Coins{{Denom: "ucapz", Amount: 1}})
	uassert.AbortsWithMessage(t, cur, "a side can hold at most 8 different assets", func() {
		DepositCoins(cross(cur), id)
	})
	// Topping up an asset already on the side is fine.
	withCoins(chain.Coins{{Denom: "ucapa", Amount: 5}})
	DepositCoins(cross(cur), id)
	testing.SetOriginSend(nil)
	uassert.Equal(t, int64(6), mustRoom(id).maker.assets[0].amount)
}

func TestPause(cur realm, t *testing.T) {
	alice := testutils.TestAddress("ps-alice")
	bob := testutils.TestAddress("ps-bob")
	boss := testutils.TestAddress("ps-admin")
	next := testutils.TestAddress("ps-next")

	id := openFunded(cur, alice, bob, 1_000, 10)
	r := mustRoom(id)

	admin = boss
	defer func() {
		admin = ""
		paused = false
		pendingAdmin = ""
	}()

	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "admin only", func() { SetPaused(cross(cur), true) })

	testing.SetRealm(testing.NewUserRealm(boss))
	SetPaused(cross(cur), true)
	uassert.True(t, IsPaused())

	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "trade rooms are paused: you can still withdraw, unlock and cancel", func() {
		Open(cross(cur), bob.String(), 0)
	})
	uassert.AbortsWithMessage(t, cur, "trade rooms are paused: you can still withdraw, unlock and cancel", func() {
		Lock(cross(cur), id, r.version)
	})
	// The way out stays open.
	before := coinBalance(alice)
	WithdrawCoins(cross(cur), id, "ugnot", 1_000)
	uassert.Equal(t, before+1_000, coinBalance(alice))
	testing.SetRealm(testing.NewUserRealm(bob))
	Cancel(cross(cur), id)
	uassert.Equal(t, StatusCancelled, r.status)

	// Two-step admin handover.
	testing.SetRealm(testing.NewUserRealm(boss))
	ProposeAdmin(cross(cur), next.String())
	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "you are not the proposed admin", func() { AcceptAdmin(cross(cur)) })
	testing.SetRealm(testing.NewUserRealm(next))
	AcceptAdmin(cross(cur))
	uassert.Equal(t, next.String(), Admin())
	SetPaused(cross(cur), false)
	uassert.False(t, IsPaused())
}

func TestQueries(cur realm, t *testing.T) {
	alice := testutils.TestAddress("q-alice")
	bob := testutils.TestAddress("q-bob")

	first := openFunded(cur, alice, bob, 3_000, 30)
	testing.SetRealm(testing.NewUserRealm(alice))
	second := Open(cross(cur), "", 0)

	uassert.Equal(t, "null", RoomJSON(999999))

	js := RoomJSON(first)
	uassert.True(t, strings.Contains(js, `"id":`+idString(first)))
	uassert.True(t, strings.Contains(js, `"status":"open"`))
	uassert.True(t, strings.Contains(js, `"address":"`+alice.String()+`"`))
	uassert.True(t, strings.Contains(js, `{"kind":"coin","denom":"ugnot","amount":"3000"}`))
	uassert.True(t, strings.Contains(js, `{"kind":"token","denom":"`+tst+`","amount":"30"}`))

	// Newest first, only rooms where alice is a party.
	mine := RoomsOfJSON(alice.String(), 0, 10)
	iSecond := strings.Index(mine, `"id":`+idString(second)+`,`)
	iFirst := strings.Index(mine, `"id":`+idString(first)+`,`)
	uassert.True(t, iSecond >= 0 && iFirst > iSecond, mine)
	uassert.True(t, strings.Contains(mine, `"more":false`))

	paged := RoomsOfJSON(alice.String(), 0, 1)
	uassert.True(t, strings.Contains(paged, `"more":true`))
	uassert.False(t, strings.Contains(paged, `"id":`+idString(first)+`,`))

	bobs := RoomsOfJSON(bob.String(), 0, 10)
	uassert.True(t, strings.Contains(bobs, `"id":`+idString(first)+`,`))
	uassert.False(t, strings.Contains(bobs, `"id":`+idString(second)+`,`))

	stats := StatsJSON()
	uassert.True(t, strings.Contains(stats, `"rooms":`+idString(lastID)))
	uassert.True(t, strings.Contains(stats, `"address":"`+realmAddr.String()+`"`))

	tokens := TokensJSON(0, 50)
	uassert.True(t, strings.Contains(tokens, `"key":"`+tst+`"`), tokens)
	uassert.True(t, strings.Contains(tokens, `"decimals":4`))

	fundTokens(bob, 5)
	info := TokenJSON(tst, bob.String())
	uassert.True(t, strings.Contains(info, `"allowance":"5"`), info)
	uassert.Equal(t, "null", TokenJSON("gno.land/r/nobody/fake.FAKE", ""))

	inv := BalancesJSON(bob.String(), 0, 50)
	uassert.True(t, strings.Contains(inv, `"key":"`+tst+`"`), inv)
	uassert.True(t, strings.Contains(inv, `"balance":"5"`), inv)
	uassert.True(t, strings.Contains(inv, `"allowance":"5"`), inv)
	uassert.True(t, strings.Contains(inv, `"more":false`), inv)
	uassert.Equal(t, `{"tokens":[],"more":false}`, BalancesJSON(testutils.TestAddress("q-nobody").String(), 0, 50))
	uassert.Equal(t, "null", BalancesJSON("not an address", 0, 50))
}

// Expected values are built from interpreted literals: the Gno scanner
// expands backslash-u sequences even inside raw strings.
func TestJSONEscaping(t *testing.T) {
	bs := "\\"
	uassert.Equal(t, "\"a"+bs+"\"b"+bs+bs+"c\"", jsonString("a\"b"+bs+"c"))
	uassert.Equal(t, "\"line"+bs+"u000abreak\"", jsonString("line\nbreak"))
	uassert.Equal(t, "\""+bs+"u043f"+bs+"u0440"+bs+"u0438\"", jsonString("при"))
	uassert.Equal(t, "\""+bs+"ud83d"+bs+"ude00\"", jsonString("😀"))
}

func TestRender(cur realm, t *testing.T) {
	alice := testutils.TestAddress("r-alice")
	bob := testutils.TestAddress("r-bob")
	id := openFunded(cur, alice, bob, 42, 7)

	home := Render("")
	uassert.True(t, strings.Contains(home, "# Trade Window rooms"))
	uassert.True(t, strings.Contains(home, "(:room/"+idString(id)+")"))

	page := Render("room/" + idString(id))
	uassert.True(t, strings.Contains(page, "# Room "+idString(id)))
	uassert.True(t, strings.Contains(page, alice.String()))
	uassert.True(t, strings.Contains(page, "42"))

	uassert.True(t, strings.Contains(Render("room/abc"), "# Not found"))
	uassert.True(t, strings.Contains(Render("<script>"), "# Not found"))
	uassert.False(t, strings.Contains(Render("<script>"), "<script>"))
}

func TestCoinsOnlyThroughDeposit(cur realm, t *testing.T) {
	alice := testutils.TestAddress("rc-alice")
	bob := testutils.TestAddress("rc-bob")

	testing.SetRealm(testing.NewUserRealm(alice))
	testing.SetOriginSend(ugnot(10))
	uassert.AbortsWithMessage(t, cur, "this call does not take coins: use DepositCoins", func() {
		Open(cross(cur), bob.String(), 0)
	})
	testing.SetOriginSend(nil)
	id := Open(cross(cur), bob.String(), 0)
	testing.SetOriginSend(ugnot(10))
	uassert.AbortsWithMessage(t, cur, "this call does not take coins: use DepositCoins", func() {
		Cancel(cross(cur), id)
	})
	testing.SetOriginSend(nil)
}

func TestDecimal(t *testing.T) {
	uassert.Equal(t, "5", decimal(5_000_000, 6))
	uassert.Equal(t, "0.25", decimal(250_000, 6))
	uassert.Equal(t, "1.000001", decimal(1_000_001, 6))
	uassert.Equal(t, "0.0001", decimal(1, 4))
	uassert.Equal(t, "42", decimal(42, 0))
	uassert.Equal(t, "2.5 GNOT", formatAsset(asset{kind: KindCoin, denom: "ugnot", amount: 2_500_000}))
	uassert.Equal(t, "0.0007 TT", formatAsset(asset{kind: KindToken, denom: tst, amount: 7}))
	uassert.Equal(t, "9 uatom", formatAsset(asset{kind: KindCoin, denom: "uatom", amount: 9}))
	uassert.Equal(t, "25 GNOT (wrapped)", formatAsset(asset{kind: KindToken, denom: wugnotKey, amount: 25_000_000}))
}
