# Church Books — saving to Firebase, many churches

**Status:** built, tested, and deployed to `bedsidercc` (2026-10-19) · **First customer:** RCC

## What's built (2026-10-19)

| Piece | Where |
|---|---|
| Cloud Functions: `booksPostEntry`, `booksReverseEntry`, `booksLockMonth` (writes a snapshot), `booksUnlockMonth`, `booksUpdateSetup`, `booksImport`, `booksInviteMember`, `booksJoinOrgs`, `booksCreateOrg` | `firebase/functions/index.js` (runs the same `engine/*.js`) |
| Hash chain (tamper evidence), checked by the server on write and by the app on every load | `engine/chain.js` |
| Firestore and Storage rules | `firebase/firestore.rules`, `firebase/storage.rules` |
| Tests: 4 function tests and 5 rule tests, including one church never seeing another | `firebase/test/` |
| Starting a church (org, first setup, owner invite) | `firebase/tools/create-org.js` |
| The app in cloud mode: sign-in, loading, saving, file uploads, invites | `index.html?cloud`, `cloud.js`, `cloud-config.js` |

**How the app saves.** The ledger never changes in the browser alone. Every post, reversal and lock goes to the functions one at a time and in order. Setup changes go first, through `updateSetup`. Everything else is saved under `workspace/{kind}`, one document per kind, about a second after it changes: bills, vendors, checks, reconciliations, the file list and so on. Receipts are saved one per document under `expenses/{id}`, so senders can be limited to their own. Files are saved to `orgs/{org}/files/{fileId}/{name}` and are never replaced or deleted.

**Moving a church in.** In sample mode, use Settings → History & export → **Export everything**. Then the owner signs in to the empty cloud books and brings in the file. `importBooks` re-checks every entry with the engine before it writes anything.

**Try it on this computer.**
```
cd Accounting/firebase && firebase emulators:start --project demo-churchbooks      # needs Java (brew openjdk@21)
node tools/create-org.js --org rcc --setup ../churches/rcc/setup.js --owner you@church.org --person nick   # with FIRESTORE_EMULATOR_HOST=127.0.0.1:8299 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9299
open http://localhost:8765/Accounting/index.html?cloud                                # the test password is in firebase/emulator-users.json
firebase emulators:exec --project demo-churchbooks "node --test --test-concurrency=1 test/*.test.js"   # the cloud tests
```

**Not done yet:**
- Deployed to `bedsidercc` on 2026-10-19. See `docs/go-live-bedsidercc.md`.
- Two people editing the same kind of everyday work at the same moment: the last save wins. Live updates (onSnapshot) would fix this.
- Viewers still see the action buttons. The server refuses their changes and the app shows "Not saved", but the buttons should be hidden.
- Senders can't use cloud mode yet; the rules for their own receipts are ready. Next steps: a phone receipt page, the inbound receipt email, and the Planning Center import.

## The goal

Many churches use one hosted app. Each church sees only its own books. The books can't be altered after the fact, even by someone with database access, without that being detectable. RCC is simply the first church. Nothing in the code is about RCC.

## Decisions

1. **The app gets its own Firebase project, separate from the RCC Hub.** The Hub's project (`bedsidercc`) is RCC's internal tool; the books product is something you sell. Plan on two projects, `churchbooks-staging` and `churchbooks-prod`, on the Blaze plan with a budget alert. RCC's Hub can link to it later.
2. **There's one database for all churches, and every record lives under its church.** The path always starts with `orgs/{orgId}/…`, so nothing is ever stored outside a church, and the security rules check that one id everywhere.
3. **The browser never writes to the ledger.** Entries, reversals, locks and setup changes go through Cloud Functions. They run the same engine files (`engine/*.js`) that already pass the tests, so the rules are enforced the same way in both places. The browser only reads the ledger. It *can* write everyday work: a receipt photo, an expense request, a note.
4. **Every church's setup is one document** with the same shape as `churches/rcc/setup.js`. Changes go through `updateSetup`, which runs `validateSetup()` and keeps every past version.

