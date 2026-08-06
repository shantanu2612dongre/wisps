import { describe, it, expect, vi } from 'vitest';
import { DraftAgent } from '../../agents/DraftAgent';

// Mock the OpenAI module
vi.mock('openai', () => {
  const mockCreate = vi.fn().mockImplementation((args: any) => {
    // Check if the prompt implies insufficient context
    const userMessage = args.messages.find((m: any) => m.role === 'user').content;
    
    if (userMessage.includes('insufficient_context')) {
      return Promise.resolve({
        choices: [
          {
            message: {
              content: JSON.stringify({
                channel: 'gmail',
                draft: 'I need more information about the Q4 docs before I can reply.',
                tone: 'professional',
                confidence: 0.2,
                reasoning: 'The context provided no details about the Q4 docs.'
              })
            }
          }
        ]
      });
    }

    // Default successful response
    return Promise.resolve({
      choices: [
        {
          message: {
            content: JSON.stringify({
              channel: 'gmail',
              draft: 'Hi Ken, I will send the Q4 docs tomorrow. Best, Max',
              subject: 'Re: Q4 Docs',
              tone: 'professional',
              confidence: 0.95,
              reasoning: 'Context indicated the docs will be ready tomorrow.'
            })
          }
        }
      ]
    });
  });

  return {
    default: class {
      chat = {
        completions: {
          create: mockCreate
        }
      }
    }
  };
});

describe('DraftAgent', () => {
  const draftAgent = new DraftAgent();

  it('should generate a structured draft when sufficient context is provided', async () => {
    const input = {
      intent: 'reply',
      userQuery: 'Reply to Ken that I will send docs tomorrow',
      context: {
        commitments: ['Send Q4 docs tomorrow']
      }
    };

    const result = await draftAgent.generateDraft(input);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.draft).toContain('Ken');
    expect(result.data?.confidence).toBeGreaterThan(0.9);
    expect(result.data?.subject).toBe('Re: Q4 Docs');
  });

  it('should return low confidence when context is completely insufficient', async () => {
    const input = {
      intent: 'reply',
      userQuery: 'insufficient_context_test',
      context: {}
    };

    const result = await draftAgent.generateDraft(input);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.confidence).toBeLessThan(0.5);
    expect(result.data?.draft).toContain('I need more information');
  });
});
