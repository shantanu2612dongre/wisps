import { AgentContext } from "./types";
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
    console.log(
      `[Orchestrator] Processing message for user ${context.userId}`
    );

    // 1. Build Context
    const contextResult = await this.contextAgent.buildContext(context);

    if (!contextResult.success || !contextResult.data) {
      await this.messagingProvider.sendMessage({
        recipientId: context.userId,
        text: "I'm having trouble accessing my memory right now.",
      });

      return;
    }

    // 2. Generate Response
    // DraftAgent receives the context + retrieved memory summary.
    const draftResult = await this.draftAgent.generateDraft({
      intent: "reply",
      userQuery: context.input,
      context: contextResult.data
    });

    if (!draftResult.success || !draftResult.data) {
      await this.messagingProvider.sendMessage({
        recipientId: context.userId,
        text: "I couldn't generate a response right now.",
      });

      return;
    }

    // 3. Send response through Linq
    await this.messagingProvider.sendMessage({
      recipientId: context.userId,
      text: draftResult.data.draft,
    });

    console.log(
      `[Orchestrator] Finished processing message for user ${context.userId}`
    );
  }
}