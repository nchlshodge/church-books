# The giving page — design

*Draft, 2026-10-19. Nothing here is built against Stripe or deployed. The mockup runs on sample data at `Accounting/giving/index.html?church=<id>`.*

## What it is

A simple, phone-first page where church members give. It's like Planning Center Giving, but smaller:

- **Give once:** an amount, a way to give (from `setup.js` → `giving`), bank or card, and an optional "cover the fee". Guests can give without an account.
- **Recurring gifts:** weekly, every 2 weeks, monthly, or the 1st and 15th. Each has a start date and either an end date or "until I stop". Givers can pause, edit or stop them.
- **My giving:** this year's gifts, year-end statements, saved payment methods, and pledge progress. The pledge box is the same one the books show (`giverPledgeHTML` → `BooksPledges.progress`), with "Give $X now" (one tap) and "Give it monthly".
- **Sign-in with no password:** the giver types an email and gets a 6-digit code plus a sign-in link.
- **Each church's own look:** name, logo and color come from `setup.js` (an optional `brandColor`, or `givingSite: { color, rates, amounts }`).

Money moves through **Stripe Connect**. Each church has its own connected Stripe account and is the merchant of record. Card and bank details are entered only in Stripe's own fields (the Payment Element and Financial Connections), so they never reach our servers. Church Books only sees ids, the last 4 digits, and amounts.

The pure math lives in `engine/giving.js` (tested in `engine/test/giving.test.js`): recurring dates, fees, covering the fee, turning a payout's charges into amounts by way to give, and year totals.

## Stripe setup per church

| Piece | Choice | Why |
|---|---|---|
| Account type | **Standard** connected account, created through Connect onboarding from the books' Settings | The church owns its Stripe dashboard, its payouts, disputes and its nonprofit pricing. We never hold the money. |
| Charges | **Direct charges** on the connected account (`Stripe-Account: acct_…`) | The church is the merchant of record. Its name appears on statements, and Stripe's fees come out of its balance. If Church Books charges for the service, that's an `application_fee_amount` or a plain subscription, decided separately. |
| Payment methods | `us_bank_account` (ACH through Financial Connections, instant verification) and `card` (with Apple Pay / Google Pay) | Bank is the default and is labeled "Lowest fee": 0.8%, capped at $5, compared with 2.9% + 30¢ for cards. Rates live in `BooksGiving.RATES` and can be changed per church with `givingSite.rates`. |
| Payouts | Daily automatic payouts to the church's deposit bank (`policies.depositBank`) | Each payout becomes one entry in the books, like the Planning Center payouts do today. |

Our server keeps the church's `acct_…` id plus a lookup from `stripeAccounts/{acct}` to `{ org }`, so a webhook can find its church. The platform's secret key and webhook signing secret go in Secret Manager, never in Firestore. No per-church API keys are needed, because Connect calls are made with the platform key plus the `Stripe-Account` header.

## Data model

Amounts are whole cents and dates are `YYYY-MM-DD`, the same as the engine.

**Giver.** This is a person who signs in. A household in the books is a *donor*, and several givers can belong to one donor.
```
{ id, name, email, emails?: [], address?, uid,                    // uid = Firebase Auth user
  donor: 'd-parker' | null,                                       // matched household in private/donors (null = waiting to be matched)
  stripeCustomer: 'cus_…',                                        // on the church's connected account
  createdAt, lastSignInAt }
```
**Payment method** (copied from Stripe for display, with no numbers beyond the last 4): `{ id, type: 'bank'|'card', label: 'Chase', last4, stripe: 'pm_…', mandate?: 'mandate_…' }`.

**Gift.** There is one gift per successful charge attempt.
```
{ id, giver | null, donor | null, name, email,                   // guests: name + email only
  date, giving: 'legacy', amount, cover, gross, fee, net,          // BooksGiving.charge(): amount = what they chose, cover = extra for the fee
  method: 'bank'|'card', methodLabel,
  status: 'processing' | 'paid' | 'failed' | 'refunded' | 'disputed',
  recurring?: 'r-…', pledge?: 'pl-…',
  stripe: { paymentIntent: 'pi_…', charge: 'ch_…', invoice?: 'in_…', payout?: 'po_…' },
  receiptSentAt?, refundedAmount? }
```
**Recurring gift.**
```
{ id, giver, giving, amount, coverFee, method: 'pm_…',
  frequency: 'weekly' | 'every2weeks' | 'monthly' | 'firstFifteenth', start, end | null,
  status: 'active' | 'paused' | 'cancelled', failures: 0,
  stripe: { schedule: 'sub_sched_…', subscriptions: ['sub_…'] }, nextDate }   // nextDate = BooksGiving.next()
```
**Payout.** These are the existing `payouts/{id}` documents, shaped like `PAYOUTS` in the app: `{ id: 'po_…', date, gifts, split: byGiving, fee, refunds, disputes, status: 'New'|'Recorded', entryId }`.

