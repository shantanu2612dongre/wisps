import { AgentContext, AgentResult } from "./types";
import { ContextAgent } from "./ContextAgent";
import { DraftAgent } from "./DraftAgent";
import { ActionAgent } from "./ActionAgent";
import { LinqProvider } from "../messaging/linq/LinqProvider";

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
    console.log(`[Orchestrator] Processing message for user ${context.userId}`);

    // 1. Build Context
    const contextResult = await this.contextAgent.buildContext(context);
    if (!contextResult.success) {
      await this.messagingProvider.sendMessage({
        recipientId: context.userId,
        text: "I'm having trouble accessing my memory right now."
      });
      return;
    }

    // 2. Draft Response or Recommendation
    const draftResult = await this.draftAgent.generateDraft(context, contextResult.data.summary);
    if (!draftResult.success) {
      await this.messagingProvider.sendMessage({
        recipientId: context.userId,
        text: "I encountered an error while formulating a response."
      });
      return;
    }

    // 3. Send the drafted response back to the user via Linq
    await this.messagingProvider.sendMessage({
      recipientId: context.userId,
      text: draftResult.data.draft
    });

    console.log(`[Orchestrator] Finished processing message for user ${context.userId}`);
  }
}
