# Agency client portal: implementation plan

## Status

MVP implemented in the repository on 2026-09-24. Deployment requires applying
`supabase/migrations/20260924120000_agency_client_portal.sql` before starting
the updated server.

Implemented now: client role and invitations, capability enforcement, editorial
content and immutable versions, shared/internal comments, approval audit events,
approval-to-scheduler handoff, calendar and review UI, client-safe reports,
brand settings, and browser print/PDF output.

Deferred from the broader plan: generated report files and scheduled delivery,
email invitations, multi-step approval chains, and dedicated approval push events.

## Objective

Give each agency client a secure, workspace-scoped portal where they can review a content calendar, preview posts, request changes, approve content, view performance, and download branded reports without gaining publishing, connection, billing, or workspace-administration access.

## Success criteria

- An agency can invite a user with the `client` workspace role.
- A client sees only workspaces and records where they are a member.
- Agency staff can prepare unscheduled drafts and submit them for client review.
- A client can comment, request changes, or approve a specific content version.
- Only the approved version can become a `scheduled_posts` delivery record.
- Every state transition is recorded in an immutable audit trail.
- A client can view a date-range report and download a branded PDF.
- Existing publishing, pipeline, WhatsApp approval, and billing behavior continues unchanged.

## Scope

### MVP

- `client` workspace role and invitation flow.
- Client-specific portal shell.
- Month, week, and list content-calendar views.
- Draft and content-version management by agency staff.
- Comments, change requests, and client approval.
- Conversion of approved content into the existing publishing queue.
- Workspace brand profile.
- Read-only performance dashboard.
- On-demand branded PDF report.
- In-app and web-push notifications.

### Later phases

- Email-based external approval without an account.
- Multi-step and parallel approval chains.
- Scheduled monthly report delivery.
- Campaign budgets, objectives, and lead attribution.
- Social inbox and response assignments.
- Competitor monitoring.
- Fully custom portal domain and email sender.

### Not in the MVP

- Paid-ad campaign management.
- Direct messages from social networks.
- Invoice generation or agency bookkeeping.
- Client access to social tokens, connection controls, subscription billing, or storage purchasing.

## Architectural principles

1. **The workspace remains the tenant boundary.** A client is a constrained workspace member, not a second account system.
2. **Editorial state is separate from delivery state.** Drafts and approvals belong to `content_items`; `scheduled_posts` remains the execution queue.
3. **Approval applies to an exact version.** Editing approved content invalidates approval and creates a new version.
4. **The server is the authorization boundary.** Hiding buttons in the client is not access control.
5. **Publishing is idempotent.** A content item can create at most one active delivery record per approved version and destination set.
6. **Audit records are append-only.** Decisions and comments must remain attributable and timestamped.

## High-level architecture

```text
┌──────────────────────────── React application ────────────────────────────┐
│                                                                          │
│  Agency dashboard                         Client portal                   │
│  - composer                               - content calendar              │
│  - internal review                        - post preview                  │
│  - scheduling                             - comments/decisions            │
│  - report builder                         - reports                       │
│           │                                      │                       │
└───────────┼──────────────────────────────────────┼───────────────────────┘
            │ Bearer token + x-workspace-id        │
            ▼                                      ▼
┌──────────────────────────── Express API ──────────────────────────────────┐
│ auth → workspace resolver → capability guard                             │
│                                                                          │
│ content module   approval module   brand module   reports module         │
│       │                 │                 │              │                │
│       └─────────────────┴──────────┬──────┴──────────────┘                │
│                                   │                                      │
│                        publishing handoff service                        │
│                                   │                                      │
│                    existing Meta/LinkedIn scheduler                      │
└───────────────────────────────────┼──────────────────────────────────────┘
                                    ▼
┌────────────────────────── Supabase/Postgres ──────────────────────────────┐
│ workspaces + members       content_items + versions                      │
│ brand_profiles             comments + approval_events                    │
│ scheduled_posts            existing connections and analytics data       │
└──────────────────────────────────────────────────────────────────────────┘
```

## Domain model

### Existing tables to extend

#### `workspace_members`

Extend the role constraint from `owner | admin | member` to:

```text
owner | admin | member | client
```

Role meanings:

| Role | Purpose |
| --- | --- |
| `owner` | Workspace ownership, billing, members, connections, and all content operations |
| `admin` | Agency manager with all operational controls except ownership-only actions |
| `member` | Agency contributor who creates and edits content |
| `client` | Read, comment, request changes, approve, and view reports only |

The invitation role constraint and workspace controller validation must be updated in the same release.

#### `scheduled_posts`

Add nullable traceability columns:

```sql
content_item_id UUID REFERENCES content_items(id) ON DELETE SET NULL
content_version_id UUID REFERENCES content_versions(id) ON DELETE SET NULL
```