Every PaymentIntent and Subscription carries `metadata: { org, giving, giver, recurring?, pledge?, cover }`, so any Stripe object can be traced back without a lookup.

## Firestore paths

The paths follow the pattern in `multi-tenant-firebase.md`: everything lives under `orgs/{org}/`, the server does all writing, and the giver's own data is private.
```
orgs/{org}/public/giving              name, shortName, logo, color, ways to give (id, name, about, color), stripe publishable key + acct id,
                                      fee rates, amounts. Anyone can read it — it's what the giving page loads.
orgs/{org}/givers/{giverId}           the giver (above)
orgs/{org}/givers/{giverId}/methods/{pmId}
orgs/{org}/gifts/{giftId}
orgs/{org}/recurring/{id}
orgs/{org}/payouts/{po_id}            (existing path)
orgs/{org}/stripeEvents/{evt_id}      webhook events already handled (idempotency), kept 90 days
orgs/{org}/settings/giving            acct id, onboarding status, payout bank, who hears about failures/disputes — admins only
stripeAccounts/{acct_id}              { org } — server only
```
Rules sketch (not deployed). Givers get a custom claim `givers: { [org]: giverId }` when they sign in:
```
function giverId(org) { return request.auth != null ? request.auth.token.get('givers', {}).get(org, null) : null; }
match /public/giving        { allow read: if true; allow write: if false; }
match /givers/{g}           { allow read: if giverId(org) == g || booksPrivate('donors'); allow write: if false; }
match /givers/{g}/methods/{m} { allow read: if giverId(org) == g || booksPrivate('donors'); allow write: if false; }
match /gifts/{id}           { allow read: if (giverId(org) != null && resource.data.giver == giverId(org)) || booksPrivate('donors'); allow write: if false; }
match /recurring/{id}       { allow read: if (giverId(org) != null && resource.data.giver == giverId(org)) || booksPrivate('donors'); allow write: if false; }
match /settings/giving      { allow read: if booksMember() && booksRole() in ['owner', 'admin']; allow write: if false; }
```
The giver's actions are callable functions that check the claim and then call Stripe: `givingStart` (makes a PaymentIntent or SetupIntent and returns its client secret), `givingRecurringCreate/Update/Pause/Resume/Cancel`, `givingRemoveMethod`. Board members and counters never see individual givers, because staff access goes through `booksPrivate('donors')` just as the donor list does today.

## Sign-in

- The page has a **6-digit code plus a link in one email.** `givingSendCode({ org, email })` stores a hash of the code under `givingCodes/{hash(email)}` (server-only; it lasts 10 minutes, allows 5 tries, and each email can request a limited number of codes per hour). Then it sends the email. `givingVerifyCode` checks the code, finds the giver or creates one (matched to a donor by email, see below), and returns a Firebase custom token with the `givers` claim. The link in the email holds a single-use token that does the same thing.
- **Guests** don't sign in. Their gift is tied to their name and email, so it can be matched later. Recurring gifts need a sign-in, because the giver must be able to pause or stop them.
- If a guest later signs in with the same email, their earlier gifts show up in their history. The mockup does this with "Includes 1 gift you gave as a guest".

## How a gift flows

