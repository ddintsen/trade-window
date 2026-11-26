package rooms

import (
	"strings"
	"testing"

	"gno.land/p/nt/grc721/v0"
	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
	test20 "gno.land/r/tradewindow/testing/token20"
)

// offerTokens opens a room for maker with taker ("" for an open seat),
// puts amount of the test token on the maker's side and offers it for
// want. It returns the room id and the version to fill.
func offerTokens(cur realm, maker address, taker string, amount int64, want string) (uint64, uint64) {
	testing.SetRealm(testing.NewUserRealm(maker))
	id := Open(cross(cur), taker, 0)
	fundTokens(maker, amount)
	DepositToken(cross(cur), id, tst, amount)
	v := Offer(cross(cur), id, mustRoom(id).version, want)
	return id, v
}

func TestOfferFillsInOneCall(cur realm, t *testing.T) {
	alice := testutils.TestAddress("of-alice")
	bob := testutils.TestAddress("of-bob")
	vault := testutils.TestAddress("of-vault")
	withFees(vault, 50)
	defer feesOff()

	id, v := offerTokens(cur, alice, "", 1_000, "coin 5000000 ugnot")
	r := mustRoom(id)
	uassert.Equal(t, v, r.version)
	uassert.Equal(t, v, r.maker.locked)
	uassert.True(t, strings.Contains(RoomJSON(id), `"want":[{"kind":"coin","denom":"ugnot","amount":"5000000"}]`), RoomJSON(id))

	aliceCoins, bobTokens := coinBalance(alice), test20.Token.BalanceOf(bob)
	testing.SetRealm(testing.NewUserRealm(bob))
	withCoins(ugnot(5_000_000))
	Fill(cross(cur), id, v)
	testing.SetOriginSend(nil)

	uassert.Equal(t, StatusSettled, r.status)
	uassert.Equal(t, bob, r.taker.owner)
	uassert.Equal(t, bob, r.closedBy)
	uassert.Equal(t, aliceCoins+4_975_000, coinBalance(alice))
	uassert.Equal(t, bobTokens+995, test20.Token.BalanceOf(bob))
	uassert.True(t, strings.Contains(RoomsOfJSON(bob.String(), 0, 5), `"id":`+idString(id)))
}

func TestOfferForTokensAndAnNFT(cur realm, t *testing.T) {
	key := lanterns(cur)
	alice := testutils.TestAddress("ofn-alice")
	bob := testutils.TestAddress("ofn-bob")
	mintLantern(t, bob, "61")
	fundTokens(bob, 300)

	testing.SetRealm(testing.NewUserRealm(alice))
	id := Open(cross(cur), bob.String(), 0)
	withCoins(ugnot(9_000_000))
	DepositCoins(cross(cur), id)
	testing.SetOriginSend(nil)
	v := Offer(cross(cur), id, mustRoom(id).version, "token 300 "+tst+"\nnft 1 "+key+"#61")

	bobCoins := coinBalance(bob)
	testing.SetRealm(testing.NewUserRealm(bob))
	Fill(cross(cur), id, v)

	uassert.Equal(t, StatusSettled, mustRoom(id).status)
	uassert.Equal(t, alice, ownerOf(t, "61"))
	uassert.Equal(t, int64(300), test20.Token.BalanceOf(alice))
	uassert.Equal(t, bobCoins+9_000_000, coinBalance(bob))
}

func TestFillRefusals(cur realm, t *testing.T) {
	alice := testutils.TestAddress("ofr-alice")
	bob := testutils.TestAddress("ofr-bob")
	carol := testutils.TestAddress("ofr-carol")

	id, v := offerTokens(cur, alice, bob.String(), 50, "coin 2000000 ugnot")
	r := mustRoom(id)

	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "you made this offer", func() { Fill(cross(cur), id, v) })

	testing.SetRealm(testing.NewUserRealm(carol))
	withCoins(ugnot(2_000_000))
	uassert.AbortsWithMessage(t, cur, "this offer is for another account", func() { Fill(cross(cur), id, v) })

	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "the offer changed: review version "+idString(v)+" and fill again", func() {
		Fill(cross(cur), id, v-1)
	})
	withCoins(ugnot(1_999_999))
	uassert.AbortsWithMessage(t, cur, "attach exactly 2000000ugnot", func() { Fill(cross(cur), id, v) })
	withCoins(ugnot(2_000_001))
	uassert.AbortsWithMessage(t, cur, "attach exactly 2000000ugnot", func() { Fill(cross(cur), id, v) })
	withCoins(nil)
	uassert.AbortsWithMessage(t, cur, "attach exactly 2000000ugnot", func() { Fill(cross(cur), id, v) })

	testing.SetOriginSend(nil)

	// A code realm cannot fill an offer that wants coins.
	open, ov := offerTokens(cur, alice, "", 5, "coin 2000000 ugnot")
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/tradewindow/testing/filler"))
	uassert.AbortsWithMessage(t, cur, "send the coins with a direct call from your account", func() { Fill(cross(cur), open, ov) })

	// Nothing above changed the room.
	uassert.Equal(t, v, r.version)
	uassert.Equal(t, StatusOpen, r.status)
	uassert.Equal(t, 0, len(r.taker.assets))

	// A room without an offer cannot be filled.
	testing.SetRealm(testing.NewUserRealm(alice))
	plain := Open(cross(cur), bob.String(), 0)
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "this room has no standing offer", func() {
		Fill(cross(cur), plain, mustRoom(plain).version)
	})
}

