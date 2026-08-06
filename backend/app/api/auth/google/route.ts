import { NextResponse } from "next/server";
import { GoogleAuth } from "../../../../auth/GoogleAuth";

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
    
    // In a real app:
    // 1. Look up user by email in the `users` table
    // 2. If not found, create new user and workspace
    // 3. Create a JWT session token
    
    return NextResponse.json({ success: true, user });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
