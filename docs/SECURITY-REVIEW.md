# Security review of the rooms realm

Date: 2026-10-14. Scope: `gno/realms/tradewindow/rooms` (rooms, offers, fee, verified assets, NFT registry, admin), the site, and how the project is run. The logic is in `docs/CONTRACT.md`.

## Defence map

Every threat the owner raised ("someone puts junk in, we don't find out, and we take the blame") and every one found in review, with the layer that answers it.

| Threat | Realm | Site | Watch and keys | Status |
| --- | --- | --- | --- | --- |
| Junk or look-alike tokens and NFTs | Ordinary rooms take only verified assets; `OpenMarket` is a separate call the wallet names | Unverified assets labelled in every view and refused by the wallet picker in ordinary rooms; an open-market room says so on every screen, in the room list and in the confirmation; the open form states the risk | Watcher reports open-market rooms and new verifications | Realm and site done; watcher to do |
| An asset turns bad mid-trade | `Unverify` stops ordinary rooms holding it from settling; withdraw still works | The window names the asset, says the trade cannot complete and blocks ready and accept; take-back stays | Watcher alerts on unverify events | Realm and site done; watcher to do |
| A stolen admin key lists a fake | Verification counts only after 24 hours, public from the start; the admin cannot move deposits | A pending verification is shown as not verified yet, with the time it would count | Watcher alerts on every `VerifyProposed`; the owner unverifies in time | Realm and site done; watcher to do |
| Bait and switch | Ready marks name a version; any change raises it; offers name the version too | The window marks every change and asks to look again | | Done |
| Someone takes your deposit | Only the depositor withdraws; nothing else leaves except settlement and returns | | | Done |
| The site is changed to show different contents | | Strict content security policy (scripts only from this site); the confirmation names the realm and the call you sign (`Lock(12, 6)`, `Fill(12, 6)` with its approvals and attached coins) and links the room's page on gno.land, which the realm renders itself | Deploy token only in `D:\Studio\.secrets` | Done |
| Phishing rooms from strangers | Storage deposit makes spam cost | Rooms opened for you by accounts you never completed a trade with, and that you have not put anything into, are listed apart as invitations; the window says "First trade with this account" | | Done |
| A name moves to another wallet | Rooms store addresses only | Resolve on open, show the address, re-resolve and warn | | To do with names |
| An NFT's code calls back in | The room is held while a fill moves assets; deposits record first; settlement closes first | | | Done |
| Approvals left behind | The realm pulls only from the caller | Approve exact amounts in the same transaction | | Done |
| Fee raised on a trade under way | Rate fixed per room, capped at 1% | The room's own rate is shown in the window, what arrives after the fee in the tooltip, the ledger and the confirmation, per asset, before any signature | | Done |
| Lost or leaked deploy key | Admin can only pause, set future fees, move treasury, verify with delay | | Hand admin and treasury to the owner's wallet right after deploy | Procedure written |
| Promises, links or "I already sent it" in chat | Only the room's state settles | The chat says messages are not part of the deal; plain text only, links never clickable; characters that reorder or hide text are dropped; only the room's two parties read or write, after an off-chain Adena signature; one-time sign-in texts, day-long sessions, rate limits | | Done |
| Blame | | Terms: Trade Window is software, not a party to trades and not a judge of assets; open-market risk stated at the point of choice | | Text to write; check with a lawyer |

## What the realm guarantees, and how each is checked

| Guarantee | Test |
| --- | --- |
| A ready mark applies only to the version it names; a change after it cannot be accepted on the other side's behalf | `TestThreatBaitAndSwitch`, `TestChangeAfterLockNeedsNewLocks`, `TestLockNeedsCurrentVersionAndBothSides` |
| Only the depositor can take a deposit out: not the other party, a stranger or the admin | `TestThreatOnlyTheOwnerWithdraws` |
| After expiry anyone may cancel, and the deposits go to their owners, never to the canceller | `TestThreatExpiredCancelPaysOwners`, `TestExpiry` |
| The way out stays open while paused | `TestPause` |
| Settlement is all or nothing, each side gets the other's assets less the fee | `TestSwapSettlesOnSecondLock`, `TestFeeOnSettlement`, `TestNFTSwap` |
| The fee cannot be raised on an open room and never exceeds 1%; withdrawals, cancellations and NFTs pay nothing | `TestFeeIsFixedPerRoomAndCapped`, `TestNoFeeOnTheWayOut`, `TestNFTsCrossWithoutFee`, `TestFeeOf` |
| An offer is filled only on the version the taker reviewed, with exactly the wanted assets, by the allowed account | `TestFillRefusals`, `TestFillChecksTokensAndNFTsFirst`, `TestAnyChangeWithdrawsTheOffer` |
| Nobody can block an open offer by taking its seat | `TestOfferIsTheOnlyWayIntoItsSeat` |
| While a fill moves assets in, nothing can change the room | `TestThreatRoomIsHeldDuringFill` |
| An approval to the realm serves only its owner's own calls | `TestThreatApprovalsOnlyServeTheirOwner` |
| Coins count only when they arrive with a direct call from the signer; coins on any other call are refused | `TestThreatNoCoinsFromCode`, `TestCoinsOnlyThroughDeposit`, `TestDepositCoinsGuards` |
| Amounts cannot wrap around | `TestThreatNoOverflow` |
| An ordinary room refuses unverified assets; an open-market room takes them | `TestThreatScamAssetStaysOut`, `TestOpenMarketTakesAnyRegisteredAsset` |
| An asset unverified mid-trade stops settlement, never a take-back | `TestThreatUnverifiedMidTradeCannotSettle` |
| A new verification waits 24 hours, even for a stolen admin key; removal is immediate | `TestThreatStolenAdminWaits`, `TestVerifyRules` |
| Only a collection's own realm can register it; owner and approval are checked before an NFT moves | `TestRegisterCollection`, `TestNFTRefusals` |

