import { NextResponse } from "next/server";
import { OAuthManager } from "../../../../integrations/OAuthManager";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // Expected format: "provider|workspaceId"

  if (!code || !state) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
  }

  const [provider, workspaceId] = state.split("|");
  const oauthManager = new OAuthManager();

  try {
    const success = await oauthManager.handleCallback(provider, code, workspaceId);
    if (success) {
      return NextResponse.redirect("/settings/integrations?success=true");
    } else {
      return NextResponse.redirect("/settings/integrations?error=failed");
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