func TestFillChecksTokensAndNFTsFirst(cur realm, t *testing.T) {
	key := lanterns(cur)
	alice := testutils.TestAddress("ofc-alice")
	bob := testutils.TestAddress("ofc-bob")
	urequire.NoError(t, lanternsLed.Mint(bob, grc721.TokenID("71"))) // not approved

	id, v := offerTokens(cur, alice, "", 10, "token 500 "+tst)
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "you do not have enough TT", func() { Fill(cross(cur), id, v) })
	test20.Ledger.Mint(bob, 500)
	uassert.AbortsWithMessage(t, cur, "approve this realm for TT first", func() { Fill(cross(cur), id, v) })
	withCoins(ugnot(1))
	uassert.AbortsWithMessage(t, cur, "this offer does not take coins", func() { Fill(cross(cur), id, v) })
	testing.SetOriginSend(nil)

	id2, v2 := offerTokens(cur, alice, "", 10, "nft 1 "+key+"#71")
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "approve this realm for Lanterns #71 first", func() { Fill(cross(cur), id2, v2) })
	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "you made this offer", func() { Fill(cross(cur), id2, v2) })
	testing.SetRealm(testing.NewUserRealm(testutils.TestAddress("ofc-carol")))
	uassert.AbortsWithMessage(t, cur, "you do not own Lanterns #71", func() { Fill(cross(cur), id2, v2) })
	uassert.Equal(t, bob, ownerOf(t, "71"))
}

func TestOfferValidation(cur realm, t *testing.T) {
	key := lanterns(cur)
	alice := testutils.TestAddress("ofv-alice")
	bob := testutils.TestAddress("ofv-bob")
	mintLantern(t, bob, "81")

	testing.SetRealm(testing.NewUserRealm(alice))
	id := Open(cross(cur), "", 0)
	uassert.AbortsWithMessage(t, cur, "put something in before you make an offer", func() {
		Offer(cross(cur), id, mustRoom(id).version, "coin 1 ugnot")
	})
	fundTokens(alice, 5)
	DepositToken(cross(cur), id, tst, 5)
	v := mustRoom(id).version
	offer := func(want string) func() { return func() { Offer(cross(cur), id, v, want) } }

	uassert.AbortsWithMessage(t, cur, "say what you want in return", offer(" \n "))
	uassert.AbortsWithMessage(t, cur, "each line of the want list is: kind amount denom", offer("coin 5"))
	uassert.AbortsWithMessage(t, cur, "want amounts must be positive whole numbers of base units", offer("coin -5 ugnot"))
	uassert.AbortsWithMessage(t, cur, "want amounts must be positive whole numbers of base units", offer("coin 1.5 ugnot"))
	uassert.AbortsWithMessage(t, cur, "unknown kind in the want list: gift", offer("gift 1 ugnot"))
	uassert.AbortsWithMessage(t, cur, "not a coin denom: UGNOT", offer("coin 1 UGNOT"))
	uassert.AbortsWithMessage(t, cur, "token is not in the GRC20 registry: gno.land/r/nobody/fake.FAKE", offer("token 1 gno.land/r/nobody/fake.FAKE"))
	uassert.AbortsWithMessage(t, cur, "an NFT is written as collection key#token id", offer("nft 1 "+key))
	uassert.AbortsWithMessage(t, cur, "that NFT does not exist: "+key+"#404", offer("nft 1 "+key+"#404"))
	uassert.AbortsWithMessage(t, cur, "an NFT is wanted whole: amount 1", offer("nft 2 "+key+"#81"))
	uassert.AbortsWithMessage(t, cur, "the want list names ugnot twice", offer("coin 1 ugnot\ncoin 2 ugnot"))
	nine := strings.Repeat("coin 1 aaa\n", 1)
	for _, d := range []string{"bbb", "ccc", "ddd", "eee", "fff", "ggg", "hhh", "iii"} {
		nine += "coin 1 " + d + "\n"
	}
	uassert.AbortsWithMessage(t, cur, "an offer can want at most 8 different assets", offer(nine))
	uassert.AbortsWithMessage(t, cur, "the room changed: review version "+idString(v)+" and offer again", func() {
		Offer(cross(cur), id, v-1, "coin 1 ugnot")
	})
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "only the maker can make an offer", offer("coin 1 ugnot"))

	// A valid list is stored as written, one asset per line.
	testing.SetRealm(testing.NewUserRealm(alice))
	got := Offer(cross(cur), id, v, "  coin 7 ugnot \n\n nft 1 "+key+"#81")
	uassert.Equal(t, v+1, got)
	uassert.Equal(t, "coin 7 ugnot\nnft 1 "+key+"#81", wantString(mustRoom(id).want))
}

