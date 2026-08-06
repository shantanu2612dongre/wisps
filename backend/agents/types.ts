export interface AgentContext {
  workspaceId: string;
  userId: string;
  input: string;
  // Any extra metadata like conversation history, current open loops, etc.
  metadata?: Record<string, any>;
}

export interface MemoryFact {
  fact: string;
  source: string;
  confidence: number;
  timestamp: Date;
}

export interface AgentResult {
  success: boolean;
  data?: any;
  error?: string;
  nextStep?: "draft" | "action" | "done" | "clarify";
}
