import { AgentContext, AgentResult } from "./types";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy-key-for-build" });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface RankedMemory {
  id: string;
  type: string;
  content: any;
  confidence: number;
  created_at: string;
  similarity: number;
  finalScore: number;
}

export class ContextAgent {
  /**
   * Searches memories to build a rich relationship context before a decision is made.
   */
  async buildContext(context: AgentContext): Promise<AgentResult> {
    try {
      console.log(`[ContextAgent] Building context for user ${context.userId}`);

      // 1. Generate embedding for the user's natural language query
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small", // or text-embedding-ada-002
        input: context.input,
      });
      const queryEmbedding = embeddingResponse.data[0].embedding;

      // 2. Hybrid search via match_memories RPC
      // Fetches semantic matches above a low threshold (0.5) to allow ranking to do the heavy lifting
      const { data: memories, error } = await supabase.rpc("match_memories", {
        query_embedding: queryEmbedding,
        match_threshold: 0.5,
        match_count: 50,
        p_user_id: context.userId
      });

      if (error) throw new Error(`Supabase RPC Error: ${error.message}`);

      const matchedMemories = memories || [];

      // 3. Rank memories locally
      // Combine relevance (similarity), confidence, importance, and recency
      const rankedMemories: RankedMemory[] = matchedMemories.map((m: any) => {
        // Importance heuristic based on type
        let importance = 1.0;
        if (m.type === "commitment" || m.type === "decision") importance = 1.5;
        if (m.type === "open_loop") importance = 1.3;
        
        // Recency heuristic (decay over time, simplistic version)
        const ageDays = (Date.now() - new Date(m.created_at).getTime()) / (1000 * 60 * 60 * 24);
        const recencyScore = Math.max(0.5, 1 - (ageDays / 365)); // 50% penalty if a year old

        // Final score calculation
        const finalScore = m.similarity * m.confidence * importance * recencyScore;
        
        return { ...m, finalScore };
      });

      // Sort descending by finalScore
      rankedMemories.sort((a, b) => b.finalScore - a.finalScore);

      // Take the top 15 most relevant memories to build the packet
      const topMemories = rankedMemories.slice(0, 15);

      // 4. Build Context Packet
      const contextPacket = {
        commitments: topMemories.filter(m => m.type === "commitment").map(m => m.content),
        decisions: topMemories.filter(m => m.type === "decision").map(m => m.content),
        openLoops: topMemories.filter(m => m.type === "open_loop").map(m => m.content),
        meetings: topMemories.filter(m => m.type === "meeting").map(m => m.content),
        relationships: topMemories.filter(m => m.type === "relationship").map(m => m.content),
        other: topMemories.filter(m => !["commitment", "decision", "open_loop", "meeting", "relationship"].includes(m.type)).map(m => m.content),
      };

      // 5. Generate concise natural language summary using ONLY the context packet
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are the Context Engine for Wisps. Using the strictly provided Context Packet JSON, generate a concise, analytical summary of the current situation and relationship state to help answer the user's query. DO NOT invent information.`
          },
          { 
            role: "user", 
            content: `User Query: ${context.input}\nContext Packet: ${JSON.stringify(contextPacket, null, 2)}` 
          }
        ]
      });

      const summary = completion.choices[0].message.content;

      // 6. Return structured JSON (Packet + Summary)
      return { 
        success: true, 
        data: { 
          summary, 
          contextPacket 
        } 
      };
    } catch (error: any) {
      console.error("ContextAgent error:", error);
      return { success: false, error: error.message };
    }
  }
}
