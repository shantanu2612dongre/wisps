import { AgentContext } from "./types";
import { ContextAgent } from "./ContextAgent";
import { DraftAgent } from "./DraftAgent";
import { ActionAgent } from "./ActionAgent";
import { LinqProvider } from "../messaging/linq/LinqProvider";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-key"
);

export class Orchestrator {
  private contextAgent = new ContextAgent();
  private draftAgent = new DraftAgent();
  private actionAgent = new ActionAgent();
  private messagingProvider = new LinqProvider();

  /**
   * Main entry point for a user's incoming message from Linq.
   * Coordinates Context retrieval and Draft generation.
   */
  async handleIncomingMessage(context: AgentContext): Promise<void> {
    console.log(
      `[Orchestrator] Processing message for user ${context.userId}`
    );

    // If senderId is in metadata, use it. Otherwise fallback to userId (might not work for Linq if it expects phone)
    const recipientId = context.metadata?.senderId || context.userId;
    const runId = context.metadata?.runId;

    try {
      // 1. Build Context
      const contextResult = await this.contextAgent.buildContext(context);

      if (!contextResult.success || !contextResult.data) {
        await this.messagingProvider.sendMessage({
          recipientId,
          text: "I'm having trouble accessing my memory right now.",
        });
        await this.completeRun(runId, "failed", null, "ContextAgent failed");
        return;
      }

      // 2. Generate Response
      const draftResult = await this.draftAgent.generateDraft({
        intent: "reply",
        userQuery: context.input,
        context: contextResult.data
      });

      if (!draftResult.success || !draftResult.data) {
        await this.messagingProvider.sendMessage({
          recipientId,
          text: "I couldn't generate a response right now.",
        });
        await this.completeRun(runId, "failed", null, "DraftAgent failed");
        return;
      }

      // 3. Send response through Linq
      const success = await this.messagingProvider.sendMessage({
        recipientId,
        text: draftResult.data.draft,
      });

      if (!success) {
        await this.completeRun(runId, "failed", null, "LinqProvider failed to send message");
        return;
      }

      console.log(
        `[Orchestrator] Finished processing message for user ${context.userId}`
      );
      
      await this.completeRun(runId, "completed", draftResult.data, null);
    } catch (error: any) {
      console.error("[Orchestrator] Unexpected error:", error);
      await this.messagingProvider.sendMessage({
        recipientId,
        text: "An unexpected error occurred while processing your message.",
      });
      await this.completeRun(runId, "failed", null, error.message);
    }
  }
  
  private async completeRun(runId: string | undefined, status: string, output: any, errorStr: string | null) {
    if (!runId) return;
    await supabase.from("agent_runs").update({
      status,
      output,
      error: errorStr,
      finished_at: new Date().toISOString()
    }).eq("id", runId);
  }
}