// Package token20 is a GRC20 token for the rooms realm tests only. Anyone
// can mint and approve on behalf of anyone, so it must never be deployed
// to a public network.
package token20

import (
	"gno.land/p/nt/grc20/v0"
	"gno.land/r/nt/grc20reg/v0"
)

var (
	Token  *grc20.Token
	Ledger *grc20.PrivateLedger
)

func init(cur realm) {
	Token, Ledger = grc20.NewToken("Test Twenty", "TT", 4, 0, cur)
	grc20reg.Register(cross(cur), Token, "")
}
