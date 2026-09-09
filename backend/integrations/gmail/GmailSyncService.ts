import { google, gmail_v1 } from "googleapis";
import { MemoryAgent } from "../../agents/MemoryAgent";
import { GmailRepository } from "./GmailRepository";
import { GmailNormalizer } from "./GmailNormalizer";

const memoryAgent = new MemoryAgent();
const repository = new GmailRepository();
const normalizer = new GmailNormalizer();

export class GmailSyncService {
  /**
   * Main entry point for syncing a specific Gmail integration
   */
  async sync(integrationId: string): Promise<void> {
    console.log(`[GmailSyncService] Starting sync for integration ${integrationId}`);

    let integration;
    try {
      // 1. Fetch integration details
      integration = await repository.getIntegration(integrationId);
    } catch (err: any) {
      console.error(`[GmailSyncService]`, err.message);
      return;
    }

    // 2. Initialize Gmail API client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      access_token: integration.access_token,
      refresh_token: integration.refresh_token,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    let newHistoryId: string | null = null;
    let threadsToProcess: Set<string> = new Set();

    try {
      // 3. Fetch threads (Incremental vs Full Sync)
      if (integration.last_history_id) {
        console.log(`[GmailSyncService] Performing incremental sync from historyId ${integration.last_history_id}`);
        try {
          const response = await gmail.users.history.list({
            userId: "me",
            startHistoryId: integration.last_history_id,
          });

          newHistoryId = response.data.historyId?.toString() || integration.last_history_id;
          const histories = response.data.history || [];
          for (const history of histories) {
            if (history.messages) {
              for (const msg of history.messages) {
                if (msg.threadId) threadsToProcess.add(msg.threadId);
              }
            }
          }
        } catch (historyErr: any) {
          // If historyId is too old (404), fallback to full sync behavior
          if (historyErr.code === 404) {
             console.log(`[GmailSyncService] HistoryId expired. Falling back to fetching recent threads.`);
             const response = await gmail.users.threads.list({ userId: "me", maxResults: 50 });
             const threads = response.data.threads || [];
             for (const t of threads) {
               if (t.id) threadsToProcess.add(t.id);
             }
             const profile = await gmail.users.getProfile({ userId: "me" });
             newHistoryId = profile.data.historyId?.toString() || null;
          } else {
             throw historyErr;
          }
        }
      } else {
        console.log(`[GmailSyncService] Performing initial sync (last 50 threads)`);
        const response = await gmail.users.threads.list({
          userId: "me",
          maxResults: 50,
        });

        const threads = response.data.threads || [];
        for (const t of threads) {
          if (t.id) threadsToProcess.add(t.id);
        }

        // Fetch current profile to get latest historyId
        const profile = await gmail.users.getProfile({ userId: "me" });
        newHistoryId = profile.data.historyId?.toString() || null;
      }

      console.log(`[GmailSyncService] Found ${threadsToProcess.size} threads to process`);

      // 4. Process each thread - continue on failure
      for (const threadId of threadsToProcess) {
        try {
          await this.processThread(gmail, integration, threadId);
        } catch (threadErr: any) {
          console.error(`[GmailSyncService] Error processing thread ${threadId}:`, threadErr);
          await repository.logAgentRun(
            integration.user_id,
            null,
            "GmailSyncService.processThread",
            "failed",
            { threadId },
            null,
            threadErr
          );
        }
      }

      // 5. Update integration with latest sync time and historyId
      await repository.updateIntegrationSyncState(integrationId, newHistoryId);

      console.log(`[GmailSyncService] Sync completed for integration ${integrationId}`);

    } catch (err: any) {
      console.error(`[GmailSyncService] Sync failed:`, err);
      // Log failure to agent_runs
      await repository.logAgentRun(
        integration.user_id,
        null,
        "GmailSyncService",
        "failed",
        { integrationId },
        null,
        err
      );
    }
  }

  /**
   * Fetches, normalizes, inserts, and processes a single thread
   */
  private async processThread(gmail: gmail_v1.Gmail, integration: any, threadId: string) {
    const threadRes = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full"
    });

    const thread = threadRes.data;
    if (!thread || !thread.messages || thread.messages.length === 0) return;

    // Normalize thread
    const normalizedEvent = normalizer.normalizeThread(thread);

    // Insert into `events` table (status=pending)
    const { data: event, error: eventError } = await repository.insertEvent(
      integration.id,
      integration.user_id,
      threadId,
      normalizedEvent
    );

    // If duplicate event, just return
    if (eventError && eventError.code === '23505') {
       console.log(`[GmailSyncService] Thread ${threadId} already processed (duplicate).`);
       return;
    }
    if (!event) throw new Error("Failed to insert event for unknown reasons.");

    // Invoke MemoryAgent
    // Note: processEvent expects a string representation.
    const textRepresentation = `Subject: ${normalizedEvent.subject}\nParticipants: ${normalizedEvent.participants.join(", ")}\nMessages: ${normalizedEvent.messages.length}\nSnippet: ${thread.snippet || ""}`;
    const agentResult = await memoryAgent.processEvent(textRepresentation, "gmail");

    // Log MemoryAgent run
    await repository.logAgentRun(
      integration.user_id,
      event.id,
      "MemoryAgent",
      agentResult.success ? "completed" : "failed",
      { payload: textRepresentation },
      agentResult.success ? agentResult.data : null,
      agentResult.error ? new Error(agentResult.error) : null
    );

    if (agentResult.success && !agentResult.data?.ignored) {
      // Store extracted memories
      const facts = agentResult.data.facts || [];
      const openLoops = agentResult.data.openLoops || [];
      
      await repository.saveMemories(
        integration.user_id,
        `gmail_thread_${threadId}`,
        facts,
        openLoops
      );
    }
  }
}
