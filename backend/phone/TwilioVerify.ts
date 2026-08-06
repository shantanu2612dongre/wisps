import { Twilio } from "twilio";

export class TwilioVerify {
  private client: Twilio;
  private serviceSid: string;

  constructor() {
    this.client = new Twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );
    this.serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID!;
  }

  async sendOtp(phoneNumber: string): Promise<boolean> {
    try {
      const verification = await this.client.verify.v2
        .services(this.serviceSid)
        .verifications.create({ to: phoneNumber, channel: "sms" });
      
      return verification.status === "pending";
    } catch (error) {
      console.error("Error sending OTP:", error);
      return false;
    }
  }

  async verifyOtp(phoneNumber: string, code: string): Promise<boolean> {
    try {
      const verificationCheck = await this.client.verify.v2
        .services(this.serviceSid)
        .verificationChecks.create({ to: phoneNumber, code });
      
      return verificationCheck.status === "approved";
    } catch (error) {
      console.error("Error verifying OTP:", error);
      return false;
    }
  }
}
