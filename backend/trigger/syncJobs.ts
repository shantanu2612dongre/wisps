import { task } from "@trigger.dev/sdk/v3";
import { MemoryAgent } from "../agents/MemoryAgent";

import { GmailSyncService } from "../integrations/gmail/GmailSyncService";

const memoryAgent = new MemoryAgent();
const gmailSyncService = new GmailSyncService();

export const gmailSyncJob = task({
  id: "gmail-sync",
  run: async (payload: { workspaceId: string; integrationId: string }) => {
    console.log(`Starting Gmail sync for integration ${payload.integrationId}`);
    
    // Call the new service which handles incremental logic, insertion, and memory agent
    await gmailSyncService.sync(payload.integrationId);

    return { status: "completed" };
  },
});

export const slackSyncJob = task({
  id: "slack-sync",
  run: async (payload: { workspaceId: string; accountId: string }) => {
    console.log(`Starting Slack sync for workspace ${payload.workspaceId}`);
    
    // In a real implementation:
    // 1. Fetch OAuth token
    // 2. Query Slack API for recent messages/threads
    // 3. Normalize into events
    
    const mockSlackEvent = "Message from Ken: Is the Q4 doc ready?";
    
    // 4. Pass through Memory Agent
    await memoryAgent.processEvent(mockSlackEvent, "slack");

    return { status: "completed", processedEvents: 1 };
  },
});

export const dailyMemoryRefreshJob = task({
  id: "daily-memory-refresh",
  run: async (payload: { workspaceId: string }) => {
    console.log(`Refreshing daily memory for workspace ${payload.workspaceId}`);
    
    // 1. Reconcile older open loops
    // 2. Condense repeated facts
    // 3. Prune outdated memory

    return { status: "completed" };
  },
});