Do not add draft states to `scheduled_posts.status`. The scheduler should continue to process only its existing delivery states.

### New tables

#### `content_items`

The stable identity of a planned post.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `workspace_id` | UUID | Required tenant key |
| `created_by` | UUID | Original author |
| `assigned_to` | UUID nullable | Agency owner of the task |
| `campaign_name` | TEXT nullable | Lightweight MVP grouping |
| `provider` | TEXT | `meta` or `linkedin` |
| `destination` | JSONB | Page/actor and platform identifiers |
| `planned_for` | TIMESTAMPTZ nullable | Calendar position; not yet a publish commitment |
| `timezone` | TEXT | Display and scheduling timezone |
| `review_status` | TEXT | Editorial state below |
| `current_version_id` | UUID nullable | Latest editable version |
| `approved_version_id` | UUID nullable | Exact approved version |
| `scheduled_post_id` | UUID nullable | Result of publishing handoff |
| timestamps | TIMESTAMPTZ | Created and updated times |

Editorial states:

```text
draft
internal_review
client_review
changes_requested
approved
scheduled
published
failed
cancelled
```

`scheduled`, `published`, and `failed` are synchronized from the linked delivery record. They are display states, not a second scheduler.

#### `content_versions`

An immutable snapshot of content under review.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `content_item_id` | UUID | Parent item |
| `version_number` | INTEGER | Unique per item |
| `caption` | TEXT | Versioned copy |
| `media_urls` | JSONB | Versioned asset list |
| `link_url` | TEXT nullable | Versioned link |
| `created_by` | UUID | Author |
| `created_at` | TIMESTAMPTZ | Creation time |

Editing creates a new version instead of overwriting the reviewed version.

#### `content_comments`

Threaded discussion attached to an item and, optionally, a particular version.

Fields: `id`, `workspace_id`, `content_item_id`, `content_version_id`, `author_id`, `parent_id`, `body`, `visibility`, `created_at`, `edited_at`, and `deleted_at`.

`visibility` is `shared` or `internal`. Client users must never receive internal comments from the API.

#### `content_approval_events`

Append-only audit history.

Fields: `id`, `workspace_id`, `content_item_id`, `content_version_id`, `actor_id`, `action`, `reason`, `metadata`, and `created_at`.

Actions include `submitted_internal`, `submitted_client`, `changes_requested`, `approved`, `approval_invalidated`, `scheduled`, and `cancelled`.

#### `workspace_brand_profiles`

One record per workspace containing `client_name`, `logo_url`, `primary_color`, `secondary_color`, `timezone`, `tone_of_voice`, `content_pillars`, `approved_hashtags`, `prohibited_terms`, `competitors`, `report_footer`, and timestamps.

Keep image files in the existing storage abstraction and store only their URLs here.

#### `report_exports`

Tracks asynchronous or cached exports: `id`, `workspace_id`, `requested_by`, date range, selected metrics, status, `file_url`, `error_message`, and timestamps. The first release may generate small reports synchronously while retaining this table for audit and later background processing.

## State transitions

```text
draft ──submit──> internal_review ──submit──> client_review
  ▲                    │                          │
  │              request changes           request changes
  │                    ▼                          ▼
  └──────────── changes_requested <───────────────┘
                            │
                          revise
                            │
                            └──────────────> client_review

client_review ──approve exact version──> approved
approved ──schedule handoff──> scheduled_posts + scheduled
scheduled_posts ──scheduler──> published | failed | cancelled
```

Rules:

- `member`, `admin`, and `owner` can draft and revise.
- `member` can submit for review but cannot impersonate a client decision.
- `client`, `admin`, and `owner` can make a final decision in the MVP.
- Approval sets `approved_version_id` using a compare-and-swap transaction.
- Any new version clears `approved_version_id`, records `approval_invalidated`, and returns the item to review.
- Scheduling must fail with `409 Conflict` if the current version differs from the approved version.

## Authorization architecture

### Capability matrix

| Capability | Owner | Admin | Member | Client |
| --- | :---: | :---: | :---: | :---: |
| View shared calendar | Yes | Yes | Yes | Yes |
| View internal comments | Yes | Yes | Yes | No |
| Create/edit drafts | Yes | Yes | Yes | No |
| Submit for client review | Yes | Yes | Yes | No |
| Comment on shared thread | Yes | Yes | Yes | Yes |
| Request changes | Yes | Yes | No | Yes |
| Final approval | Yes | Yes | No | Yes |
| Schedule/publish | Yes | Yes | Configurable | No |
| Manage connections | Yes | Yes | No | No |
| Manage members/brand | Yes | Yes | No | No |
| View reports | Yes | Yes | Yes | Yes |
| Billing/storage purchase | Yes | No | No | No |

