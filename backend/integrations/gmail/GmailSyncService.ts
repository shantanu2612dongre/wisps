import { google, gmail_v1 } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import { MemoryAgent } from "../../agents/MemoryAgent";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const memoryAgent = new MemoryAgent();

export class GmailSyncService {
  /**
   * Main entry point for syncing a specific Gmail integration
   */
  async sync(integrationId: string): Promise<void> {
    console.log(`[GmailSyncService] Starting sync for integration ${integrationId}`);

    // 1. Fetch integration details
    const { data: integration, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", integrationId)
      .single();

    if (error || !integration) {
      console.error(`[GmailSyncService] Integration not found: ${integrationId}`);
      return;
    }

    // 2. Initialize Gmail API client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
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

      // 4. Process each thread
      for (const threadId of threadsToProcess) {
        await this.processThread(gmail, integration, threadId);
      }

      // 5. Update integration with latest sync time and historyId
      await supabase
        .from("integrations")
        .update({
          last_sync_at: new Date().toISOString(),
          last_history_id: newHistoryId,
        })
        .eq("id", integrationId);

      console.log(`[GmailSyncService] Sync completed for integration ${integrationId}`);

    } catch (err: any) {
      console.error(`[GmailSyncService] Sync failed:`, err);
      // Log failure to agent_runs
      await supabase.from("agent_runs").insert({
        user_id: integration.user_id,
        agent_name: "GmailSyncService",
        status: "failed",
        error: err.message || JSON.stringify(err),
      });
    }
  }

  /**
   * Fetches, normalizes, inserts, and processes a single thread
   */
  private async processThread(gmail: gmail_v1.Gmail, integration: any, threadId: string) {
    try {
      const threadRes = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full"
      });

      const thread = threadRes.data;
      if (!thread || !thread.messages || thread.messages.length === 0) return;

      // Basic normalization
      const subjectHeader = thread.messages[0].payload?.headers?.find(h => h.name === 'Subject');
      const subject = subjectHeader ? subjectHeader.value : "No Subject";
      
      const eventPayload = {
        threadId: thread.id,
        snippet: thread.snippet,
        subject: subject,
        messageCount: thread.messages.length
      };

      // 6. Insert into `events` table (status=pending via default 'processed=false')
      const { data: event, error: eventError } = await supabase
        .from("events")
        .insert({
          integration_id: integration.id,
          user_id: integration.user_id,
          external_id: thread.id,
          source: "gmail",
          event_type: "thread",
          payload: eventPayload,
        })
        .select()
        .single();

      if (eventError) {
        // Ignore unique constraint violations (duplicate events)
        if (eventError.code === '23505') {
          console.log(`[GmailSyncService] Thread ${threadId} already processed (duplicate).`);
          return;
        }
        throw new Error(`Failed to insert event: ${eventError.message}`);
      }

      // 7. Invoke MemoryAgent immediately
      const textRepresentation = `Subject: ${subject}\nSnippet: ${thread.snippet}\nMessages: ${thread.messages.length}`;
      const agentResult = await memoryAgent.processEvent(textRepresentation, "gmail");

      // 8. Log run to agent_runs
      await supabase.from("agent_runs").insert({
        event_id: event.id,
        user_id: integration.user_id,
        agent_name: "MemoryAgent",
        status: agentResult.success ? "completed" : "failed",
        input: { payload: textRepresentation },
        output: agentResult.success ? agentResult.data : null,
        error: agentResult.error || null
      });

      if (!agentResult.success || agentResult.data?.ignored) {
        // Mark event as processed and move on
        await supabase.from("events").update({ processed: true }).eq("id", event.id);
        return;
      }

      // 9. Store extracted memories in `memory_objects`
      const facts = agentResult.data.facts || [];
      const openLoops = agentResult.data.openLoops || [];

      const memoryInserts = [];

      for (const factObj of facts) {
        memoryInserts.push({
          user_id: integration.user_id,
          type: "relationship", // Map dynamically or use default
          title: "Extracted Fact",
          content: { fact: factObj.fact },
          source: `gmail_thread_${threadId}`,
          confidence: factObj.confidence || 1.0,
        });
      }

      for (const loop of openLoops) {
        memoryInserts.push({
          user_id: integration.user_id,
          type: "open_loop",
          title: "Extracted Open Loop",
          content: { description: loop.description, owner: loop.owner },
          source: `gmail_thread_${threadId}`,
          confidence: 1.0,
        });
      }

      if (memoryInserts.length > 0) {
        const { error: memError } = await supabase.from("memory_objects").insert(memoryInserts);
        if (memError) {
          console.error(`[GmailSyncService] Failed to insert memories:`, memError);
        }
      }

      // 10. Mark event as processed
      await supabase.from("events").update({ processed: true }).eq("id", event.id);

    } catch (err: any) {
      console.error(`[GmailSyncService] Error processing thread ${threadId}:`, err);
    }
  }
}
