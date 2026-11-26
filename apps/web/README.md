# Trade Window site

Next.js 16 app for the Trade Window realms. See the repository `README.md`
and `AGENTS.md` first.

```bash
cp .env.example .env.local   # optional; defaults are the Onyx testnet
npm ci
npm run dev                  # http://localhost:3000
```

| Command | What |
| --- | --- |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm test` | Unit tests (vitest) |
| `npm run build` | Production build (webpack) |
| `npx playwright test e2e/practice.spec.ts` | Browser tests of practice rooms |

`e2e/README.md` explains the browser test of a full trade on a local chain.

Where things are:

- `src/lib/chain`: reads from the realms, messages for them, amounts, addresses.
- `src/lib/wallet`: Adena adapter and the shared wallet state.
- `src/lib/venue`: testnet rooms (realm plus Adena) and practice rooms (browser).
- `src/components/room`: the room working surface.
- `src/components/home`: the home scene (three.js, loaded on the home page only).
- `src/app/globals.css`: design tokens; direction in `docs/design/DIRECTION.md`.
