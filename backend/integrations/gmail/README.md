# Gmail Sync Integration

This package contains the Gmail Sync Service, responsible for synchronizing user's Gmail threads and converting them into memory events in Wisps.

## Architecture

1. **GmailSyncService**: Core logic that fetches from the Google APIs. Handles both initial sync (last 50 threads) and incremental sync (via History API).
2. **GmailRepository**: Abstract wrapper over Supabase for reading integrations, creating events, logging runs, and saving facts/loops.
3. **GmailNormalizer**: Cleans raw Google API payload into a common `NormalizedEvent` shape.

## Usage

### Webhooks or UI Actions
```ts
// Hit the REST API
POST /api/integrations/gmail/sync
{
  "integrationId": "123-abc"
}
```

### Trigger.dev Background Jobs
Events to emit to Trigger.dev:
- `gmail.initial_sync`
- `gmail.incremental_sync`

## Incremental Sync Note

We utilize the `historyId` returned from Gmail to strictly fetch threads that have mutated since the last sync. If a `historyId` expires (returns 404 from Gmail), the service falls back to a 50-thread recent sync to heal state.
