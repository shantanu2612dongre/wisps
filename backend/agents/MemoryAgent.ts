import { AgentContext, AgentResult, MemoryFact } from "./types";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy-key-for-build" });

export class MemoryAgent {
  /**
   * Processes a raw synced event (from Gmail, Slack, etc.) and extracts facts and open loops.
   */
  async processEvent(eventPayload: string, source: string): Promise<AgentResult> {
    try {
      // Step 1: Is this meaningful?
      const checkCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Use faster/cheaper model for binary classification
        messages: [
          {
            role: "system",
            content: `You are a filter for a professional Memory Agent. Determine if the following communication event contains any meaningful professional context, facts, relationships, or commitments. Return JSON: { "isMeaningful": boolean }`
          },
          { role: "user", content: `Source: ${source}\nEvent Data: ${eventPayload}` }
        ],
        response_format: { type: "json_object" }
      });

      const checkResult = JSON.parse(checkCompletion.choices[0].message.content || "{}");
      
      // If not meaningful, ignore and return early
      if (checkResult.isMeaningful === false) {
        console.log(`[MemoryAgent] Event from ${source} deemed not meaningful. Ignoring.`);
        return { success: true, data: { ignored: true } };
      }

      // Step 2: Extract Memory
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a Memory Agent for Wisps. Extract structured facts, relationships, commitments, and open loops from the raw event data provided. Return JSON in the format: { "facts": [{ "fact": "...", "confidence": 0.9 }], "openLoops": [{ "description": "...", "owner": "..." }] }`
          },
          { role: "user", content: `Source: ${source}\nEvent Data: ${eventPayload}` }
        ],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(completion.choices[0].message.content || "{}");
      
      // In a real implementation, we would insert these into the 'memories' and 'open_loops' tables here using Supabase.
      
      return { success: true, data: { ignored: false, ...result } };
    } catch (error: any) {
      console.error("MemoryAgent error:", error);
      return { success: false, error: error.message };
    }
  }
}
