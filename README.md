# Church Books

Fund accounting built for churches: giving and deposits, spending and receipts, budgets, missions partners,
pledge campaigns, payroll records, bank match-up, board reports, and bringing data in from QuickBooks.
Built for Rochester Christian Church (RCC) and designed so any church can use it.

**Status: a working mockup on made-up sample data.** Nothing here is a church's real books. The cloud back end
(Firebase) is designed and tested on emulators; only an early version is deployed.

## See it

- **Run it on your computer.** From this folder, start any static web server, for example
  `python3 -m http.server 8765`, then open:
  - <http://localhost:8765/index.html> for Rochester Christian Church (sample data)
  - `?church=rcc-kb` for RCC as it would look after switching to Kingdom Builders (planned for 2028)
  - `?church=grace` for a small, simple church
  - `?church=hope` for a new church with **empty books**. Go to *Bring in data* and open the sample
    QuickBooks files to see an import from start to finish.
- **The giving site** for church members (give once, recurring gifts, pledge progress): `giving/index.html`.

Everything runs in the browser; there's no build step. Reading Excel and PDF files loads two libraries from
cdnjs, so those two need an internet connection.

## How it's put together

| Folder | What's in it |
|---|---|
| `index.html` | The whole app: one page, plain JavaScript |
| `engine/` | The accounting rules, with no screen code: the ledger (double entry, whole cents, every fund balances on its own, entries can't be edited, only reversed), reports, imports, pledges, forecasts and more |
| `engine/test/` | Tests for the engine: `node --test engine/test/*.test.js` |
| `churches/<id>/` | Each church's setup (funds, ways to give, banks, budgets) and its sample data |
| `samples/import/` | Sample QuickBooks exports (CSV, Excel, IIF, PDF) for trying *Bring in data* |
| `giving/` | The congregation giving site (mockup) |
| `firebase/` | The cloud version: security rules, server functions and their tests (run on the Firebase emulators) |
| `docs/` | Design notes: running many churches on one Firebase project, going live, the giving site |
| `shared/` | Copies of the RCC App Hub stylesheet and logo, so this folder works on its own |

## Running the cloud tests

Needs Java 21 and the Firebase CLI. From `firebase/`:

```
cd functions && npm install && npm run sync-engine && cd ..
cd test && npm install && cd ..
firebase emulators:exec --project demo-churchbooks "node --test --test-concurrency=1 test/*.test.js"
```

The `.env.*` files in `firebase/functions` (which list the platform admins) aren't in this repository;
see `docs/multi-tenant-firebase.md`.