func TestAnyChangeWithdrawsTheOffer(cur realm, t *testing.T) {
	alice := testutils.TestAddress("ofw-alice")
	bob := testutils.TestAddress("ofw-bob")

	// The maker adds something: the offer is gone, the old version is dead.
	id, v := offerTokens(cur, alice, bob.String(), 20, "coin 1000 ugnot")
	r := mustRoom(id)
	testing.SetRealm(testing.NewUserRealm(alice))
	withCoins(ugnot(1))
	DepositCoins(cross(cur), id)
	testing.SetOriginSend(nil)
	uassert.Equal(t, 0, len(r.want))
	testing.SetRealm(testing.NewUserRealm(bob))
	withCoins(ugnot(1000))
	uassert.AbortsWithMessage(t, cur, "this room has no standing offer", func() { Fill(cross(cur), id, v) })
	testing.SetOriginSend(nil)

	// Unlocking withdraws it too.
	testing.SetRealm(testing.NewUserRealm(alice))
	v = Offer(cross(cur), id, r.version, "coin 1000 ugnot")
	Unlock(cross(cur), id)
	uassert.Equal(t, 0, len(r.want))

	// The invited taker can turn it back into a negotiation by putting
	// something in; that also withdraws the offer.
	v = Offer(cross(cur), id, r.version, "coin 1000 ugnot")
	fundTokens(bob, 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	DepositToken(cross(cur), id, tst, 3)
	uassert.Equal(t, 0, len(r.want))
	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "they have already put something in: agree in the room instead", func() {
		Offer(cross(cur), id, r.version, "coin 1000 ugnot")
	})
}

func TestOfferIsTheOnlyWayIntoItsSeat(cur realm, t *testing.T) {
	alice := testutils.TestAddress("ofj-alice")
	bob := testutils.TestAddress("ofj-bob")

	id, v := offerTokens(cur, alice, "", 30, "coin 3000 ugnot")
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "this room is an offer: fill it instead", func() { Join(cross(cur), id) })
	uassert.Equal(t, v, mustRoom(id).version)
	uassert.Equal(t, address(""), mustRoom(id).taker.owner)
}

func TestFillPausedOrExpired(cur realm, t *testing.T) {
	alice := testutils.TestAddress("ofp-alice")
	bob := testutils.TestAddress("ofp-bob")

	id, v := offerTokens(cur, alice, "", 10, "coin 1000 ugnot")
	paused = true
	testing.SetRealm(testing.NewUserRealm(bob))
	withCoins(ugnot(1000))
	uassert.AbortsWithMessage(t, cur, "trade rooms are paused: you can still withdraw, unlock and cancel", func() { Fill(cross(cur), id, v) })
	testing.SetOriginSend(nil)
	paused = false

	testing.SetRealm(testing.NewUserRealm(alice))
	short := Open(cross(cur), "", MinTTLMinutes)
	fundTokens(alice, 1)
	DepositToken(cross(cur), short, tst, 1)
	sv := Offer(cross(cur), short, mustRoom(short).version, "coin 1000 ugnot")
	mustRoom(short).expiresAt = mustRoom(short).createdAt - 1
	testing.SetRealm(testing.NewUserRealm(bob))
	withCoins(ugnot(1000))
	uassert.AbortsWithMessage(t, cur, "this room has expired: withdraw or cancel to get deposits back", func() { Fill(cross(cur), short, sv) })
	testing.SetOriginSend(nil)
}