## Where the data lives

```
users/{uid}                          name, email, orgs: { rcc: 'admin', … }   ← quick lookup for the app
orgs/{orgId}                         name, shortName, plan, status, createdAt
  settings/setup                     the church's setup (funds, giving splits, banks, cards, budgets, policies)
  setupHistory/{version}             every earlier version, who changed it, when
  members/{uid}                      role, personId, name, email, invitedBy
  ledger/state                       seq (next entry number), lockedThrough, lastEntryAt, lastHash
  entries/{JE-00001}                 one posted entry — never updated or deleted
  sources/{type:id}                  { entryId } — guarantees an import posts once
  audit/{autoId}                     who did what, when (append-only)
  snapshots/{YYYY-MM}                account × fund balances at month end, written when a month is locked
  expenses/{id}                      receipt workflow: Needs receipt → Needs review → Done (senderUid = who sent it)
  payouts/{id}  bankLines/{id}  inbox/{id}  subscriptions/{id}  checks/{id}
Storage: orgs/{orgId}/receipts/{expenseId}/{file}
```

**Why snapshots:** a church posts a few thousand entries a year, so reading the current year straight from `entries` is fast enough. Earlier years start from the last locked snapshot instead of replaying every entry. Locking a month writes its snapshot, so snapshots can never drift from the entries.

## Writing an entry (Cloud Function `postEntry` and friends)

Every call does the same steps in one Firestore transaction:

1. **Check who's calling.** Their `members/{uid}` role must allow this action.
2. **Load the church's setup and `ledger/state`.**
3. **Validate the draft with the engine.** It must balance within every fund, use real and active accounts and funds, be in whole cents, and not fall in a locked month. The draft alone is enough to check this, so the function never has to load the whole ledger.
4. **Refuse duplicates.** If `sources/{type:id}` already exists, stop with "already posted".
5. **Write the records.** Create `entries/JE-{seq+1}`, `sources/{type:id}` and an `audit` row, then update `ledger/state` (`seq`, `lastHash`).

Callable functions, each a thin wrapper around the engine:

| Function | What it does | Who can call it |
|---|---|---|
| `recordPayout` | Books an online-giving payout using the church's giving splits | bookkeeper, admin, or the giving import |
| `recordDeposit` | Books counted cash and checks | counter, bookkeeper, admin |
| `approveExpense` | Reviewer approval (card charge already booked → reclassify if needed; check / ACH / reimbursement → book it) | reviewer, admin; never your own expense once there are 2+ reviewers |
| `importCardCharges` / `importBankLines` | Card and bank feeds or uploaded files, de-duplicated by source id | bookkeeper, admin, or scheduled import |
| `transferFunds` | Fund-to-fund transfer; restricted money needs `boardApproved` + a note | admin |
| `reverseEntry` | Mirror-image correction with a reason | bookkeeper, admin |
| `lockMonth` / `unlockMonth` | Close a month (writes its snapshot) or reopen it with a reason | admin |
| `updateSetup` | Validates and saves a new setup version | admin |
| `closeYear` | Year-end close | admin |

**Tamper evidence:** every entry stores `hash = sha256(previous hash + this entry)`. An exported ledger can be re-checked end to end. If anyone edits a past entry by hand, the chain breaks. The engine's `fromJSON` already re-validates every entry on load; it would add this hash check.

## Who can see and do what

| Role | Ledger and reports | Expenses | Setup |
|---|---|---|---|
| owner / admin | read | read all, approve | change (through `updateSetup`) |
| bookkeeper | read | read all | read |
| reviewer | read | read all, approve | read |
| sender (staff or volunteer) | none | create their own, read their own | none |
| viewer (board, auditor) | read | read all | read |

