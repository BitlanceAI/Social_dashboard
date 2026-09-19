## Solo plan and trial billing

The new Solo plan includes one social account, one user, one workspace, 20 AI generations per calendar month (UTC), and two automatic pipeline posts across the 15-day trial. Monthly billing is INR 300. Annual billing defaults to INR 3,000, following the catalog's existing ten-month annual pricing convention. The other three plans remain in the catalog.

Admins can change prices, trial days, generation allowance, trial automatic-post allowance, account/workspace limits, and whether new signups require payment authorization in **Admin > Plans**. Empty allowance fields mean unlimited; zero disables that allowance. Trial duration and mandate changes apply to new checkouts; allowance changes apply immediately. Existing subscriptions are not retroactively required to authorize payment again.

Signup creates the identity first and directs the customer to Billing. App access remains locked until payment authorization succeeds. Checkout explicitly collects recurring-payment consent and uses Razorpay's future `start_at` date. Authentication keeps the subscription in its trial state; provider confirmation controls paid activation and renewals. Customers may cancel an authorized trial before the first subscription charge. Paid cancellation stops renewal and retains access until the paid period ends.

## Deployment configuration

For unrestricted Bitlance admin access, also apply `20260919150000_admin_billing_exemption.sql`. The exemption requires the confirmed Supabase Auth email `bitlanceai@gmail.com` and the `admin` role in `public.users`. It bypasses subscription payment/trial checks and plan limits for accounts, workspaces, team members, daily posts, AI generations, and pipeline posts in that admin's workspaces. Authentication and workspace permissions remain enforced. Other admins and customers keep their normal allowances. No payment mandate is created for this account.

1. Apply `supabase/migrations/20260919120000_solo_trial_billing.sql` before deploying the application changes. This migration has been tested against an isolated PostgreSQL engine, not the production database.
2. In Razorpay, create a monthly plan with interval 1, INR 30,000 paise, and a yearly plan with interval 1, INR 300,000 paise. Paste their IDs into Solo's monthly/yearly Razorpay fields in Admin > Plans. If you choose different prices, update both the catalog and provider plans. Checkout rejects mismatched prices or intervals.
3. Configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`. Use test-mode credentials and plans for acceptance testing before live mode.
4. Configure Razorpay subscription webhooks to the publicly reachable `/api/billing/webhook`: authenticated, activated, charged, pending, halted, cancelled, and completed. The endpoint verifies the raw-body signature and fetches current provider state to handle delayed events.
5. Test mandate authorization, trial cancellation, first charge, recurring success/failure, and cancellation at period end using Razorpay test mode. A small refundable authentication charge may occur during payment setup.

No Razorpay plan IDs, live charges, or production migration changes were created by the local implementation.

## Allowance accounting and recovery

### Manually received payments

Apply `supabase/migrations/20260919140000_manual_subscription_payments.sql` to enable **Admin > Plans > Subscriptions > Mark payment received**. Enter the received amount, receipt/reference, and a future paid-through date. This grants the customer's current plan until that date without requiring Razorpay configuration or creating a payment mandate. Existing automatic charges continue unless cancelled separately.

Each payment records the admin, currency, amount, reference, and expiry in `manual_subscription_payments`. Access and the audit entry are committed in one database transaction. Retrying the same request does not duplicate the record. Manual access is stored separately from provider status, so webhook events do not erase it; access expires automatically at the recorded date. A later record never shortens previously granted manual access.

AI caption generation and template image generation each consume one generation; a pipeline's caption-and-image run consumes one generation. Reservations are atomic across concurrent requests and use the workspace owner's plan. Failed generation returns its reservation. Automatic pipeline posts reserve their trial allowance before generating, so an exhausted trial does not spend another generation. Failures before a publish attempt return that reservation. Once publishing is attempted, an ambiguous provider failure retains the reservation to avoid exceeding the allowance through retries.

The database enforces account and workspace capacity, including OAuth callbacks and concurrent workspace creation. A Facebook Page and its linked Instagram account count as two targets, matching the existing account model. A Solo customer can connect one LinkedIn profile or one Facebook target without an included Instagram target; independently selecting Instagram alone is not supported by the existing page picker.

Checkout creation is serialized. If a provider request times out or the database fails after provider creation, `checkout_started_at` remains set to prevent duplicate debit mandates. An operator must inspect Razorpay for the user's subscription (the provider notes contain `user_id`) and reconcile the saved subscription ID before resetting the claim. Do not blindly clear the claim and create another subscription.

## Validation

- `node server/tests/billing.test.js` — authorization, trial expiry, recurring states, duplicate checkout, price matching, cancellation, webhooks, and generation reservations; all provider/database calls mocked.
- `node server/tests/billing-migration.test.mjs <path-to-pglite/dist/index.js>` — isolated PostgreSQL migration, caps, reconnects, quota concurrency and RPC permissions.
- `server/tests/billing-browser.py` — Playwright test against a local Vite server; all external requests intercepted, including checkout.
- Client production build and focused ESLint checks.

Provider reference: [Razorpay subscription testing](https://razorpay.com/docs/payments/subscriptions/test/) and [subscription states](https://razorpay.com/docs/payments/subscriptions/states/).