### Server enforcement

Add a capability guard rather than scattering role comparisons:

```js
requireWorkspaceCapability('content.approve')
requireWorkspaceCapability('content.publish')
requireWorkspaceCapability('reports.view')
```

For the MVP, capabilities map statically to roles. This leaves room for custom roles without changing every route.

Before inviting clients, audit existing workspace-scoped routes. Many currently accept any valid workspace member. Add guards to all mutations involving connections, publishing, pipelines, storage, billing, templates, and settings so the new `client` role cannot call them directly.

RLS remains defense in depth. Add workspace-member read policies to new tables, but restrict mutations to the server/service role. API queries must always filter by the resolved `req.workspaceId`.

## Server architecture

### New modules

```text
server/src/modules/
  content/
    content.routes.js
    content.controller.js
    content.service.js
    content.store.js
    content.policy.js
  brand/
    brand.routes.js
    brand.controller.js
  reports/
    reports.routes.js
    reports.controller.js
    reports.service.js
    report-renderer.js
```

Extend `approvals` only where existing WhatsApp behavior can be reused. Portal approval of `content_items` should live in the content domain; the old provider-neutral scheduled-post approval endpoints remain compatible during migration.

### API surface

#### Content calendar

```text
GET    /api/content?from=&to=&status=&assignee=
POST   /api/content
GET    /api/content/:id
PATCH  /api/content/:id
DELETE /api/content/:id
POST   /api/content/:id/versions
POST   /api/content/:id/submit-internal
POST   /api/content/:id/submit-client
POST   /api/content/:id/request-changes
POST   /api/content/:id/approve
POST   /api/content/:id/schedule
```

#### Comments and audit

```text
GET    /api/content/:id/comments
POST   /api/content/:id/comments
PATCH  /api/content/:id/comments/:commentId
DELETE /api/content/:id/comments/:commentId
GET    /api/content/:id/activity
```

#### Brand profile

```text
GET /api/brand
PUT /api/brand
```

#### Reports

```text
GET  /api/reports/summary?from=&to=
POST /api/reports/exports
GET  /api/reports/exports/:id
```

All list endpoints must use bounded date ranges, cursor pagination, stable ordering, and explicit response DTOs. Never return database rows containing internal fields directly to client-role users.

### Publishing handoff

`POST /api/content/:id/schedule` performs one transaction or security-definer RPC:

1. Lock the content item.
2. Confirm `review_status = approved`.
3. Confirm `current_version_id = approved_version_id`.
4. Confirm the destination still belongs to the workspace connection.
5. Validate the schedule against provider rules.
6. Insert one `scheduled_posts` row from the approved version snapshot.
7. Store both cross-reference IDs.
8. Append a `scheduled` approval event.
9. Return the content item and delivery record.

Use an idempotency constraint on `scheduled_posts(content_item_id, content_version_id)` to prevent double scheduling after retries.

## Client architecture

### Route and shell

Add one guarded route:

```text
/portal
```

After authentication, route a client-role user to the portal by default. Agency roles may open the same portal in preview mode.

```text
client/src/features/client-portal/
  pages/
    ClientPortalPage.jsx
  components/
    PortalShell.jsx
    ContentCalendar.jsx
    CalendarFilters.jsx
    ContentPreviewDrawer.jsx
    ApprovalActions.jsx
    CommentThread.jsx
    ClientReports.jsx
    BrandHeader.jsx
  hooks/
    useContentCalendar.js
    useContentItem.js
    useClientReports.js
  lib/
    clientPortalApi.js
    calendarDates.js
  index.js
```

Create a separate agency-facing `features/content-calendar/` package for draft editing and workflow management. Shared preview primitives can live in `shared/components/social-preview/` because both agency and client surfaces consume them.

### UI states

- Loading skeleton, empty month, filtered-empty result, and API error.
- Clear badges for every editorial and delivery state.
- Unsaved-comment and concurrent-version conflict handling.
- Accessible keyboard navigation in calendar and list views.
- Mobile list view as the default; month grid becomes optional on narrow screens.
- Client pages must not render the normal dashboard sidebar or links to restricted routes.

## Reporting architecture

The report service reads existing `scheduled_posts.publish_results`, Meta metrics, and LinkedIn metrics for the selected range. Normalize provider-specific values into a stable report DTO:

```text
summary: published, failed, engagement, engagementRate
platforms[]: platform, published, likes, comments, shares, views
topPosts[]: preview, publishedAt, metrics
delivery[]: date, scheduled, published, failed
insights[]: agency-authored narrative blocks
```

