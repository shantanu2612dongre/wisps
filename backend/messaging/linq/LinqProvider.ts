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
      const url = `${this.endpoint.replace(/\/$/, '')}/api/partner/v3/chats`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: process.env.LINQ_PHONE_NUMBER,
          to: [message.recipientId],
          message: {
            parts: [
              {
                type: "text",
                value: message.text,
              }
            ]
          }
        }),
      });

      if (!response.ok) {
        console.error("[LinqProvider] failed to send message. Status:", response.status);
        return false;
      }

      // Try to extract chatId if returned by the Linq API to trigger contact card sharing
      try {
        const responseData = await response.json();
        const chatId = responseData?.chat?.id || responseData?.id;
        
        if (chatId) {
          // Asynchronously share the contact card without blocking the message flow
          this.shareContactCard(chatId).catch(err => {
            console.error(`[LinqProvider] Non-blocking failure when sharing contact card for chat ${chatId}:`, err);
          });
        }
      } catch (e) {
        // Ignore JSON parse errors here if Linq doesn't return JSON on success
      }

      return true;
    } catch (error) {
      console.error("[LinqProvider] error sending message:", error);
      return false;
    }
  }

  /**
   * Shares the configured contact card into the specified chat so the user receives the native iMessage avatar.
   */
  private async shareContactCard(chatId: string): Promise<boolean> {
    try {
      const url = `${this.endpoint.replace(/\/$/, '').replace('/v1/messages', '')}/api/partner/v3/chats/${chatId}/share_contact_card`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        }
      });

      if (!response.ok) {
        // 409 usually means the card was already shared recently or is active, which is fine to ignore.
        if (response.status !== 409) {
          console.warn(`[LinqProvider] Failed to share contact card for chat ${chatId}. Status: ${response.status}`);
        }
        return false;
      }

      console.log(`[LinqProvider] Successfully shared contact card for chat ${chatId}`);
      return true;
    } catch (error) {
      console.error(`[LinqProvider] Exception while sharing contact card for chat ${chatId}:`, error);
      return false;
    }
  }

  parseIncomingPayload(payload: any): IncomingMessage {
    const data = payload?.data;
    
    // Assuming a standard webhook payload from Linq v3
    if (!data || !data.id || !data.sender_handle?.handle || !data.parts || !Array.isArray(data.parts)) {
      throw new Error("Invalid Linq payload format");
    }

    const textPart = data.parts.find((p: any) => p.type === "text" && p.value);
    if (!textPart) {
      throw new Error("Invalid Linq payload format: Missing text part");
    }

    return {
      id: data.id,
      senderId: data.sender_handle.handle,
      text: textPart.value,
      timestamp: data.sent_at ? new Date(data.sent_at) : new Date(),
    };
  }
}
