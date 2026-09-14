import OpenAI from "openai";

const openai = new OpenAI({ 
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "dummy-key-for-build" 
});

export interface DraftAgentInput {
  intent: string;
  userQuery: string;
  context: any;
}

export interface DraftAgentOutput {
  channel: string;
  draft: string;
  subject?: string;
  tone: string;
  confidence: number;
  reasoning?: string;
}

export class DraftAgent {
  /**
   * Generates a draft response strictly based on provided context.
   */
  async generateDraft(input: DraftAgentInput): Promise<{ success: boolean; data?: DraftAgentOutput; error?: string }> {
    try {
      const completion = await openai.chat.completions.create({
        model: "openai/gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are the Draft Agent for Wisps. Your ONLY job is to write a draft message.

RULES:
1. NEVER hallucinate or invent facts.
2. Use ONLY the supplied context.
3. If the context is completely insufficient to fulfill the user's intent, state what is missing in the "draft" field and set a low confidence.
4. Keep replies concise.
5. Match the user's implied writing style if available from context.
6. Return JSON ONLY matching this structure:
{
  "channel": "gmail" | "slack" | "imessage",
  "draft": "The actual message text",
  "subject": "Re: Subject (if email, else null)",
  "tone": "professional, casual, etc",
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation of why this draft was generated this way"
}`
          },
          { 
            role: "user", 
            content: `Intent: ${input.intent}\nUser Query: ${input.userQuery}\nContext Packet: ${JSON.stringify(input.context, null, 2)}` 
          }
        ],
        response_format: { type: "json_object" }
      });

      const responseContent = completion.choices[0].message.content || "{}";
      const result: DraftAgentOutput = JSON.parse(responseContent);

      return { success: true, data: result };
    } catch (error: any) {
      console.error("DraftAgent error:", error);
      return { success: false, error: error.message };
    }
  }
}
