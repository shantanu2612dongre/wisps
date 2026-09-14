import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Orchestrator } from '../../agents/Orchestrator';
import { ContextAgent } from '../../agents/ContextAgent';
import { DraftAgent } from '../../agents/DraftAgent';
import { ConversationalAgent } from '../../agents/ConversationalAgent';
import { LinqProvider } from '../../messaging/linq/LinqProvider';

// Mock dependencies
vi.mock('../../agents/ContextAgent');
vi.mock('../../agents/DraftAgent');
vi.mock('../../agents/ConversationalAgent');
vi.mock('../../messaging/linq/LinqProvider');
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      update: () => ({ eq: vi.fn().mockResolvedValue({}) })
    })
  })
}));

// We must also mock OpenAI inside Orchestrator
vi.mock('openai', () => {
  return {
    default: class OpenAI {
      chat = {
        completions: {
          create: vi.fn().mockImplementation(async (opts) => {
            const input = opts.messages[1].content.toLowerCase();
            let intent = "context";
            if (input === "hey" || input === "who are you?") intent = "casual";
            if (input === "do this action") intent = "action";
            return { choices: [{ message: { content: intent } }] };
          })
        }
      }
    }
  };
});


describe('Orchestrator Intent Routing', () => {
  let orchestrator: Orchestrator;
  
  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = new Orchestrator();
    
    // Setup mocks
    (DraftAgent.prototype.generateDraft as any).mockResolvedValue({
      success: true,
      data: { draft: "test reply" }
    });
    
    (ConversationalAgent.prototype.chat as any).mockResolvedValue({
      success: true,
      data: { reply: "casual test reply" }
    });
    
    (ContextAgent.prototype.buildContext as any).mockResolvedValue({
      success: true,
      data: { memory: "test memory" }
    });

    (LinqProvider.prototype.sendMessage as any).mockResolvedValue(true);
  });

  it('routes "hey" to ConversationalAgent without fetching context', async () => {
    await orchestrator.handleIncomingMessage({
      userId: 'test-user',
      workspaceId: 'test-workspace',
      input: 'hey',
      metadata: { runId: 'run-1' }
    });

    expect(ContextAgent.prototype.buildContext).not.toHaveBeenCalled();
    expect(DraftAgent.prototype.generateDraft).not.toHaveBeenCalled();
    expect(ConversationalAgent.prototype.chat).toHaveBeenCalledWith({
      userQuery: 'hey'
    });
    expect(LinqProvider.prototype.sendMessage).toHaveBeenCalledWith({
      recipientId: 'test-user',
      text: 'casual test reply'
    });
  });

  it('gracefully falls back if ContextAgent fails on context-required query', async () => {
    (ContextAgent.prototype.buildContext as any).mockResolvedValue({
      success: false,
      error: "DB Error"
    });

    await orchestrator.handleIncomingMessage({
      userId: 'test-user',
      workspaceId: 'test-workspace',
      input: 'what do i need to know', // routes to context
      metadata: { runId: 'run-1' }
    });

    expect(ContextAgent.prototype.buildContext).toHaveBeenCalled();
    // It should STILL call DraftAgent with null context
    expect(DraftAgent.prototype.generateDraft).toHaveBeenCalledWith({
      intent: 'context',
      userQuery: 'what do i need to know',
      context: null
    });
    // It should NOT hardcode the "trouble accessing memory" response
    expect(LinqProvider.prototype.sendMessage).toHaveBeenCalledWith({
      recipientId: 'test-user',
      text: 'test reply' // from the DraftAgent mock
    });
  });
});
