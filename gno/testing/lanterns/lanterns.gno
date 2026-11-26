// Package lanterns is a GRC721 collection for the local chain test of the
// rooms realm only. Anyone can mint, so it must never be deployed to a
// public network.
//
// It shows what a tradable collection does: it registers itself with rooms
// from its own realm, and lets an owner approve the rooms realm for one
// token id with Approve(to, tid).
package lanterns

import (
	"gno.land/p/nt/grc721/enumerable/v0"
	"gno.land/p/nt/grc721/v0"
	"gno.land/p/nt/seqid/v0"
	"gno.land/r/tradewindow/rooms"
)

var (
	Token  *grc721.Token
	ledger *grc721.PrivateLedger
	List   *enumerable.Enumerable
	Key    string
)

func init(cur realm) {
	Token, ledger = grc721.NewToken("Lanterns", "LAMP", seqid.ID(0), cur)
	List, _ = enumerable.NewEnumerable(ledger)
	Key = rooms.RegisterCollection(cross(cur), Token, List)
}

// Mint gives the caller lantern tid. Test only.
func Mint(cur realm, tid string) {
	if err := ledger.Mint(cur.Previous().Address(), grc721.TokenID(tid)); err != nil {
		panic(err.Error())
	}
}

// Approve lets to move the caller's lantern tid, as rooms expects.
func Approve(cur realm, to address, tid string) {
	if err := ledger.Approve(cur.Previous().Address(), to, grc721.TokenID(tid)); err != nil {
		panic(err.Error())
	}
}
