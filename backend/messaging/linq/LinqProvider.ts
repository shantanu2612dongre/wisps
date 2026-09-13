import { MessagingProvider, IncomingMessage, OutgoingMessage } from "../Provider";
import crypto from "crypto";

export class LinqProvider implements MessagingProvider {
  private apiKey: string;
  private endpoint: string;
  private webhookSecret: string;

  constructor() {
    this.apiKey = process.env.LINQ_API_KEY || "";
    this.endpoint = process.env.LINQ_API_URL || "https://api.linq.app/v1/messages";
    this.webhookSecret = process.env.LINQ_WEBHOOK_SECRET || "";
  }

  /**
   * Verify the webhook signature against the payload
   * Defaulting to checking x-linq-signature header with HMAC SHA256
   */
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
    if (!this.webhookSecret) {
      console.warn("[LinqProvider] Webhook secret not configured. Bypassing signature verification.");
      return true; // Or false if strictly required, but for MVP local testing might not have it.
    }
    
    if (!signature) return false;

    try {
      const hmac = crypto.createHmac("sha256", this.webhookSecret);
      const calculatedSignature = hmac.update(rawBody).digest("hex");
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(calculatedSignature));
    } catch (e) {
      console.error("[LinqProvider] Signature verification failed:", e);
      return false;
    }
  }

  async sendMessage(message: OutgoingMessage): Promise<boolean> {
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          to: message.recipientId,
          text: message.text,
        }),
      });

      if (!response.ok) {
        console.error("[LinqProvider] failed to send message. Status:", response.status);
        return false;
      }
      return true;
    } catch (error) {
      console.error("[LinqProvider] error sending message:", error);
      return false;
    }
  }

  parseIncomingPayload(payload: any): IncomingMessage {
    // Assuming a standard webhook payload from Linq
    if (!payload || !payload.id || !payload.senderId || !payload.text) {
      throw new Error("Invalid Linq payload format");
    }

    return {
      id: payload.id,
      senderId: payload.senderId,
      text: payload.text,
      timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
    };
  }
}
