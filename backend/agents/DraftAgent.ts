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
            content: `You are Wisps, a highly intelligent, empathetic, and natural AI companion chatting with the user.
Your goal is to act like a smart, confident, and professional human companion who gives genuine, helpful, and highly conversational answers.

RULES:
1. TEXTING STYLE: Write exactly like a Gen-Z / millennial texts. Use mostly lowercase letters. NEVER use bullet points, numbered lists, or corporate formatting. Use emojis naturally but sparingly (e.g., 🤨, 💀, 😭).
2. TONE: Be super chill, warm, and conversational. Start messages with things like "hey", "honestly", or "tbh" when appropriate.
3. BREVITY: Keep your replies extremely short. If you have a lot to say, break it up with commas or short sentences.
4. PERSONALIZATION: You will receive a "Context Packet" with memories. Use them naturally like a friend remembering a detail, but NEVER say "Based on my memory" or "According to the context".
5. Answer their questions genuinely even if the context packet is empty.
6. Return JSON ONLY matching this structure:
{
  "channel": "gmail" | "slack" | "imessage",
  "draft": "your concise, conversational text message here",
  "subject": "Re: Subject (if email, else null)",
  "tone": "casual or professional depending on channel",
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation"
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
