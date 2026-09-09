import { createClient } from "@supabase/supabase-js";

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
    const memoryInserts = [];

    for (const factObj of facts) {
      memoryInserts.push({
        user_id: userId,
        type: "relationship",
        title: "Extracted Fact",
        content: { fact: factObj.fact },
        source: sourceRef,
        confidence: factObj.confidence || 1.0,
      });
    }

    for (const loop of openLoops) {
      memoryInserts.push({
        user_id: userId,
        type: "open_loop",
        title: "Extracted Open Loop",
        content: { description: loop.description, owner: loop.owner },
        source: sourceRef,
        confidence: 1.0,
      });
    }

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
