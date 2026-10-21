# Church Books — going live on the RCC Hub's Firebase project (`bedsidercc`)

**Status:** LIVE since 2026-10-19 (Nick said go). The rules (v22) and the 9 books functions are deployed to `bedsidercc`. `firebase.json` now points at v22 plus the books codebase; the old one is `firebase.before-books.json`. No church has been started yet.

Nick allows the books to share the Hub's Firebase project. There must be no link on the Hub home screen, and none was added. The app still runs from this computer (`http://localhost:8765/Accounting/index.html?cloud&live`), so nobody finds it by accident.

## What changes in the Hub's project

| What | Change | Effect on the Hub |
|---|---|---|
| Firestore rules | `firestore-v21.rules` → **`firestore-v22.rules`**: v21 unchanged, plus one block of 49 lines between `BEGIN/END CHURCH BOOKS`, placed before the default-deny rule | None. Only `orgs/`, `bookUsers/` and `bookInvites/` are added; the Hub uses none of them. Helpers are named `books…` and scoped to that block, so they can't clash with the Hub's `isAdmin()` and friends. |
| Storage rules | `storage.rules` → **`storage-v22.rules`**: unchanged, plus one 16-line block for `orgs/{org}/files/…` | None |
| Functions | A new codebase **`books`** from `Accounting/firebase/functions`, with 9 functions: `booksPostEntry`, `booksReverseEntry`, `booksLockMonth`, `booksUnlockMonth`, `booksUpdateSetup`, `booksImport`, `booksInviteMember`, `booksJoinOrgs`, `booksCreateOrg` | None. The Hub's 34 functions are in the `default` codebase and aren't touched. No names clash. |
| `firebase.json` | Points at the v22 rules and adds the `books` codebase. The ready file is `Accounting/firebase/golive/firebase.json` | Later Hub deploys keep the books rules and functions (as they should) |
| Setting | `Accounting/firebase/functions/.env.bedsidercc`: `BOOKS_PLATFORM_ADMINS=nick@rochesterchristian.church`. Only this person can start a church's books | — |

The Hub's nightly backup (`backupFirestore`) copies every collection, so the books are backed up with it. The Hub's own users and admins get **no** access to the books. A books membership is separate (tested).

## Checked before asking

- 51 engine tests pass.
- 10 function tests and 5 rule tests pass on the emulators. The rule tests also pass against the **merged** v22 Hub files.
- New test: the Hub's own rules behave the same (users, admin powers, default deny).
- New test: a Hub admin can't see the books without a books membership.
- `firebase deploy --dry-run` against `bedsidercc`:
  - `firestore-v22.rules compiled successfully`
  - `storage-v22.rules compiled successfully`
  - books functions packaged (67 KB)
  - nothing was deployed
- Confirmed nothing named `books*` exists in the project yet.
- The diff from v21 to v22 adds lines only; it removes or changes nothing.

## Going live (run from the `RCC App Hub` folder, only after Nick says go)

```
cp firebase.json firebase.before-books.json            # keep the old one for rollback
cp Accounting/firebase/golive/firebase.json firebase.json
firebase deploy --project bedsidercc --only firestore:rules,storage
firebase deploy --project bedsidercc --only functions:books
```

If `firestore-v21.rules` or `storage.rules` changed after 2026-10-19, rebuild the merged files first:
`node Accounting/firebase/tools/merge-rules.js firestore-v21.rules firestore-v22.rules storage.rules storage-v22.rules`

Then:

1. In sample mode, open Settings → History & export → **Export everything** (or use a real export later).
2. Open `http://localhost:8765/Accounting/index.html?cloud&live` and sign in with Google as nick@rochesterchristian.church.
3. On **Start a church's books**, pick the file and an id. Suggestion: `rcc-trial` for the sample data; keep `rcc` for the real books later.
4. Invite others from Settings → People & roles → **Invite to sign in**.

## Rolling back

```
cp firebase.before-books.json firebase.json
firebase deploy --project bedsidercc --only firestore:rules,storage      # back to v21: the books data becomes unreachable
firebase functions:delete booksPostEntry booksReverseEntry booksLockMonth booksUnlockMonth booksUpdateSetup booksImport booksInviteMember booksJoinOrgs booksCreateOrg --project bedsidercc
```

Any books data already written stays under `orgs/`, out of reach, until it's deleted in the console.

## Built since, NOT deployed (2026-10-19)
Church roles, privacy and server-side controls. They're built and tested on the emulators (18 cloud tests, plus a browser run with made-up accounts), and none of it is live yet.
- **Roles:** ministry `leader` (sees only their budgets' reports, built by the server), `counter` (two-person counts) and expiring access (`untilMs`).
- **Private storage:** `orgs/{org}/private/{donors|payroll|medical|benevolence}` — the owner, plus whoever the owner grants. Imports route donors, gifts of property and staff there.
- **Approvals:** recorded by `booksApprove`. Bills and spending paid from the bank need them before `booksPostEntry` will book them, and the amount must match.
- **Check numbers:** issued by `booksReserveChecks`; `booksVoidCheck` voids one; a check is booked only with an issued number.
- **Counts:** `booksStartCount` and `booksConfirmCount` (a different person, matching totals; the server books it).
- **Owner controls:** only the owner can reopen a closed month. `alerts` record big payments (over `policies.alertOver`, default $5,000), reopened months and role changes.

To deploy later:
1. Rebuild the merged rules: `node Accounting/firebase/tools/merge-rules.js firestore-v21.rules firestore-v22.rules storage.rules storage-v22.rules`
2. `firebase deploy --project bedsidercc --only firestore:rules,storage`
3. `firebase deploy --project bedsidercc --only functions:books`

Until then, Hub function deploys should use `--only functions:default`.

## Known gaps (fine for a trial)

- Two people editing the same kind of everyday work at the same moment: the last save wins.
- Viewers still see the action buttons. The server refuses their changes and the app says "Not saved".
- Senders (phone receipts) can't use cloud mode yet.
- Real RCC books need opening balances on a go-live date; there's no screen for that yet.
