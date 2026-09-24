# AI content pipelines

## Status

Implemented.

## What it provides

- Create, edit, pause, and delete reusable content pipelines.
- Choose a Facebook Page, Facebook/Instagram cross-post destination, or LinkedIn actor.
- Configure a recurring execution schedule.
- Maintain a content queue for each pipeline.
- Import queue items and synchronize a queue from a sheet source.
- Run a pipeline immediately and clear its queue.
- Generate individual caption suggestions through the AI caption assistant.

## Availability

AI caption generation depends on the server's Perplexity configuration. When no API key is configured, the caption feature reports itself as unavailable.

## Implementation

- Client: `client/src/features/pipelines/`
- Caption assistant: `client/src/features/meta/components/CaptionAssistant.jsx`
- Pipelines API: `server/src/modules/pipelines/`
- Caption API: `server/src/modules/ai/`

