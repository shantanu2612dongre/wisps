import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

export async function POST(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { phoneNumber, code } = await request.json();

    if (!phoneNumber || !code) {
      return NextResponse.json({ error: "Phone number and code are required" }, { status: 400 });
    }

    // 1. Look up row in otp_codes matching phone = phoneNumber AND code = code AND expires_at > now()
    const now = new Date().toISOString();
    
    const { data: otpRecords, error: otpError } = await supabase
      .from("otp_codes")
      .select("id")
      .eq("phone", phoneNumber)
      .eq("code", code)
      .gt("expires_at", now);

    if (otpError) {
      console.error("Error querying OTP codes:", otpError);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    if (!otpRecords || otpRecords.length === 0) {
      // 2. If no match, return 401
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }

    // 3. Fetch corresponding user
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, phone")
      .eq("phone", phoneNumber)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 4. Generate signed JWT
    const token = jwt.sign(
      { userId: user.id, phone: user.phone },
      process.env.JWT_SECRET!,
      { expiresIn: "30d" }
    );

    // 5. Delete the used otp_codes row (and optionally other expired ones)
    await supabase
      .from("otp_codes")
      .delete()
      .eq("phone", phoneNumber); // Deletes all codes for this phone since they logged in successfully

    // 6. Return success
    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        phone: user.phone
      }
    });
  } catch (error: any) {
    console.error("OTP Verify Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