Also run: the gno audit pattern harness (`misc/audit-pattern-harness` of the gno repository, ten rules on both realms): 20 of 20 slices pass with no hits. On a throwaway local chain with real signed transactions (`scripts/gno/e2e-localnet.sh`): 81 of 81 checks, including the fee, both kinds of offer and verified-only rooms.

## Findings

### R1. A token or NFT is only as honest as its issuer. High for users; mitigated.
The GRC20 registry and the collection registry prove where an asset comes from, not that it is worth anything. Anyone can register a token called "USDC" or a collection called "Lanterns". An issuer keeps its ledger: it can mint more, and a GRC721 issuer can burn a token after it was traded or veto transfers with a hook.
Mitigation (realm, done): ordinary rooms take only verified assets (GNOT and wrapped GNOT from the start; others after the admin verifies them with a public reason and a 24-hour wait). Verification policy: only assets whose issuer cannot burn or seize holders' balances, or whose issuer is a realm without an admin. `OpenMarket` rooms take anything registered, at the parties' own risk. Removing a verification stops ordinary rooms holding the asset from settling.
Mitigation (app, done): unverified assets and open-market rooms are labelled in every view; the full path is in the tooltip, the ledger and the confirmation; the look-alike GNOT warning stays.

### R2. People sign what the site shows them. Medium.
Adena shows `Lock(room 12, version 6)`, not the contents of version 6. A compromised site could show different contents than the room holds. The version still binds the mark to the real on-chain contents, but the review happened on the site.
Mitigation: every room has its own page on gnoweb (`/r/<namespace>/rooms:room/<id>`), rendered by the realm itself; the confirmation names the call and links that page ("See version 6 as the contract shows it"). Keep the site's deploy keys with the owner.

### R3. Anyone can open a room naming you. Medium.
A stranger can open a room with your address, put in a worthless look-alike token and get ready, so it shows in your list as "They are ready: your turn". With notes (proposed) it could also carry a phishing line.
Mitigation (app, done): rooms from accounts you have never traded with are grouped as invitations; unverified assets are labelled. Notes, when they come, are plain text, never links.

### R4. Names can move to another wallet. Medium, once names are shown.
A GNS name can be transferred, or expire and be registered again. The realm stores addresses only, so a moved name changes nothing on chain.
Mitigation (app): resolve the name when the room opens, show the address beside it, re-resolve on display and say when the name now points elsewhere.

### R5. One side can make settlement impossible. Low (no loss).
An NFT whose issuer vetoes transfers, or eight assets with expensive transfer hooks, can make the second ready mark or a fill fail or run out of gas. Nothing is lost: the other side withdraws its own deposits, which never touch the hostile asset.

### R6. The admin key. Operational, high until handed over.
The admin can pause new activity, set the fee for future rooms (at most 1%) and move the treasury. It cannot move deposits or change the code. If the deploy key is lost the realm keeps working with its current settings; if it leaks, an attacker can pause and redirect future fees.
Mitigation: right after deploying, move the treasury and the admin role to the owner's own wallet (two-step: `ProposeAdmin`, then `AcceptAdmin` from Adena).

### R7. Approvals outlive a failed transaction. Low.
If an approve-and-fill transaction is split or the fill fails, the approval to the realm stays. Only its owner's own calls can use it (`TestThreatApprovalsOnlyServeTheirOwner`).
Mitigation (app): approve exact amounts in the same transaction.

### R8. Re-entrancy through NFT transfer hooks. Mitigated.
A GRC721 issuer's hook runs inside every transfer. Fill holds the room while it pulls assets in and records the taker's side only after everything has arrived; deposits and withdrawals of NFTs record first and transfer second, and settlement and cancellation close the room before sending. Covered by `TestThreatRoomIsHeldDuringFill`; a live attack with a hostile collection on a local chain is not yet written.

### R9. Rounding. Low, by design.
The fee rounds down, so amounts below 200 base units pay nothing. Splitting a trade into many rooms to avoid the fee costs more in gas and storage than it saves.

### R10. Trade chat lives on this site's server. Low.
Messages sit in the site's Redis (Upstash, through Vercel), not on chain and not end-to-end encrypted: whoever runs the site or its Redis can read them, and a compromised site could show messages nobody wrote. A message can never move an asset: settlement still needs both ready marks on the same version.
Sign-in is an Adena SignArbitrary signature over a text the server wrote for that address (site, account, network, a one-time nonce good for five minutes); the server checks that the key belongs to the address and the signature covers exactly that text and network, then issues a 24-hour session token kept in the browser. Adena shows which site asks. Another site that talked someone into signing our text could read that person's trade chats until the session ends, nothing more.
Mitigation (app, done): the chat says what it is and where it is kept; only the two parties of the room, as the realm names them, can read or write; texts are cleaned (`cleanText`); per-address and per-account rate limits. Tests: `chat-verify.test.ts` checks the verifier against a signature made with gno's own JS client and Adena's document builder; `e2e/chat.spec.ts` runs two traders and an outsider on a local chain.

## What was not checked

- Onyx itself: nothing is deployed yet.
- The app's approve-and-fill transaction through Adena: the screens are built and tested in practice rooms; on a chain they wait for the deploy.
- A hostile GRC721 collection exercising its hooks on a live chain.
- An independent audit.
- Trade chat with the real Adena extension: SignArbitrary is in Adena's code (`adena-wallet`, October 2026), and the site says to update Adena when a wallet lacks it; the browser tests use a stand-in that signs the same document.
