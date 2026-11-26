# How the contract works

Trade Window is the trade window of an MMO, written as a contract. In a game the server is the trusted party: both players put items in, both press accept, and the server swaps everything at once or nothing at all. On gno.land the rooms realm plays the server. Nobody runs it and nobody can change it after it is deployed: the code is the trusted party, and anyone can read it.

This document is the logic. `docs/SECURITY-REVIEW.md` is what can go wrong and how each guarantee is tested.

## Objects

| Object | What it is |
| --- | --- |
| Room | Two sides, a version, a status (open, settled, cancelled), an expiry, the fee rate it was opened with, and optionally a standing offer |
| Side | An owner address, up to eight assets, and the version this side is ready on (0 when not ready) |
| Asset | A native coin (`ugnot` or any bank denom), a GRC20 token from `gno.land/r/nt/grc20reg/v0`, or a GRC721 NFT from a collection registered with rooms. NFTs are whole: amount 1. Ordinary rooms take only verified assets; open-market rooms take any registered asset |
| Version | A counter that every change to the room raises: a join, a deposit, a withdrawal, an offer |
| Ready mark | `Lock(room, version)`: "I agree to the room exactly as it is at this version". In the window this is the "I am ready" button |
| Offer | The maker's side plus an exact list of what they want; filled in one call |

The realm holds every deposit at its own address. No person, the admin included, can move a deposit anywhere except back to its owner or, on settlement, to the other side.

## Lifecycle

```
Open ──► deposits, withdrawals (each raises the version) ──► both ready on the same version ──► settled
  │                                   │
  │                                   ├─► Cancel by either party ──► cancelled, everything goes home
  │                                   └─► expiry ──► cannot settle; withdraw, or anyone cancels ──► home
  └─► Offer (maker) ──► Fill (taker, one call) ──► settled
```

- **Open** (`Open(counterparty, ttlMinutes)`, or `OpenMarket` for a room that takes unverified assets): the caller is the maker. The taker seat is one named address, or open to the first account that joins. Lifetime 10 minutes to 7 days, 24 hours by default.
- **Put in** (`DepositCoins`, `DepositToken`, `DepositNFT`): only to your own side. Coins arrive only with a direct call from the signing account. Tokens and NFTs are pulled with an approval the owner gave this realm; the app sends the approval and the deposit in one transaction.
- **Take back** (`WithdrawCoins`, `WithdrawToken`, `WithdrawNFT`): only your own deposits, at any time while the room is open, also when the realm is paused or the room has expired.
- **Ready** (`Lock(room, version)`): fails if the room is not at that version. The second ready mark on the same version settles the room in the same transaction. `Unlock` takes your mark back.
- **Settle**: each side's assets go to the other side, less the service fee on coins and tokens.
- **Cancel**: either party at any time before settlement; after expiry anyone. Every deposit goes back to the account that put it in.

## Invariants

1. A ready mark applies only to the version it names; any change raises the version, so nobody can be held to contents they did not see.
2. The realm holds exactly what the open rooms record (plus settled fees on their way out in the same transaction).
3. A deposit leaves the realm only to its owner (withdraw, cancel, expiry) or to the other party (settlement); fees go to the treasury only on settlement.
4. Settlement is all or nothing: if any transfer fails, the whole transaction fails and nothing moves.
5. The way out is always open: pause stops new rooms, deposits, ready marks and fills, never withdraw, unlock or cancel.
6. A room keeps the fee rate it was opened with; no rate exceeds 1%.
7. While `Fill` moves assets in, the room is held (status `filling`) and refuses every other call.

## Offers

An offer is how one person sets the terms and anyone allowed can accept them without a second round trip, which is what an OTC desk needs.

1. The maker opens a room (named taker for a private deal, open seat for anyone), puts their side in, and calls `Offer(room, version, want)`. `want` lists one asset per line: `coin <amount> <denom>`, `token <amount> <registry key>`, `nft 1 <collection key>#<token id>`. Amounts are in base units, at most eight lines, no duplicates. The call raises the version and marks the maker ready on it.
2. The taker reviews that version and calls `Fill(room, version)`, with the wanted coins attached and the wanted tokens and NFTs approved. The app sends the approvals and `Fill` as one transaction.
3. `Fill` checks everything first (version, who may fill, exact coins, balances, ownership, approvals), holds the room, pulls the assets in, records the taker's side and settles.