1. The page loads `orgs/{org}/public/giving` and Stripe.js with the church's `acct_…`.
2. **Give once:** `givingStart` creates a PaymentIntent on the connected account with the amount (`BooksGiving.charge` → `gross`), the metadata, the customer (if signed in, with `setup_future_usage: 'off_session'` so the method is saved), and `receipt_email`. The Payment Element confirms it in the browser.
3. **Recurring:** a SetupIntent saves the payment method first. Then we create a **Subscription Schedule** that starts on `start` (and ends at `end` with `end_behavior: 'cancel'`). It uses inline `price_data` for the amount, so we don't need a Product per amount.
   - weekly → `interval: week`, every 2 weeks → `week ×2`, monthly → `month`, anchored to the start day.
   - **1st and 15th** → two monthly subscriptions, one anchored to the 1st and one to the 15th, both under one recurring doc. They are paused, edited and cancelled together.
   - **Pause** → `pause_collection: { behavior: 'void' }`. **Resume** → clear it. **Edit amount or fund** → update the item's `price_data` and metadata with `proration_behavior: 'none'`, so the change starts with the next gift. **Stop** → cancel now.
   - We keep `nextDate` ourselves using `BooksGiving.next()`, so the page doesn't need Stripe to show it.
4. A bank gift is `processing` for about 4 business days and then becomes `paid` or `failed`. Statements and pledge progress count gifts that are `processing` or `paid`. If one fails, it's removed and the giver gets an email.

## Webhooks

There is one Connect endpoint, `givingStripeWebhook`. It checks the signature, finds the church from `event.account` → `stripeAccounts`, records `evt_id` in `stripeEvents` and skips it if it's already there, and then handles it:

| Event | What happens |
|---|---|
| `payment_intent.processing` | The gift is created or updated with `status: 'processing'` (bank). |
| `payment_intent.succeeded` / `invoice.paid` | The gift is set to `paid` (one gift per invoice for recurring), the receipt email goes out, and `nextDate` and `failures: 0` are set on the recurring gift. |
| `payment_intent.payment_failed` / `invoice.payment_failed` | The gift is set to `failed`, `failures` goes up by one, and the failed-payment email goes out (see below). |
| `charge.refunded` | The gift is set to `refunded` (or `refundedAmount` is set for a partial refund), and a refund note is emailed. |
| `charge.dispute.created` / `.closed` | The gift is set to `disputed`. The church admins get an alert, and the evidence goes in the church's Stripe dashboard. If the church wins, the gift is set back to `paid`. |
| `payout.paid` | We list the payout's balance transactions (`balanceTransactions.list({ payout })`), find each one's gift, and build the payout with `BooksGiving.payout(charges, coverTo)`. That gives `{ gifts, byGiving, fee, gross, net }`, which is saved as `payouts/{po_id}` with status `New`. |
| `payout.failed` | The church admins get an alert (it's usually a closed bank account). |
| `customer.subscription.updated/deleted`, `subscription_schedule.*` | The recurring gift's status is kept in step with Stripe, in case a change was made in Stripe's dashboard. |
| `mandate.updated`, `payment_method.detached` | The method is marked unusable, and the giver is asked to reconnect their bank. |
| `account.updated` | The church's onboarding status is updated: whether it can take charges and whether payouts are enabled. |

## Into the books

A Stripe payout becomes a **payout** exactly like the Planning Center ones. The treasurer sees it on Giving & deposits as `New` and records it, and `postPayout` → `R.giftsDeposit` posts it:

- Each gift's `amount` is credited to its own way to give (and from there to its funds through the giving split).
- The **fee-cover** part of a gift goes to the offering that pays fees, which is the way to give whose split is 100% `policies.feeFund` (Tithes & Offerings for RCC). So a $150 Legacy gift with $1.21 to cover the fee credits Legacy exactly $150, and the $1.21 offsets the fee in the General Fund. This keeps the "designated gifts stay whole" policy.
- The fee goes to account 5500 in `feeFund`, the same as today.
- The source is `{ type: 'stripe_payout', id: 'po_…' }`, so a payout can only post once.
- **Refunds and disputes** inside a payout appear as negative amounts by way to give, and dispute fees are added to the fee. ⚠️ **Follow-up:** `R.giftsDeposit` currently writes a negative amount as a *negative credit* line. Before refunds go live, it needs to post those as debits to the income account (or there needs to be a separate `R.giftsRefund` rule). That change goes in `engine/rules.js` with its own test.
- The bank line from the payout matches the deposit in reconciliation, just as with Planning Center today.

## Receipts and statements

- **Each gift:** an email from the church's receipts address (`setup.receiptsEmail`) when the gift is `paid`. It includes the church name, date, amount, the way to give, "No goods or services were provided in exchange…", and a link (`receiptLinkBase + giftId`). A bank gift also gets a short "it's on its way" email when it starts.
- **Year-end:** in January a scheduled function builds each giver's statement and emails a link to a PDF. Givers can also download it any time from My giving. It totals by way to give, lists every gift, and shows the pledge box. Statements are per *donor* (household), so the household gets one statement even if two spouses each gave. The mockup shows the statement as a printable sheet.

## Failed payments

- **Email to the giver** (warm, not alarming): "Your $150 gift to New Legacy Building didn't go through on Nov 5. Your bank said: not enough money in the account. Nothing else is needed if you'd like to skip it, or [update how you give] (a sign-in link)."
- **Cards:** Stripe Smart Retries (up to 3 tries over about a week). **Bank:** no automatic retry for R01/R09; the giver chooses to try again. R02/R03/R04 (closed or invalid account) mark the method unusable.
- After **3 failures in a row**, the recurring gift pauses itself and the giver is told. The church office is told too (a new `notifications.givingFailures` setting, using the same pattern as `notifications.deposits`).

## Refunds

Only owners and admins can refund. They do it from the gift in the books with `givingRefund({ giftId, amount, reason })`. The function calls `refunds.create` on the connected account, and the webhook marks the gift. The refund comes back out of the next payout. Stripe keeps its original fee, so the fee stays in the books as an expense. If a gift is refunded after its year's statements went out, the giver gets a corrected statement.

## Matching gifts to donors and pledges

- **Giver → donor:** on first sign-in, the giver's email is matched exactly against the donors' emails (`private/donors`, `email` / `emails[]`). If there's a match, `giver.donor` is set. If not, the giver waits in a new **"Online givers to match"** list on Donors & gifts, where an admin picks the household or creates a new one. A second email can be added to a household so that both spouses match.
- **Guest gifts:** these have a name and email but no giver. They're matched the same way when the email appears later. If a gift is still unmatched at year end, it goes on the same list, and the receipt still went to the email the guest typed.
- **Pledges:** a pledge belongs to a donor (`pledges[].donor`). Every gift from that donor's givers to the campaign's way to give, between the pledge's start and end, counts. This is exactly what `BooksPledges.progress` does in the books and on the page, using the gift's `amount` (not the fee-cover part). "Give toward my pledge" also sets `gift.pledge` so the treasurer can see why a gift was given, but the total doesn't depend on it.
- **Planning Center during the switch:** while both are running, gifts from PCO payouts and from Stripe payouts count the same way. Each payout posts once because of its source id.

## What the mockup does vs. what needs Stripe

| In the mockup (works now, sample data) | Needs Stripe / the server to be real |
|---|---|
| Give once as a guest or signed in; fee shown for bank vs card; cover-the-fee math (`BooksGiving.cover`) | PaymentIntent + Payment Element; real fees come from the balance transaction |
| "Connect your bank" picks a sample bank; "Use a test card" | Financial Connections and the card element; saving methods to the Stripe customer |
| Recurring gifts: create, pause, resume, edit, stop; next dates from `BooksGiving.next` | Subscription Schedules (two for 1st & 15th), `pause_collection`, webhooks keeping them in step |
| Sign-in: the code is shown on screen and "tap the link" signs you in | Sending the email, storing the hashed code, custom-token Firebase sign-in, rate limits |
| My giving: history (sample households give monthly on the 5th), pledge box, one-tap pledge gift, statement sheet and print-to-PDF | Gifts written by webhooks; PDF statements; receipt emails |
| Saved in this browser only (`localStorage`); "Reset demo" in the footer | Firestore under `orgs/{org}/…` with the rules above |
| — | Payout → books, failed-payment emails, refunds, disputes, matching queue, Connect onboarding |

## Before it goes live

1. Decide whether Church Books charges churches for giving (an application fee per gift, or part of the plan).
2. Fix the refund lines in `R.giftsDeposit` (see Into the books).
3. Have the CPA confirm the wording on receipts and statements, and that fee-cover money goes to the operating fund.
4. Do Stripe Connect onboarding for RCC in test mode, and run the page against Stripe's test clocks so recurring gifts can be watched over months.
5. Point a church subdomain or a path (`give.<product>.com/rcc`) at the page. It stays off the RCC App Hub homescreen.