Security rules sketch. Everything is denied unless a rule allows it:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function member(org) { return request.auth != null && exists(/databases/$(db)/documents/orgs/$(org)/members/$(request.auth.uid)); }
    function role(org) { return get(/databases/$(db)/documents/orgs/$(org)/members/$(request.auth.uid)).data.role; }
    function canReadBooks(org) { return member(org) && role(org) in ['owner', 'admin', 'bookkeeper', 'reviewer', 'viewer']; }

    match /orgs/{org} {
      allow read: if member(org);
      match /entries/{id}      { allow read: if canReadBooks(org); allow write: if false; }   // Cloud Functions only
      match /sources/{id}      { allow read: if canReadBooks(org); allow write: if false; }
      match /audit/{id}        { allow read: if canReadBooks(org); allow write: if false; }
      match /snapshots/{id}    { allow read: if canReadBooks(org); allow write: if false; }
      match /ledger/{doc}      { allow read: if canReadBooks(org); allow write: if false; }
      match /settings/{doc}    { allow read: if member(org); allow write: if false; }
      match /members/{uid}     { allow read: if member(org); allow write: if false; }
      match /expenses/{id} {
        allow read: if canReadBooks(org) || (member(org) && resource.data.senderUid == request.auth.uid);
        allow create: if member(org) && request.resource.data.senderUid == request.auth.uid
                      && request.resource.data.status in ['Needs receipt', 'Needs review'];
        allow update: if member(org) && resource.data.senderUid == request.auth.uid
                      && resource.data.status != 'Done'
                      && request.resource.data.status in ['Needs receipt', 'Needs review'];   // approving is a function
      }
    }
  }
}
```

Every rule gets a test, the same way the Hub's `test_rules*.py` checks `firestore-v21.rules`, including a test that one church can never read another church's records.

## Connections to outside services, per church

- **Online giving (Planning Center, Tithe.ly, …):** each church connects its own account. Planning Center supports OAuth for apps used by many churches. Tokens go in Secret Manager under the church's id, never in Firestore. A scheduled function imports new payouts and calls `recordPayout`.
- **Receipts email:** one inbound address per church on the product's domain (for example `rcc@receipts.<product>.com`), or the church forwards its own address there. An inbound-mail service (SendGrid Inbound Parse or Mailgun) hands each email to a function, which saves the file to Storage and matches it to a charge. This replaces the Apps Script approach, which only works for one church's Google account.
- **Payroll (Gusto, ADP, …):** start with uploading a payroll summary file; add API connections later.
- **Bank and card feeds:** start with file import (CSV/OFX). Plaid later; it adds cost and compliance work.

## Moving RCC in

1. Create `orgs/rcc` from `churches/rcc/setup.js` (through `updateSetup`).
2. Post the real opening balances on the go-live date (from the bank, card statements and the old books), plus monthly totals for earlier months if you want this year's reports to be complete.
3. Lock everything before go-live.
4. Connect Planning Center, set the receipts email and invite the reviewers and senders.

## Decisions only you can make

- **Product name and domain** (also needed for the receipts email address).
- **Who creates the Firebase project and holds billing.** Keep it separate from RCC's accounts if the product will be its own business.
- **How churches sign up:** invite-only at first (recommended) or open sign-up.
- **An accountant or auditor role:** read-only across a church, possibly across several churches.
- **Pricing and plans:** they decide what goes into `orgs/{orgId}.plan`.

## Build order

1. Two Firebase projects, plus the security rules above with rule tests.
2. Move `engine/` into the functions code as a shared package, then build `postEntry`, `reverseEntry`, `lockMonth` and `updateSetup`, with tests against the Firestore emulator.
3. Make the app read from Firestore instead of the sample files. Keep the `?church=` sample mode for demos.
4. Receipts: photo upload to Storage, then the inbound email parser.
5. Planning Center import (OAuth per church).
6. Onboarding screen that writes a church's first setup.
