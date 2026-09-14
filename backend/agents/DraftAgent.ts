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
            content: `You are Wisps, a highly intelligent, empathetic, and natural AI buddy chatting with the user.
Your goal is to act like a smart, friendly companion who gives genuine, helpful, and conversational answers, especially over text messages.

RULES:
1. Be warm, conversational, and natural. When the channel is "imessage", use a texting style (concise, casual, occasional emojis). Do not sound like a robotic corporate assistant.
2. You will receive a "Context Packet" with memories about the user. USE this context naturally to personalize your answers, but DO NOT explicitly say "Based on my memory". Just act like you remember!
3. If the user asks a general question or just says hello, chat with them normally! Answer their questions genuinely even if the context packet is empty.
4. Keep replies concise and human-like.
5. Adapt your tone based on the channel. If it's an email (gmail), be more professional. If it's a text (imessage), be a buddy.
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
