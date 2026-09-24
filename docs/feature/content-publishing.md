# Content publishing

## Status

Implemented.

## What it provides

- A guided composer for account, content, schedule, and review steps.
- Immediate publishing or future scheduling.
- Facebook, Instagram, and LinkedIn destinations.
- Text, image, video, Reel, and carousel-capable Meta posts where the provider supports them.
- Media upload and selection from the media library.
- CSV bulk upload for scheduling multiple posts.
- Post history, status tracking, cancellation, and supported deletion.

## Scheduling behavior

Facebook-only posts scheduled 10 minutes to 75 days ahead are handed to Meta's native scheduler. Instagram, mixed Facebook/Instagram, LinkedIn, and near-term posts remain pending for the application scheduler to publish. This separation prevents a natively scheduled post from being published twice.

## Provider limitations

- Instagram media cannot be deleted through the Graph API; users must delete it in Instagram.
- LinkedIn history contains app-tracked posts because reading a member's complete native history needs a restricted scope.
- Advertising campaigns and ad insights are outside the product scope.

## Implementation

- Client composer: `client/src/features/meta/components/SchedulePostModal.jsx`
- Bulk import: `client/src/features/meta/components/BulkUploadModal.jsx`
- Meta publishing: `server/src/modules/meta/`
- LinkedIn publishing: `server/src/modules/linkedin/`
- Scheduler: `server/src/modules/scheduler/scheduler.service.js`

