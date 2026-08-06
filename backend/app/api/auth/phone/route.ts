import { NextResponse } from "next/server";
import { TwilioVerify } from "../../../../phone/TwilioVerify";

export async function POST(request: Request) {
  try {
    const { action, phoneNumber, code } = await request.json();
    const twilio = new TwilioVerify();

    if (action === "send") {
      const success = await twilio.sendOtp(phoneNumber);
      return NextResponse.json({ success });
    } else if (action === "verify") {
      const success = await twilio.verifyOtp(phoneNumber, code);
      // In a real app, upon success, mark `phone_verifications` table as verified for the user.
      return NextResponse.json({ success });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