What keeps it safe:
- The want list is exact: a token is its full registry path, an NFT its collection and token id. A look-alike token cannot satisfy it.
- `Fill` names the version, and every change clears the offer, so the maker cannot swap their side or the price under a taker's transaction.
- `Join` is refused while an offer stands, so nobody can block an open offer by sitting in its seat.
- Coins must match exactly; a code realm cannot fill an offer that wants coins.
- If anything is missing or wrong, the whole transaction fails: the taker's coins come back and no approval is spent.

## Verified assets

A registry shows where an asset comes from, not whether it is worth anything. So:

- Ordinary rooms (`Open`) take only verified assets. GNOT and wrapped GNOT are verified from the start. The admin verifies other tokens and collections with `Verify(kind, key, reason)`; the reason is public, and the verification counts only 24 hours later (`VerifyDelay`), so a stolen admin key cannot slip a fake in unseen. Policy: verify only assets whose issuer cannot burn or seize holders' balances, or whose issuer is a realm without an admin.
- `Unverify` counts at once: ordinary rooms stop taking the asset, and rooms that hold it can no longer settle. Everyone can still take their items back.
- `OpenMarket` opens a room that takes any registered asset. It is a separate call, so the wallet names it when it is signed, and the app warns on every screen of such a room.
- Reads: `VerifiedJSON` (with reasons and whether each counts yet), `IsVerified`, and a `verified` flag on token and collection reads.

## The service fee

0.5% (`DefaultFeeBps = 50`) of every coin and token that crosses on settlement, from each side, rounded down, sent to the treasury. NFTs, withdrawals, cancellations and expiries pay nothing. The admin can set the rate for future rooms (`SetFee`, at most `MaxFeeBps = 100`, 1%) and move the treasury (`SetTreasury`). The rate is copied into each room when it opens. The window shows each side what it receives after the fee before the ready mark.

## Names and contact

gno.land has two kinds of names: the user registry (`gno.land/r/sys/users`, names like `alice123` bound to an address, read with `ResolveName` and `ResolveAddress`) and GNS (`gno.land/r/moul/gns/v1`, `.gno` names with records, transfers, expiry and a forward-verified primary name; staged, on the Pearl testnet only so far). The plan for Trade Window:

- **Find and invite by name.** The open-room form and the board accept a name; the app resolves it to an address, shows both ("alice.gno, g1…x7f2") and opens the room on the address. The realm only ever stores addresses.
- **Show names, keep addresses.** Wherever an address appears the app shows its primary name if one is set, and the short address next to it.
- **Names can move.** A GNS name can be transferred, or expire and be registered by someone else (its generation changes). A room is bound to the address it was opened with, so a moved name changes nothing on chain; the window re-resolves the name and says so when it now points elsewhere.
- **Contact.** A room opened on someone's name already lands in their list of rooms; a short plain-text note on the room ("500 GNOT for your lantern #7?") would make it work like mail. Proposed for the next realm version: the note is optional, at most 200 bytes, never rendered as a link, and only the two parties see it in the app.

## Deploying (Onyx testnet)

Only after the owner writes "да, деплой". Two routes are prepared.

From the owner's own Adena, on the site's `/launch` page (prepared 15 October 2026): the owner registers the name and publishes rooms and board with three confirmations; the owner is the admin and treasury from the start, no other key is involved and nothing is handed over. Steps in `docs/deploy-onyx.md`.

Through the gno MCP server (`gnoverse/gno-mcp` v0.12.0) with an agent key, as first planned (an agent key that publishes under a name must be kept somewhere durable, or the namespace can never take a new version):

1. The agent key deploys `rooms` and `board` (the deployer becomes admin and treasury).
2. `SetTreasury(owner's Adena address)`, then `ProposeAdmin(owner's Adena address)`.
3. The owner accepts with `AcceptAdmin` from Adena. From then on the agent key has no role.
4. The site gets the realm paths (`NEXT_PUBLIC_GNO_ROOMS_PATH`, `NEXT_PUBLIC_GNO_BOARD_PATH`) and is redeployed.
