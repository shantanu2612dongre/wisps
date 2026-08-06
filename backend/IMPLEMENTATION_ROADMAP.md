# Wisps MVP Implementation Roadmap

## Week 1 Priority: Core Backend Architecture & "Happy Path"

### Day 1: Scaffolding and Infrastructure
- Initialize Next.js monolithic backend repository (DONE)
- Set up Supabase with PostgreSQL and `pgvector` extension (DONE)
- Write initial DB schema migrations for core tables, relationship graph, and memory (DONE)

### Day 2: Authentication and Core APIs
- Implement Google OAuth callback for user creation and session generation
- Implement Twilio Verify for phone number OTP login
- Secure API endpoints using JWT middleware

### Day 3: Multi-Agent Architecture Basics
- Finalize `MemoryAgent` extraction logic with GPT-4 (structured facts)
- Finalize `ContextAgent` semantic search (using `pgvector` inside Supabase)
- Finalize `DraftAgent` response generation

### Day 4: Integrations and Background Sync
- Setup Trigger.dev jobs for async processing
- Implement Slack API integration and event parsing
- Implement Gmail API integration and event parsing
- Build the data normalization pipeline to feed the `MemoryAgent`

### Day 5: Linq Messaging E2E
- Implement `LinqProvider` fully
- Setup incoming webhook endpoint for Linq payloads
- Wire the webhook directly to the `Orchestrator`
- Run end-to-end tests: Inbound iMessage -> Context Building -> Draft -> Outbound iMessage

### Day 6: Action Execution and Safety
- Build the `ActionAgent` logic to enforce explicit user approvals before communicating on their behalf via Slack or Gmail.
- Review error handling paths (e.g., API limits, missing context).

### Day 7: Polish & Deploy
- Deploy Next.js to Vercel
- Link Supabase production DB
- Run end-to-end beta tests with early users via iMessage
