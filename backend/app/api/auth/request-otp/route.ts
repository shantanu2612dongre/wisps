import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { LinqProvider } from "../../../../messaging/linq/LinqProvider";

export async function POST(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { phoneNumber } = await request.json();

    if (!phoneNumber) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    // 1. Look up phoneNumber in the users table
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("phone", phoneNumber)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: "This number isn't registered yet. Text Wisps on iMessage first to get started." },
        { status: 404 }
      );
    }

    // Rate Limiting Check
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: recentCodes, error: recentError } = await supabase
      .from("otp_codes")
      .select("created_at")
      .eq("phone", phoneNumber)
      .gte("created_at", oneHourAgo);

    if (recentError) {
       console.error("Error fetching recent OTP codes:", recentError);
       return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    const requestsInLast30s = recentCodes.filter(c => new Date(c.created_at) >= new Date(thirtySecondsAgo)).length;
    
    if (requestsInLast30s >= 1) {
       return NextResponse.json({ error: "Please wait 30 seconds before requesting another code." }, { status: 429 });
    }

    if (recentCodes.length >= 5) {
       return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    // 3. Generate a random 6-digit numeric code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 4. Insert row into otp_codes
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes from now
    
    const { error: insertError } = await supabase
      .from("otp_codes")
      .insert({
        phone: phoneNumber,
        code,
        expires_at: expiresAt
      });

    if (insertError) {
      console.error("Error inserting OTP code:", insertError);
      return NextResponse.json({ error: "Failed to generate OTP" }, { status: 500 });
    }

    // 5. Send the code via Linq
    const linq = new LinqProvider();
    const sent = await linq.sendMessage({
      recipientId: phoneNumber,
      text: `Your Wisps login code: ${code}`
    });

    if (!sent) {
      console.error("Failed to send Linq message");
      return NextResponse.json({ error: "Failed to send code" }, { status: 500 });
    }

    // 6. Return success (never return code)
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("OTP Request Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
