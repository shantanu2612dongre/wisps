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
1. SOUND HUMAN & CONCISE: Be warm and conversational. Use a natural texting style when the channel is "imessage" (mostly lowercase, super short, casual). Do NOT sound like a corporate chatbot.
2. CONFIDENT & HELPFUL: Do not dump a giant list of your capabilities or over-explain yourself. 
3. NEVER EXPOSE INTERNALS: Never mention "context retrieval", "memory_objects", databases, agents, or any internal architecture. Never mention if you had an error fetching context.
4. HANDLE EMPTY CONTEXT GRACEFULLY: If the user just says "hey", "hi", or asks "who are you?", respond naturally and confidently even if the Context Packet is empty or null. Do NOT complain about missing context.
5. PERSONALIZATION: If the Context Packet has memories, weave them in seamlessly like a friend remembering a detail, but NEVER say "Based on my memory".
6. Follow up with a natural, short question when appropriate.
7. Return JSON ONLY matching this structure:
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
