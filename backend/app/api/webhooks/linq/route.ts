import { NextResponse } from "next/server";
import { Orchestrator } from "../../../../agents/Orchestrator";
import { LinqProvider } from "../../../../messaging/linq/LinqProvider";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-key"
);

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-linq-signature");
    const linq = new LinqProvider();

    // 1. Validate Signature
    if (!linq.verifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    console.log("[Linq Webhook] Raw payload received:", JSON.stringify(payload, null, 2));
    
    // 2. Parse payload
    const incomingMessage = linq.parseIncomingPayload(payload);
    
    // 3. User Identification
    const { data: userResult, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("phone", incomingMessage.senderId)
      .single();

    let user = userResult;

    if (userError || !user) {
      console.log(`[Linq Webhook] Unknown sender phone: ${incomingMessage.senderId}. Creating new user.`);
      
      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert({ 
          phone: incomingMessage.senderId,
          email: `${incomingMessage.senderId.replace('+', '')}@wisps.temp` // Temporary email to satisfy NOT NULL constraint
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("[Linq Webhook] Failed to create user:", insertError);
        return NextResponse.json({ error: "Failed to register new user" }, { status: 500 });
      }
      
      user = newUser;
    }

    // 4. Idempotency Check (Check agent_runs for existing run for this message ID)
    const { data: existingRun } = await supabase
      .from("agent_runs")
      .select("id")
      .eq("user_id", user.id)
      .contains("input", { messageId: incomingMessage.id })
      .maybeSingle();

    if (existingRun) {
      console.log(`[Linq Webhook] Duplicate message ${incomingMessage.id} detected. Skipping.`);
      return NextResponse.json({ success: true, duplicate: true });
    }

    // Insert an initial agent_run record to lock this message ID
    const { data: newRun, error: runError } = await supabase
      .from("agent_runs")
      .insert({
        user_id: user.id,
        agent_name: "Orchestrator",
        status: "processing",
        input: { messageId: incomingMessage.id, text: incomingMessage.text }
      })
      .select()
      .single();

    if (runError) {
      console.error("[Linq Webhook] Failed to lock agent run for idempotency:", runError);
      // We can choose to proceed or fail. Proceeding might risk duplicates if race condition.
    }
    
    const orchestrator = new Orchestrator();
    const mockWorkspaceId = ""; // No workspaces in current DB schema
    
    // 5. Dispatch
    await orchestrator.handleIncomingMessage({
      workspaceId: mockWorkspaceId,
      userId: user.id,
      input: incomingMessage.text,
      metadata: { messageId: incomingMessage.id, timestamp: incomingMessage.timestamp, runId: newRun?.id, senderId: incomingMessage.senderId }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Linq Webhook] Error processing request:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
