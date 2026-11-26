# Browser tests

## Practice rooms and accessibility (no chain)

```bash
npm run build
npx playwright test e2e/practice.spec.ts e2e/a11y.spec.ts   # starts `npm run start` itself
```

`a11y.spec.ts` runs axe on every page and in a practice room mid-trade.

Point at a running server instead with `E2E_BASE_URL=http://localhost:3000`.

## A real trade on a local chain

`chain.spec.ts` opens rooms, deposits GNOT and wrapped GNOT, locks, races a
change against a lock, cancels, and uses the board, all through the deployed
realms. Two browser contexts play the two parties. `adena-standin.ts` stands
in for the Adena extension: it answers Adena's injected API and signs with
gnokey and throwaway local keys, in both of Adena's broadcast modes (after
the block, and after CheckTx only).

1. Build `gno`, `gnokey` and `gnodev` from the `chain/mainnet` branch of
   github.com/gnolang/gno.
2. Make two local keys with empty passwords in a throwaway home, e.g.
   `GNOHOME=/tmp/tw-keys gnokey add alice` and `bob`.
3. Start a chain that funds them and loads wrapped GNOT:

   ```bash
   gnodev local -no-watch \
     -add-account <alice>=100000000000ugnot -add-account <bob>=100000000000ugnot \
     -paths gno.land/r/nt/grc20reg/v0,gno.land/r/gnoland/wugnot
   ```

4. Deploy the realms under alice's address:

   ```bash
   echo "" | GNOHOME=/tmp/tw-keys GNOKEY_PASSWORD_STDIN=1 \
     scripts/gno/deploy.sh alice <alice> local
   ```

5. For the NFT test, deploy the test collection under alice too, with its
   import pointed at the deployed rooms realm:

   ```bash
   dir=$(mktemp -d); cp gno/testing/lanterns/* "$dir"/
   sed -i "s#gno.land/r/tradewindow/rooms#gno.land/r/<alice>/rooms#; s#gno.land/r/tradewindow/testing/lanterns#gno.land/r/<alice>/lanterns#" "$dir"/*
   gnokey maketx addpkg -pkgpath gno.land/r/<alice>/lanterns -pkgdir "$dir" \
     -gas-fee 1000000ugnot -gas-wanted 100000000 -max-deposit 10000000ugnot \
     -broadcast -chainid dev -remote http://127.0.0.1:26657 alice
   ```

6. Run the app with the variables the script printed, then the tests:

   ```bash
   NEXT_PUBLIC_GNO_CHAIN_ID=dev NEXT_PUBLIC_GNO_RPC_URL=http://127.0.0.1:26657 \
   NEXT_PUBLIC_GNO_WEB_URL=http://127.0.0.1:8888 \
   NEXT_PUBLIC_GNO_ROOMS_PATH=gno.land/r/<alice>/rooms \
   NEXT_PUBLIC_GNO_BOARD_PATH=gno.land/r/<alice>/board \
   npm run dev -- -p 3300

   E2E_BASE_URL=http://localhost:3300 E2E_GNOHOME=/tmp/tw-keys \
   E2E_ROOMS_PATH=gno.land/r/<alice>/rooms E2E_LANTERNS_PATH=gno.land/r/<alice>/lanterns \
   E2E_MAKER=<alice> E2E_TAKER=<bob> \
   npx playwright test e2e/chain.spec.ts --project desktop
   ```

`screens.spec.ts` takes screenshots of the same screens for design review
when `E2E_SCREENS` names a folder.

Never give these scripts a real key: the stand-in signs whatever the page
asks it to.

## The launch page on a local chain

`launch.spec.ts` plays the owner on `/launch`: it registers a name, publishes
rooms and board from the stand-in wallet, and checks that the page and the
chain show the owner as admin and treasury. It needs the name registry on the
local chain and an account with coins and no name:

```bash
gnodev local -no-watch -add-account <owner>=1000000000ugnot \
  -paths gno.land/r/nt/grc20reg/v0,gno.land/r/gnoland/wugnot,gno.land/r/sys/namereg/v0
NEXT_PUBLIC_GNO_CHAIN_ID=dev NEXT_PUBLIC_GNO_RPC_URL=http://127.0.0.1:26657 \
NEXT_PUBLIC_GNO_WEB_URL=http://127.0.0.1:8888 npm run dev -- -p 3300
E2E_BASE_URL=http://localhost:3300 E2E_GNOHOME=/tmp/tw-keys \
E2E_LAUNCH_KEY=<key> E2E_LAUNCH_ADDRESS=<owner> E2E_LAUNCH_NAME=nym-launchtest123 \
  npx playwright test e2e/launch.spec.ts --project desktop
```

## Trade chat on a local chain

`chat.spec.ts` makes three fresh accounts (mnemonics recovered into the test
GNOHOME and funded by alice), opens a room between two of them, signs both
in to the chat with the stand-in's SignArbitrary, sends a message each way,
reloads without signing again, and checks that the third account is refused
and that a signature by one account cannot open another's session. A second
test checks what an Adena without SignArbitrary says. Use the chain and the
`npm run dev` server from the chain tests (`next dev` keeps chat in memory):

```bash
E2E_BASE_URL=http://localhost:3300 E2E_GNOHOME=/tmp/tw-keys \
E2E_ROOMS_PATH=gno.land/r/<alice>/rooms E2E_MAKER=<alice> \
  npx playwright test e2e/chat.spec.ts --project desktop
```

With `E2E_SCREENS=<folder>` it also photographs the chat signed out and in
use.
