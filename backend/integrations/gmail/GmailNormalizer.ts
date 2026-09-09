import { gmail_v1 } from "googleapis";

export interface NormalizedEvent {
  source: "gmail";
  threadId: string;
  subject: string;
  participants: string[];
  messages: any[];
  historyId: string;
  timestamp: string;
}

export class GmailNormalizer {
  /**
   * Normalizes a raw Gmail thread into a common event format.
   * Extracts participants from From, To, Cc headers.
   * Preserves raw messages but also structures basic thread data.
   */
  normalizeThread(thread: gmail_v1.Schema$Thread): NormalizedEvent {
    if (!thread.id) {
      throw new Error("Thread missing ID");
    }

    const messages = thread.messages || [];
    let subject = "No Subject";
    const participantsSet = new Set<string>();
    let timestamp = new Date().toISOString();

    if (messages.length > 0) {
      const firstMessage = messages[0];
      const headers = firstMessage.payload?.headers || [];
      
      const subjectHeader = headers.find(h => h.name?.toLowerCase() === 'subject');
      if (subjectHeader?.value) {
        subject = subjectHeader.value;
      }

      // We use the first message's internalDate as the thread timestamp, or fallback
      if (firstMessage.internalDate) {
        timestamp = new Date(parseInt(firstMessage.internalDate)).toISOString();
      }

      // Extract participants from all messages
      for (const msg of messages) {
        const msgHeaders = msg.payload?.headers || [];
        for (const h of msgHeaders) {
          const name = h.name?.toLowerCase();
          if (name === 'from' || name === 'to' || name === 'cc' || name === 'bcc') {
            if (h.value) {
              // Basic extraction, split by comma, and remove names if formatted like "Name <email@example.com>"
              const parts = h.value.split(',').map(p => p.trim());
              for (const part of parts) {
                participantsSet.add(part);
              }
            }
          }
        }
      }
    }

    return {
      source: "gmail",
      threadId: thread.id,
      subject,
      participants: Array.from(participantsSet),
      messages, // Keeping original messages exactly as received in the array
      historyId: thread.historyId || "",
      timestamp,
    };
  }
}
