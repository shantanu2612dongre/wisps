# Wisps Backend MVP

Welcome to the Wisps backend repository. This modular monolith is built using Next.js, Supabase, and a Multi-Agent AI architecture.

## Tech Stack
- Next.js (App Router API routes)
- TypeScript
- Supabase (PostgreSQL with pgvector)
- OpenAI (GPT-4)
- Twilio Verify
- Trigger.dev
- Googleapis & Slack Web API

## Quick Start
1. Clone the repo and install dependencies:
   ```bash
   cd backend
   npm install
   ```

2. Setup environment variables:
   Copy `.env.example` to `.env.local` and fill in the required keys.

3. Run migrations on your Supabase instance:
   Execute `db/migrations/00001_initial_schema.sql` in your Supabase SQL Editor.

4. Start the development server:
   ```bash
   npm run dev
   ```

## Architecture
This backend employs a multi-agent orchestration system:
- **Orchestrator**: Manages the flow of agents for incoming user messages (from Linq).
- **MemoryAgent**: Extracts structured facts and open loops from synced events.
- **ContextAgent**: Queries the `memories` table to build relationship context.
- **DraftAgent**: Generates draft responses.
- **ActionAgent**: Executes approved actions through integrations.

## Integrations
- Gmail and Slack sync logic are scheduled via Trigger.dev jobs (`trigger/syncJobs.ts`).
- OAuth flows are handled in `integrations/OAuthManager.ts`.
