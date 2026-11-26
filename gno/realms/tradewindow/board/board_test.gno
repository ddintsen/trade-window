package board

import (
	"chain"
	"strings"
	"testing"

	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
)

func TestPostAndClose(cur realm, t *testing.T) {
	alice := testutils.TestAddress("b-alice")
	bob := testutils.TestAddress("b-bob")

	testing.SetRealm(testing.NewUserRealm(alice))
	id := Post(cross(cur), "sell", "  50,000 GNOT ", "WUGNOT 1:1", "Partial fills fine.", 0)
	l := mustListing(id)
	uassert.Equal(t, alice, l.owner)
	uassert.Equal(t, "50,000 GNOT", l.give)
	uassert.Equal(t, int64(DefaultDays*24*3600), l.expiresAt-l.createdAt)
	uassert.True(t, l.open(l.createdAt))

	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "only the owner can close this listing", func() { Close(cross(cur), id) })

	testing.SetRealm(testing.NewUserRealm(alice))
	Close(cross(cur), id)
	uassert.True(t, l.closedAt != 0)
	uassert.AbortsWithMessage(t, cur, "this listing is already closed", func() { Close(cross(cur), id) })
	uassert.AbortsWithMessage(t, cur, "listing not found", func() { Close(cross(cur), 424242) })
}

func TestValidation(cur realm, t *testing.T) {
	alice := testutils.TestAddress("v-alice")
	testing.SetRealm(testing.NewUserRealm(alice))

	uassert.AbortsWithMessage(t, cur, "side must be buy, sell or swap", func() {
		Post(cross(cur), "rent", "a", "b", "", 0)
	})
	uassert.AbortsWithMessage(t, cur, "give is required", func() {
		Post(cross(cur), "buy", "   ", "b", "", 0)
	})
	uassert.AbortsWithMessage(t, cur, "want is longer than 80 characters", func() {
		Post(cross(cur), "buy", "a", strings.Repeat("я", 81), "", 0)
	})
	uassert.AbortsWithMessage(t, cur, "note contains characters that are not allowed", func() {
		Post(cross(cur), "buy", "a", "b", "two\nlines", 0)
	})
	uassert.AbortsWithMessage(t, cur, "give contains characters that are not allowed", func() {
		Post(cross(cur), "buy", "abc"+string(rune(0x202e))+"cba", "b", "", 0)
	})
	uassert.AbortsWithMessage(t, cur, "a listing stays up between 1 and 30 days", func() {
		Post(cross(cur), "buy", "a", "b", "", 31)
	})
	testing.SetOriginSend(chain.Coins{{Denom: "ugnot", Amount: 1}})
	uassert.AbortsWithMessage(t, cur, "the board does not take coins", func() {
		Post(cross(cur), "buy", "a", "b", "", 0)
	})
	testing.SetOriginSend(nil)

	// Cyrillic and other letters are fine, up to the limit.
	id := Post(cross(cur), "swap", strings.Repeat("я", 80), "ATOM-free deal", "", 1)
	uassert.Equal(t, strings.Repeat("я", 80), mustListing(id).give)
}

func TestActiveCap(cur realm, t *testing.T) {
	carol := testutils.TestAddress("cap-carol")
	testing.SetRealm(testing.NewUserRealm(carol))
	first := uint64(0)
	for i := 0; i < MaxActivePerOwner; i++ {
		id := Post(cross(cur), "buy", "item", "GNOT", "", 1)
		if i == 0 {
			first = id
		}
	}
	uassert.AbortsWithMessage(t, cur, "you already have 10 open listings: close one first", func() {
		Post(cross(cur), "buy", "item", "GNOT", "", 1)
	})
	Close(cross(cur), first)
	Post(cross(cur), "buy", "item", "GNOT", "", 1)

	// Expired listings stop counting: one day is 17,280 blocks of 5 seconds.
	testing.SkipHeights(17_281)
	testing.SetRealm(testing.NewUserRealm(carol))
	Post(cross(cur), "buy", "fresh", "GNOT", "", 1)
}

func TestQueriesAndRender(cur realm, t *testing.T) {
	dave := testutils.TestAddress("q-dave")
	testing.SetRealm(testing.NewUserRealm(dave))
	sell := Post(cross(cur), "sell", "Bad <b>idea</b> | pipe", "GNOT", "Note with *stars*", 3)
	buy := Post(cross(cur), "buy", "WUGNOT", "GNOT", "", 3)

	js := ListingJSON(sell)
	uassert.True(t, strings.Contains(js, `"side":"sell"`), js)
	uassert.True(t, strings.Contains(js, `"open":true`))
	uassert.Equal(t, "null", ListingJSON(999999))

	open := OpenJSON("", 0, 50)
	iBuy := strings.Index(open, `"id":`+idStr(buy)+`,`)
	iSell := strings.Index(open, `"id":`+idStr(sell)+`,`)
	uassert.True(t, iBuy >= 0 && iSell > iBuy, open)

	onlyBuy := OpenJSON("buy", 0, 50)
	uassert.False(t, strings.Contains(onlyBuy, `"side":"sell"`))

	mine := ListingsOfJSON(dave.String(), 0, 1)
	uassert.True(t, strings.Contains(mine, `"more":true`))

	home := Render("")
	uassert.True(t, strings.Contains(home, "# Trade Window board"))
	uassert.False(t, strings.Contains(home, "<b>"), home)
	page := Render("listing/" + idStr(sell))
	uassert.True(t, strings.Contains(page, "Selling"))
	uassert.False(t, strings.Contains(page, "<b>"), page)
	uassert.True(t, strings.Contains(Render("listing/x"), "# Not found"))
}

func idStr(id uint64) string { return jsonUint(id) }
