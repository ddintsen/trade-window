# Trade Window roadmap

Updated 27 November 2026.

Trade Window is an OTC platform for on-chain assets. Its public board helps people find a counterparty. Wallet-authenticated messages help them agree on terms. The rooms realm holds deposits and settles an agreed exchange when both people lock the same version.

## Where it stands

- The board and rooms realms are live on Onyx under `nym-tradewindow001`.
- Room 1 is a real GNOT–WUGNOT settlement: the maker's lock on version 3 stopped applying after a new deposit, and the swap settled when both wallets locked version 4. [Receipts, balances and gas](ONYX-EVIDENCE.md).
- NFT settlement is implemented and covered by realm tests; its Onyx receipt is the next evidence target.
- Room chat is implemented off-chain with wallet sign-in; it never changes a room.
- Practice mode runs the realm's rules in the browser with a scripted counterparty and play balances.

## Before the Gnome Tavern deadline (18 December 2026)

| Deliverable | Evidence |
| --- | --- |
| Standing offers on Onyx that anyone with test GNOT can fill in one transaction, listed on the board | A fresh wallet fills an offer; the receipt shows `Settled` |
| An NFT-for-GNOT settlement on Onyx | A receipt with the GRC721 transfer and `Settled` under one room ID |
| Automated checks on the submitted revision | Realm and web tests run on every push to the default branch |

## 2027

| Quarter | Deliverable | Evidence |
| --- | --- | --- |
| Q1 | Pilot OTC classifieds for tokens, NFTs and bundles. Add shareable listing pages and search by the assets offered or wanted. Start with collectors and community treasuries. Let visitors browse before connecting a wallet. | A buyer can open a shared listing, find its exact asset and send an offer to the right wallet. Test expired listings, empty results and unavailable asset metadata. |
| Q2 | Carry an accepted structured offer from the board into an invite-only room, with the listing and exact amounts visible at confirmation. Reuse wallet-authenticated messaging for negotiation and the rooms realm for settlement. | The receipt identifies the room, version, asset IDs and payouts. Publish network fees, storage deposits and application fees separately. Test cancellation, expired offers and rollback on a failed transfer. |
| Q3 | Publish a stable, paginated feed and run a pilot with one independent collection, community or wallet integration. Add saved searches and updates when the pilot shows repeat demand. | A third party can index open and closed listings, keep a stable cursor and link back to the room receipt. Report listings, offers, accepted offers, settlements and time to first reply. |
| Q4 | Prototype one cross-chain route on testnets after verifying chain and wallet support. Publish a readiness decision for the native platform and a separate decision for the new route. | Demonstrate completion, timeout and refund, with receipts for both networks and documented recoverable states. An independent review covers asset identity, finality, custody, admin roles, failure recovery and costs. |

## Marketplace pilot

- Start with "I have" and "I want", collection and asset type. A listing carries a shareable URL and an expiry time. Asset references include the network and the canonical realm or collection ID.
- Structure counteroffers as two baskets with exact assets and quantities, the proposed counterparty and an expiry. Keep chat private. An accepted offer is a draft until the parties sign the room actions.
- Use the board as a discovery surface and the rooms realm as the settlement record. A listing can go stale while an asset is still in its owner's wallet, so show when ownership was checked and revalidate the offer before the room is funded.
- In the pilot, prefer verified collections and clear asset provenance. Measure repeat traders and offer-to-settlement conversion before expanding categories.

## Multichain rollout

1. Start with read-only asset discovery. Show the source network, exact asset identity and supported routes before offering a transfer.
2. Choose one route and one fungible asset on two testnets. Compare the available IBC or alternative transport against finality, acknowledgement, expiry and refund requirements.
3. Record each stage and both transaction receipts. Handle duplicate acknowledgements and relay outages in tests, and keep refunds available if a transfer fails or times out.
4. Expand asset classes and networks only after the first route demonstrates settlement and recovery. The same-chain trade guarantee stays scoped to the Gno rooms transaction.

## Mainnet and the Builder Retention Prize

If Trade Window wins an upfront award, the mainnet deployment follows a review of custody, admin roles and fees. The program's checkpoints are counted from the winners announcement:

| Program target | Month 3 | Month 6 |
| --- | --- | --- |
| Unique qualifying addresses | 50 | 100 |
| Transactions calling the project's realms | 500 | 1,500 |
| Monthly active addresses | 20 | 50 |
| Community followers or members | 200 | 500 |

Each checkpoint needs a live mainnet realm, a deployment link, a demo and usage numbers: at least one release or mainnet deployment and two public updates each month, and at least one external integration. Team-funded and newly created wallets do not count. [Official criteria](https://dorahacks.io/hackathon/gnome-tavern/detail#builder-retention-prize).
