import { MessagingProvider, IncomingMessage, OutgoingMessage } from "../Provider";

export class LinqProvider implements MessagingProvider {
  private apiKey: string;
  private endpoint: string;

  constructor() {
    this.apiKey = process.env.LINQ_API_KEY || "";
    this.endpoint = process.env.LINQ_API_URL || "https://api.linq.app/v1/messages";
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
        console.error("LinqProvider failed to send message:", await response.text());
        return false;
      }
      return true;
    } catch (error) {
      console.error("LinqProvider error sending message:", error);
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