For the MVP, fetch live metrics on report generation and cache the normalized snapshot in `report_exports.metadata`. PDF rendering should run server-side from a controlled template; do not accept arbitrary client HTML. Store generated PDFs through the existing storage abstraction with short-lived or authenticated URLs.

## Notifications

Add these event types to the existing notification system:

- Content submitted for client review.
- Comment added or replied to.
- Changes requested.
- Revised version submitted.
- Content approved.
- Approved content scheduled.
- Publishing failed.

Start with in-app and FCM push. Email can be added later. Each event must include `workspace_id`, `content_item_id`, and a safe deep link.

## Migration and compatibility strategy

1. Add the new role, tables, indexes, RLS policies, and nullable cross-reference columns.
2. Deploy capability guards before inviting any `client` users.
3. Deploy content APIs and agency calendar behind `CLIENT_PORTAL_ENABLED`.
4. Deploy the client portal and invite flow.
5. Optionally backfill recent `scheduled_posts` into read-only `content_items` for calendar continuity.
6. Keep existing WhatsApp approval operational. New content items can use portal approval, WhatsApp approval, or a later adapter that mirrors WhatsApp decisions into approval events.

No destructive migration of existing posts is required.

## Delivery phases

### Phase 0: authorization hardening

- Add the `client` role and capability policy.
- Guard every workspace-scoped mutation.
- Add authorization tests for every role.
- Do not expose client invitations until this phase passes.

### Phase 1: editorial core

- Create content, version, comment, and approval-event tables.
- Implement state-transition service and transactional RPCs.
- Build agency calendar and post preview.
- Add conflict and idempotency tests.

### Phase 2: client portal

- Update invitations to support `client`.
- Build the isolated portal shell, calendar, comments, and decisions.
- Add notification events and deep links.
- Run tenant-isolation and accessibility tests.

### Phase 3: publishing integration

- Implement approved-version scheduling handoff.
- Synchronize delivery results back to content items.
- Integrate pipeline-created content with the editorial workflow.
- Verify Meta native scheduling and application scheduling remain mutually exclusive.

### Phase 4: brand and reporting

- Add brand profile and branded portal header.
- Add normalized report queries and top-post views.
- Add PDF generation and secure download.
- Add report generation performance tests.

## Testing strategy

### Unit tests

- Role-to-capability mapping.
- Allowed and rejected state transitions.
- Approval invalidation after a new version.
- Provider metric normalization.
- Report date and timezone calculations.

### Integration tests

- Client cannot create, edit, schedule, publish, connect accounts, or access billing.
- Client cannot read another workspace by changing `x-workspace-id` or path IDs.
- Client cannot receive internal comments in any response.
- Concurrent approvals and revisions resolve atomically.
- Retried scheduling creates one delivery record.
- A newly edited approved item cannot be scheduled.
- Scheduler state correctly updates the related content item.

### End-to-end tests

1. Agency creates a client workspace and invites a client.
2. Agency creates a draft, adds media, and submits it.
3. Client requests changes and leaves feedback.
4. Agency creates a new version and resubmits it.
5. Client approves the new version.
6. Agency schedules it and the post reaches the existing delivery queue.
7. Client sees the published result and report entry.

Test desktop and mobile portal layouts, keyboard operation, expired invitations, removed memberships, and stale browser sessions.

## Observability

Log structured events for content transitions, decisions, handoffs, report generation, and permission denials. Include `request_id`, `workspace_id`, `content_item_id`, actor ID, old state, and new state, but never captions, access tokens, or private comment bodies.

Track:

- Median time from submission to client decision.
- Change-request rate.
- Approval-to-publish success rate.
- Failed publish rate by provider.
- Active client workspaces.
- Report views and exports.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Client gains access through existing member-only checks | Complete Phase 0 before enabling the role |
| Approved copy changes before publishing | Immutable versions and approved-version comparison |
| Duplicate posts after request retries | Transactional handoff and unique idempotency constraint |
| Internal notes leak to clients | Separate visibility field plus role-filtered DTOs and tests |
| Calendar becomes slow | Bounded date windows, indexes, pagination, and summary payloads |
| Provider metrics are inconsistent | Normalize into a report DTO and label unavailable metrics |
| Existing WhatsApp approval diverges | Keep it unchanged initially; add an event adapter after portal MVP |

## Definition of done

- Capability enforcement is covered by server integration tests.
- A client can complete the full review loop without using the agency dashboard.
- Only an approved, unchanged version can be scheduled.
- Every decision and revision appears in the activity history.
- Existing Meta, LinkedIn, pipeline, WhatsApp, storage, billing, and admin tests pass.
- Cross-workspace access attempts return `403` or `404` without leaking record existence.
- Reports match provider data for a fixed test fixture and render successfully as PDF.
- Product, support, and deployment documentation describe the new role and feature flag.
