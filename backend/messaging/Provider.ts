export interface IncomingMessage {
  id: string;
  senderId: string; // E.g., user's phone number or Linq user ID
  text: string;
  timestamp: Date;
}

export interface OutgoingMessage {
  recipientId: string;
  text: string;
}

/**
 * MessagingProvider abstraction.
 * Ensures the backend core logic is decoupled from the actual messaging platform (Linq, Twilio, etc.)
 */
export interface MessagingProvider {
  /**
   * Send a message to a user.
   */
  sendMessage(message: OutgoingMessage): Promise<boolean>;

  /**
   * Parse an incoming webhook payload into a standard format.
   * If the payload is invalid, this should throw an error.
   */
  parseIncomingPayload(payload: any): IncomingMessage;
}
