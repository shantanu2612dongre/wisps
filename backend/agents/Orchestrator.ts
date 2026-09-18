import { AgentContext } from "./types";
import { ContextAgent } from "./ContextAgent";
import { DraftAgent } from "./DraftAgent";
import { ActionAgent } from "./ActionAgent";
import { ConversationalAgent } from "./ConversationalAgent";
import { LinqProvider } from "../messaging/linq/LinqProvider";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const openai = new OpenAI({ 
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "dummy-key-for-build" 
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-key"
);

export class Orchestrator {
  private contextAgent = new ContextAgent();
  private draftAgent = new DraftAgent();
  private actionAgent = new ActionAgent();
  private conversationalAgent = new ConversationalAgent();
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
      const intent = await this.analyzeIntent(context.input);
      console.log(`[Orchestrator] Classified intent: ${intent}`);

      if (intent === "casual") {
        const chatResult = await this.conversationalAgent.chat({ userQuery: context.input });
        if (!chatResult.success || !chatResult.data) {
          console.error("[Orchestrator] ConversationalAgent failed", chatResult.error);
          await this.completeRun(runId, "failed", null, "ConversationalAgent failed");
          return;
        }
        const success = await this.messagingProvider.sendMessage({
          recipientId,
          text: chatResult.data.reply,
        });
        if (!success) {
          await this.completeRun(runId, "failed", null, "LinqProvider failed to send message");
          return;
        }
        await this.completeRun(runId, "completed", chatResult.data, null);
        return;
      }

      let contextData = null;

      // 1. Build Context if needed
      if (intent === "context" || intent === "action") {
        const contextResult = await this.contextAgent.buildContext(context);
        if (!contextResult.success || !contextResult.data) {
          console.error("[Orchestrator] ContextAgent failed, proceeding to DraftAgent without memory.", contextResult.error);
          // We DO NOT hard-fail here. We proceed so DraftAgent can reply gracefully.
        } else {
          contextData = contextResult.data;
        }
      }

      if (intent === "action") {
         // Placeholder for future action routing.
         // Action requests still route to DraftAgent to generate a conversational response right now.
      }

      // 2. Generate Response
      const draftResult = await this.draftAgent.generateDraft({
        intent: intent,
        userQuery: context.input,
        context: contextData
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

  private async analyzeIntent(text: string): Promise<"casual" | "context" | "action"> {
    try {
      const completion = await openai.chat.completions.create({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Classify the user's message intent into exactly one of three categories:
1. "casual": Simple greetings (hey, hi, what's up), identity questions (who are you, what can you do), or very generic short chatter that does not require retrieving the user's specific tasks, memories, or relationships.
2. "context": Questions or statements that require looking up past information, tasks, people, or context (e.g. "what do I need to know about Ken", "what did we talk about last week", "what's on my plate").
3. "action": Explicit requests to DO something (e.g. "tell Ken I'll send it tomorrow", "draft an email", "create a task").

Return ONLY the single word: casual, context, or action.`
          },
          { role: "user", content: text }
        ],
        temperature: 0.0,
        max_tokens: 50
      });
      const intentStr = completion.choices[0].message.content?.trim().toLowerCase() || "context";
      if (intentStr.includes("casual")) return "casual";
      if (intentStr.includes("action")) return "action";
      return "context";
    } catch (e) {
      console.error("[Orchestrator] Intent analysis failed, defaulting to context", e);
      return "context";
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