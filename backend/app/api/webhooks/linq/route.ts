import { NextResponse } from "next/server";
import { Orchestrator } from "../../../../agents/Orchestrator";
import { LinqProvider } from "../../../../messaging/linq/LinqProvider";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const linq = new LinqProvider();
    
    // Parse the payload into standard format
    const incomingMessage = linq.parseIncomingPayload(payload);
    
    // In a real application, you would map `incomingMessage.senderId` (e.g., a phone number)
    // to a `userId` and `workspaceId` in your `users` and `workspace_users` tables.
    const mockWorkspaceId = "ws_123"; 
    const mockUserId = incomingMessage.senderId;
    
    const orchestrator = new Orchestrator();
    
    // Process the message asynchronously to not block the webhook response
    // (In production this might be pushed to a queue or Trigger.dev job)
    orchestrator.handleIncomingMessage({
      workspaceId: mockWorkspaceId,
      userId: mockUserId,
      input: incomingMessage.text,
      metadata: { messageId: incomingMessage.id, timestamp: incomingMessage.timestamp }
    }).catch(console.error);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Linq webhook error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
