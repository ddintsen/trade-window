# Verify a Trade Window swap on Onyx

Room 1 settled on the Onyx testnet (`onyx-1`) on 26 November 2026. Two test wallets exchanged native GNOT for wrapped GNOT (WUGNOT, a GRC20 token).

[Inspect Room 1](https://onyx.testnets.gno.land/r/nym-tradewindow001/rooms:room/1) · [Read the settlement receipt](https://rpc.onyx.testnets.gno.land/tx?hash=0xC01FD8BA64FFB440632CF51D21736152540D5A52876BD58842765F73435A06B6)

## Why the first lock did not settle

| Step | Room state | Onyx receipt |
| --- | --- | --- |
| Maker opens an invite-only room | Version 1, open | [Block 1435282](https://rpc.onyx.testnets.gno.land/tx?hash=0x0E822F5319952F3EC5EFC57C3A8254FBE46B0B50F90733C35831DCF775F58505) |
| Both wallets deposit | Version 3, open | [1 GNOT](https://rpc.onyx.testnets.gno.land/tx?hash=0x025F6FBCC58F14679529A0018134352FDFADCFB61AEF5390696EDBC76E967C20) · [2 WUGNOT](https://rpc.onyx.testnets.gno.land/tx?hash=0x1F4F745567E3F680A3C5E4F681DDE3313FD30E25B26C1A0AFC68601E49574B9F) |
| Maker locks version 3 | Version 3, maker locked | [Block 1435319](https://rpc.onyx.testnets.gno.land/tx?hash=0x527457AED3765A7F347EE23CA9ADE8E01D92AC09559F3D87E59DBA48A9B208E2) |
| Maker adds 0.1 GNOT | Version 4, prior lock no longer applies | [Block 1435320](https://rpc.onyx.testnets.gno.land/tx?hash=0x9037207F96890C79BEE90EB262BC1FD6CDDDB4EA76AA9B27603989C472E2E46F) |
| Taker locks version 4 | Open, maker's lock still points to version 3 | [Block 1435334](https://rpc.onyx.testnets.gno.land/tx?hash=0xD4143011E4666C69AC7AAFE3D1801E047EB57E64F7FBFAB35BA2777A5C1A2EFD) |
| Maker locks version 4 | Both locks match. The same transaction emits `Settled` and transfers both assets. | [Block 1435335](https://rpc.onyx.testnets.gno.land/tx?hash=0xC01FD8BA64FFB440632CF51D21736152540D5A52876BD58842765F73435A06B6) |

## Wallet balances around the final lock

| Wallet | Asset | Before | After |
| --- | --- | ---: | ---: |
| Maker | WUGNOT | 0 | 1.99 |
| Taker | GNOT | 46.3348 | 47.4293 |
| Maker | GNOT | 47.8463 | 46.9238 |
| Taker | WUGNOT | 1 | 1 |

Room fees were 0.0055 GNOT and 0.01 WUGNOT. The final lock used 23,787,307 gas. The signing wallet paid 0.0975 GNOT in network fees and 0.825 GNOT in storage deposits, itemized in the settlement receipt. The wallet balances were read immediately before and after that lock. The test wallets were funded by the Onyx faucet.
