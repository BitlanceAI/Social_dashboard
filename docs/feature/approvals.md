# Post approvals

## Status

Implemented for in-app review and optional WhatsApp approval.

## What it provides

- An approval queue divided into pending, rejected, and approved items.
- Approve or reject a scheduled post from the application.
- Capture rejection feedback and revise rejected captions.
- Save approver phone numbers per workspace.
- Send WhatsApp template messages with Approve and Reject actions.
- Accept caption edits and rejection reasons through WhatsApp replies.
- Resend approval requests and issue timed reminders.

## Decision behavior

The first valid approval or rejection wins. Approved posts return to the appropriate native or application scheduling path. Rejected posts are cancelled but retained with feedback so their caption can be revised and resubmitted.

WhatsApp approval is available only when the required WhatsApp Cloud API configuration is present.

## Implementation

- Client: `client/src/features/meta/components/ApprovalQueuePanel.jsx`
- Revision UI: `client/src/features/meta/components/RevisionDialog.jsx`
- Approval domain: `server/src/modules/approvals/`
- WhatsApp integration: `server/src/modules/whatsapp/`

