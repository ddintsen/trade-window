package rooms

import (
	"strings"
	"testing"

	"gno.land/p/nt/grc721/enumerable/v0"
	"gno.land/p/nt/grc721/v0"
	"gno.land/p/nt/seqid/v0"
	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

const lanternsPath = "gno.land/r/tradewindow/testing/lanterns"

// lanterns is a test collection, created and registered from its own realm
// once; tests mint and approve through its ledger.
var (
	lanternsKey   string
	lanternsToken *grc721.Token
	lanternsLed   *grc721.PrivateLedger
)

func lanterns(cur realm) string {
	verifyTestAssets()
	if lanternsKey == "" {
		testing.SetRealm(testing.NewCodeRealm(lanternsPath))
		lanternsToken, lanternsLed = grc721.NewToken("Lanterns", "LAMP", seqid.ID(0), cur)
		list, _ := enumerable.NewEnumerable(lanternsLed)
		lanternsKey = RegisterCollection(cross(cur), lanternsToken, list)
	}
	return lanternsKey
}

// mintLantern gives who a lantern and approves this realm for it.
func mintLantern(t *testing.T, who address, tid string) {
	urequire.NoError(t, lanternsLed.Mint(who, grc721.TokenID(tid)))
	urequire.NoError(t, lanternsLed.Approve(who, realmAddr, grc721.TokenID(tid)))
}

func ownerOf(t *testing.T, tid string) address {
	owner, err := lanternsToken.OwnerOf(grc721.TokenID(tid))
	urequire.NoError(t, err)
	return owner
}

func TestRegisterCollection(cur realm, t *testing.T) {
	key := lanterns(cur)
	uassert.Equal(t, lanternsPath+".LAMP", key)

	// Once per realm and symbol.
	testing.SetRealm(testing.NewCodeRealm(lanternsPath))
	uassert.AbortsWithMessage(t, cur, "collection already registered", func() {
		RegisterCollection(cross(cur), lanternsToken, nil)
	})

	// Only from the collection's own realm: not from an account, and not
	// from another realm holding a pointer to it.
	testing.SetRealm(testing.NewUserRealm(testutils.TestAddress("reg-alice")))
	uassert.AbortsWithMessage(t, cur, "register a collection from its own realm", func() {
		RegisterCollection(cross(cur), lanternsToken, nil)
	})
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/tradewindow/testing/copycat"))
	uassert.AbortsWithMessage(t, cur, "register a collection from its own realm", func() {
		RegisterCollection(cross(cur), lanternsToken, nil)
	})

	// A list must belong to the collection it is registered with.
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/tradewindow/testing/hats"))
	hats, hatsLed := grc721.NewToken("Hats", "HAT", seqid.ID(0), cur)
	_, otherLed := grc721.NewToken("Other", "OTH", seqid.ID(1), cur)
	otherList, _ := enumerable.NewEnumerable(otherLed)
	uassert.AbortsWithMessage(t, cur, "the list belongs to another collection", func() {
		RegisterCollection(cross(cur), hats, otherList)
	})
	hatsList, _ := enumerable.NewEnumerable(hatsLed)
	uassert.Equal(t, "gno.land/r/tradewindow/testing/hats.HAT", RegisterCollection(cross(cur), hats, hatsList))
}

func TestNFTSwap(cur realm, t *testing.T) {
	key := lanterns(cur)
	alice := testutils.TestAddress("nft-alice")
	bob := testutils.TestAddress("nft-bob")
	mintLantern(t, bob, "7")

	testing.SetRealm(testing.NewUserRealm(alice))
	id := Open(cross(cur), bob.String(), 0)
	withCoins(ugnot(3_000_000))
	DepositCoins(cross(cur), id)
	testing.SetOriginSend(nil)

	testing.SetRealm(testing.NewUserRealm(bob))
	DepositNFT(cross(cur), id, key, "7")
	uassert.Equal(t, realmAddr, ownerOf(t, "7"))
	r := mustRoom(id)
	urequire.Equal(t, 1, len(r.taker.assets))
	uassert.Equal(t, KindNFT, r.taker.assets[0].kind)
	uassert.Equal(t, key+"#7", r.taker.assets[0].denom)
	uassert.Equal(t, int64(1), r.taker.assets[0].amount)
	uassert.True(t, strings.Contains(RoomJSON(id), `{"kind":"nft","denom":"`+key+`#7","amount":"1"}`))

	v := r.version
	bobCoinsBefore := coinBalance(bob)
	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.Equal(t, "locked", Lock(cross(cur), id, v))
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.Equal(t, StatusSettled, Lock(cross(cur), id, v))

	uassert.Equal(t, alice, ownerOf(t, "7"))
	uassert.Equal(t, bobCoinsBefore+3_000_000, coinBalance(bob))
	// Volume counts NFTs per collection (other tests trade lanterns too).
	uassert.True(t, strings.Contains(StatsJSON(), `{"kind":"nft","denom":"`+key+`","amount":"`))
}

func TestNFTWithdrawAndCancel(cur realm, t *testing.T) {
	key := lanterns(cur)
	alice := testutils.TestAddress("nftw-alice")
	bob := testutils.TestAddress("nftw-bob")
	mintLantern(t, alice, "11")

	testing.SetRealm(testing.NewUserRealm(alice))
	id := Open(cross(cur), bob.String(), 0)
	DepositNFT(cross(cur), id, key, "11")
	v := mustRoom(id).version

	// It comes back whole, and the version moves on.
	WithdrawNFT(cross(cur), id, key, "11")
	uassert.Equal(t, alice, ownerOf(t, "11"))
	uassert.Equal(t, v+1, mustRoom(id).version)
	uassert.AbortsWithMessage(t, cur, "you have not deposited that asset", func() {
		WithdrawNFT(cross(cur), id, key, "11")
	})

	// Cancelling sends it home too.
	urequire.NoError(t, lanternsLed.Approve(alice, realmAddr, grc721.TokenID("11")))
	DepositNFT(cross(cur), id, key, "11")
	Cancel(cross(cur), id)
	uassert.Equal(t, alice, ownerOf(t, "11"))
}

func TestNFTRefusals(cur realm, t *testing.T) {
	key := lanterns(cur)
	alice := testutils.TestAddress("nftr-alice")
	bob := testutils.TestAddress("nftr-bob")
	urequire.NoError(t, lanternsLed.Mint(alice, grc721.TokenID("21"))) // minted, not approved
	mintLantern(t, bob, "22")

	testing.SetRealm(testing.NewUserRealm(alice))
	id := Open(cross(cur), bob.String(), 0)
	v := mustRoom(id).version

	uassert.AbortsWithMessage(t, cur, "collection is not registered with rooms", func() {
		DepositNFT(cross(cur), id, "gno.land/r/nobody/art.ART", "1")
	})
	uassert.AbortsWithMessage(t, cur, "token id must be 1 to 64 bytes", func() {
		DepositNFT(cross(cur), id, key, "")
	})
	uassert.AbortsWithMessage(t, cur, "token id must be 1 to 64 bytes", func() {
		DepositNFT(cross(cur), id, key, strings.Repeat("9", 65))
	})
	uassert.AbortsWithMessage(t, cur, "token id has a control character", func() {
		DepositNFT(cross(cur), id, key, "2\n1")
	})
	// Without an approval nothing moves, and the room stays as it was.
	uassert.AbortsWithMessage(t, cur, "approve this realm for that NFT first", func() {
		DepositNFT(cross(cur), id, key, "21")
	})
	// Someone else's NFT cannot be put in, even one approved to this realm.
	uassert.AbortsWithMessage(t, cur, "you do not own that NFT", func() {
		DepositNFT(cross(cur), id, key, "22")
	})
	uassert.AbortsWithMessage(t, cur, "you do not own that NFT", func() {
		DepositNFT(cross(cur), id, key, "404")
	})
	uassert.Equal(t, v, mustRoom(id).version)
	uassert.Equal(t, 0, len(mustRoom(id).maker.assets))
	uassert.Equal(t, alice, ownerOf(t, "21"))
	uassert.Equal(t, bob, ownerOf(t, "22"))

	// Coins never ride along.
	withCoins(ugnot(1))
	uassert.AbortsWithMessage(t, cur, "this call does not take coins: use DepositCoins", func() {
		DepositNFT(cross(cur), id, key, "21")
	})
	testing.SetOriginSend(nil)
}

func TestOwnedJSON(cur realm, t *testing.T) {
	key := lanterns(cur)
	carol := testutils.TestAddress("nfto-carol")
	mintLantern(t, carol, "31")
	urequire.NoError(t, lanternsLed.Mint(carol, grc721.TokenID("32")))

	got := OwnedJSON(carol.String(), 0, 50)
	uassert.True(t, strings.Contains(got, `{"key":"`+key+`","name":"Lanterns","symbol":"LAMP","tokenId":"31","approved":true}`), got)
	uassert.True(t, strings.Contains(got, `{"key":"`+key+`","name":"Lanterns","symbol":"LAMP","tokenId":"32","approved":false}`), got)
	uassert.Equal(t, "null", OwnedJSON("not-an-address", 0, 50))
	uassert.Equal(t, `{"key":"`+key+`","name":"Lanterns","symbol":"LAMP","tokenId":"31","owner":"`+carol.String()+`","approved":true}`, NFTJSON(key, "31"))
	uassert.Equal(t, "null", NFTJSON(key, "nope"))
	uassert.Equal(t, "null", NFTJSON("gno.land/r/nobody/art.ART", "1"))
	uassert.True(t, strings.Contains(CollectionsJSON(0, 50), `{"key":"`+key+`","name":"Lanterns","symbol":"LAMP","listed":true,"verified":true}`))
}
