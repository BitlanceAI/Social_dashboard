# Templates and design

## Status

Implemented.

## What it provides

- Browse graphic templates and filter them by niche.
- Fill template-specific dynamic fields such as brand and message details.
- Save frequently reused composer details per workspace.
- Generate a design from a selected template.
- Track design-generation jobs and retain the generated asset for publishing.
- Allow administrators to create, edit, and delete the template catalog.

## Generation backends

Design generation can use an external renderer when configured, otherwise it uses the configured OpenAI image model. Generated files have a configurable retention period.

## Implementation

- Client template picker: `client/src/features/templates/`
- Template API: `server/src/modules/templates/`
- Design generation: `server/src/modules/design/`

