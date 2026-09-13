import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy-key-for-build" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

export class GmailRepository {
  async getIntegration(integrationId: string) {
    const { data, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", integrationId)
      .single();

    if (error || !data) {
      throw new Error(`Integration not found: ${integrationId}`);
    }

    return data;
  }

  async updateIntegrationSyncState(integrationId: string, historyId: string | null) {
    const { error } = await supabase
      .from("integrations")
      .update({
        last_sync_at: new Date().toISOString(),
        last_history_id: historyId,
      })
      .eq("id", integrationId);

    if (error) {
      console.error(`[GmailRepository] Failed to update sync state:`, error);
    }
  }

  async insertEvent(integrationId: string, userId: string, externalId: string, payload: any) {
    const { data, error } = await supabase
      .from("events")
      .insert({
        integration_id: integrationId,
        user_id: userId,
        external_id: externalId,
        source: "gmail",
        event_type: "thread",
        payload, // Normalized event payload, maintaining exact raw messages array within it
        status: "pending", // as per requirements
      })
      .select()
      .single();

    if (error) {
      // Ignore unique constraint violations (duplicate events)
      if (error.code === '23505') {
        return { data: null, error: { code: '23505' } };
      }
      throw new Error(`Failed to insert event: ${error.message}`);
    }

    return { data, error: null };
  }

  async saveMemories(userId: string, sourceRef: string, facts: any[], openLoops: any[]) {
    const memoryInserts: any[] = [];

    // Helper to generate embedding and push to array
    const addMemoryWithEmbedding = async (type: string, title: string, content: any, confidence: number) => {
      try {
        const textToEmbed = JSON.stringify(content);
        const embeddingResponse = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: textToEmbed,
        });
        
        memoryInserts.push({
          user_id: userId,
          type,
          title,
          content,
          source: sourceRef,
          confidence,
          embedding: embeddingResponse.data[0].embedding,
        });
      } catch (err: any) {
        console.error(`[GmailRepository] Failed to generate embedding:`, err);
        // Fallback to null embedding if API fails, though semantic search won't find it
        memoryInserts.push({
          user_id: userId,
          type,
          title,
          content,
          source: sourceRef,
          confidence,
        });
      }
    };

    // Process all facts and loops concurrently to save time
    const promises = [];

    for (const factObj of facts) {
      promises.push(
        addMemoryWithEmbedding("relationship", "Extracted Fact", { fact: factObj.fact }, factObj.confidence || 1.0)
      );
    }

    for (const loop of openLoops) {
      promises.push(
        addMemoryWithEmbedding("open_loop", "Extracted Open Loop", { description: loop.description, owner: loop.owner }, 1.0)
      );
    }

    await Promise.all(promises);

    if (memoryInserts.length > 0) {
      const { error } = await supabase.from("memory_objects").insert(memoryInserts);
      if (error) {
        throw new Error(`Failed to insert memories: ${error.message}`);
      }
    }
  }

  async logAgentRun(userId: string, eventId: string | null, agentName: string, status: string, input: any, output: any, err: any = null) {
    const { error } = await supabase.from("agent_runs").insert({
      event_id: eventId,
      user_id: userId,
      agent_name: agentName,
      status,
      input,
      output,
      error: err ? (err.message || JSON.stringify(err)) : null
    });

    if (error) {
      console.error(`[GmailRepository] Failed to log agent run:`, error);
    }
  }
}
