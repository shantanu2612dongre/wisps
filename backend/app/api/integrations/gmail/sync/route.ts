import { NextResponse } from "next/server";
import { GmailSyncService } from "../../../../../integrations/gmail/GmailSyncService";

const gmailSyncService = new GmailSyncService();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { integrationId } = body;

    if (!integrationId) {
      return NextResponse.json(
        { success: false, error: "integrationId is required" },
        { status: 400 }
      );
    }

    // Fire and forget the sync to return a quick 200 to the caller
    // Ideally this would kick off a Trigger.dev event instead
    gmailSyncService.sync(integrationId).catch((err: any) => {
      console.error(`[API] Gmail sync failed for ${integrationId}:`, err);
    });

    return NextResponse.json({ success: true, message: "Sync started in background" });
  } catch (error: any) {
    console.error(`[API] Error triggering sync:`, error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
