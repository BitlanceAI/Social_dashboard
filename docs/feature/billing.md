# Billing

## Status

Implemented with Razorpay; payment actions require Razorpay configuration.

## What it provides

- A public pricing catalog and plan comparison page.
- A configurable free-trial period.
- Monthly or yearly subscription selection where supported by the plan.
- Razorpay subscription creation and payment verification.
- Current-plan, entitlement, and subscription-status display.
- Subscription cancellation.
- Separate one-time purchases for media-storage capacity.
- Manual payment recording by an administrator.

## Access behavior

Subscription limits apply per account across its workspaces, not per workspace seat. Platform administrators are exempt from normal billing restrictions.

## Implementation

- Client subscription page: `client/src/features/billing/`
- Public pricing page: `client/src/features/marketing/pages/PricingPage.jsx`
- Subscription server: `server/src/modules/billing/`
- Storage purchases: `server/src/modules/storage/`

