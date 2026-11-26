package rooms

import (
	"math"
	"strings"
	"testing"

	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	test20 "gno.land/r/tradewindow/testing/token20"
)

// withFees turns the fee on at bps with treasuryAddr as the receiver;
// feesOff turns it off again.
func withFees(treasuryAddr address, bps uint64) {
	treasury = treasuryAddr
	feeBps = bps
}

func feesOff() {
	treasury = ""
	feeBps = DefaultFeeBps
	admin = ""
}

func TestFeeOf(t *testing.T) {
	uassert.Equal(t, int64(0), feeOf(0, 50))
	uassert.Equal(t, int64(0), feeOf(199, 50)) // rounds down
	uassert.Equal(t, int64(1), feeOf(200, 50))
	uassert.Equal(t, int64(5_000), feeOf(1_000_000, 50))
	uassert.Equal(t, int64(0), feeOf(1_000_000, 0))
	// Never overflows, even at the cap on the largest amount.
	uassert.Equal(t, int64(math.MaxInt64/10000*100+(math.MaxInt64%10000)*100/10000), feeOf(math.MaxInt64, MaxFeeBps))
}

func TestFeeOnSettlement(cur realm, t *testing.T) {
	alice := testutils.TestAddress("fee-alice")
	bob := testutils.TestAddress("fee-bob")
	vault := testutils.TestAddress("fee-vault")
	withFees(vault, 50)
	defer feesOff()

	id := openFunded(cur, alice, bob, 10_000_000, 1_000)
	r := mustRoom(id)
	uassert.Equal(t, uint64(50), r.feeBps)

	bobCoins, aliceTokens := coinBalance(bob), test20.Token.BalanceOf(alice)
	vaultCoins, vaultTokens := coinBalance(vault), test20.Token.BalanceOf(vault)

	testing.SetRealm(testing.NewUserRealm(alice))
	Lock(cross(cur), id, r.version)
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.Equal(t, StatusSettled, Lock(cross(cur), id, r.version))

	// Each side's coins and tokens pay 0.5% on the way across.
	uassert.Equal(t, bobCoins+9_950_000, coinBalance(bob))
	uassert.Equal(t, aliceTokens+995, test20.Token.BalanceOf(alice))
	uassert.Equal(t, vaultCoins+50_000, coinBalance(vault))
	uassert.Equal(t, vaultTokens+5, test20.Token.BalanceOf(vault))
	stats := StatsJSON()
	uassert.True(t, strings.Contains(stats, `"fees":[`), stats)
	uassert.True(t, strings.Contains(stats, `{"kind":"coin","denom":"ugnot","amount":"50000"}`), stats)
	// Volume counts what crossed, fee included.
	uassert.True(t, strings.Contains(RoomJSON(id), `"feeBps":50`))
}

func TestFeeIsFixedPerRoomAndCapped(cur realm, t *testing.T) {
	alice := testutils.TestAddress("feecap-alice")
	bob := testutils.TestAddress("feecap-bob")
	boss := testutils.TestAddress("feecap-admin")
	vault := testutils.TestAddress("feecap-vault")
	withFees(vault, 50)
	defer feesOff()
	admin = boss

	id := openFunded(cur, alice, bob, 1_000_000, 100)
	uassert.Equal(t, uint64(50), mustRoom(id).feeBps)

	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "admin only", func() { SetFee(cross(cur), 0) })
	testing.SetRealm(testing.NewUserRealm(boss))
	uassert.AbortsWithMessage(t, cur, "the fee can be at most 100 basis points", func() { SetFee(cross(cur), 101) })
	SetFee(cross(cur), 100)
	uassert.Equal(t, uint64(100), FeeBps())

	// The open room keeps the rate it was opened with.
	r := mustRoom(id)
	vaultBefore := coinBalance(vault)
	testing.SetRealm(testing.NewUserRealm(alice))
	Lock(cross(cur), id, r.version)
	testing.SetRealm(testing.NewUserRealm(bob))
	Lock(cross(cur), id, r.version)
	uassert.Equal(t, vaultBefore+5_000, coinBalance(vault))

	// A new room gets the new rate.
	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.Equal(t, uint64(100), mustRoom(Open(cross(cur), bob.String(), 0)).feeBps)

	// Without a treasury nothing is charged.
	treasury = ""
	uassert.Equal(t, uint64(0), FeeBps())
	uassert.Equal(t, uint64(0), mustRoom(Open(cross(cur), bob.String(), 0)).feeBps)
}

func TestNoFeeOnTheWayOut(cur realm, t *testing.T) {
	alice := testutils.TestAddress("feeout-alice")
	bob := testutils.TestAddress("feeout-bob")
	vault := testutils.TestAddress("feeout-vault")
	withFees(vault, 50)
	defer feesOff()

	id := openFunded(cur, alice, bob, 4_000_000, 400)
	vaultCoins, vaultTokens := coinBalance(vault), test20.Token.BalanceOf(vault)

	// Withdrawing returns the full amount.
	testing.SetRealm(testing.NewUserRealm(alice))
	before := coinBalance(alice)
	WithdrawCoins(cross(cur), id, "ugnot", 1_000_000)
	uassert.Equal(t, before+1_000_000, coinBalance(alice))

	// Cancelling returns everything else in full.
	before = coinBalance(alice)
	bobTokens := test20.Token.BalanceOf(bob)
	Cancel(cross(cur), id)
	uassert.Equal(t, before+3_000_000, coinBalance(alice))
	uassert.Equal(t, bobTokens+400, test20.Token.BalanceOf(bob))
	uassert.Equal(t, vaultCoins, coinBalance(vault))
	uassert.Equal(t, vaultTokens, test20.Token.BalanceOf(vault))
}

func TestNFTsCrossWithoutFee(cur realm, t *testing.T) {
	key := lanterns(cur)
	alice := testutils.TestAddress("feenft-alice")
	bob := testutils.TestAddress("feenft-bob")
	vault := testutils.TestAddress("feenft-vault")
	withFees(vault, 50)
	defer feesOff()
	mintLantern(t, bob, "51")

	testing.SetRealm(testing.NewUserRealm(alice))
	id := Open(cross(cur), bob.String(), 0)
	withCoins(ugnot(2_000_000))
	DepositCoins(cross(cur), id)
	testing.SetOriginSend(nil)
	testing.SetRealm(testing.NewUserRealm(bob))
	DepositNFT(cross(cur), id, key, "51")

	r := mustRoom(id)
	vaultCoins := coinBalance(vault)
	testing.SetRealm(testing.NewUserRealm(alice))
	Lock(cross(cur), id, r.version)
	testing.SetRealm(testing.NewUserRealm(bob))
	Lock(cross(cur), id, r.version)

	uassert.Equal(t, alice, ownerOf(t, "51"))
	uassert.Equal(t, vaultCoins+10_000, coinBalance(vault)) // only the coin leg paid
}
