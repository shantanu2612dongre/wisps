import { NextResponse } from "next/server";
import { GoogleAuth } from "../../../../auth/GoogleAuth";
import { createClient } from "@supabase/supabase-js";
import { GmailSyncService } from "../../../../integrations/gmail/GmailSyncService";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-key"
);
const gmailSyncService = new GmailSyncService();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  const googleAuth = new GoogleAuth();

  if (!code) {
    // Redirect to consent screen
    return NextResponse.redirect(googleAuth.getAuthUrl());
  }

  try {
    const { user, tokens } = await googleAuth.verifyToken(code);
    
    // 1. Upsert User
    const { data: dbUser, error: userError } = await supabase
      .from("users")
      .upsert({
        email: user.email,
        name: user.name,
      }, { onConflict: "email" })
      .select()
      .single();

    if (userError || !dbUser) {
      throw new Error(`Failed to upsert user: ${userError?.message}`);
    }

    // 2. Upsert Integration
    // The exact row might need to be queried first to update properly if onConflict doesn't work well without a constraint
    // But integrations table doesn't have a unique constraint on (user_id, provider). 
    // We'll search for an existing one, if found update, else insert.
    let integrationId;
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", dbUser.id)
      .eq("provider", "gmail")
      .maybeSingle();

    if (existingIntegration) {
      const { data: updated, error: updateError } = await supabase
        .from("integrations")
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || undefined, // don't nullify if not provided in this auth flow
          expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        })
        .eq("id", existingIntegration.id)
        .select()
        .single();
        
      if (updateError) throw new Error(`Update integration failed: ${updateError.message}`);
      integrationId = updated.id;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("integrations")
        .insert({
          user_id: dbUser.id,
          provider: "gmail",
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        })
        .select()
        .single();
        
      if (insertError) throw new Error(`Insert integration failed: ${insertError.message}`);
      integrationId = inserted.id;
    }

    // 3. Trigger initial sync in the background
    gmailSyncService.sync(integrationId).catch((err: any) => {
      console.error(`[GoogleAuthRoute] Background sync failed for ${integrationId}:`, err);
    });
    
    return NextResponse.json({ success: true, message: "Successfully connected and sync started", user: dbUser });
  } catch (error: any) {
    console.error("[GoogleAuthRoute] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
