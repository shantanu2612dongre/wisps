import { describe, it, expect, vi } from 'vitest';
import { ConversationalAgent } from '../../agents/ConversationalAgent';
import OpenAI from 'openai';

// Mock the OpenAI module
vi.mock('openai', () => {
  const mockCreate = vi.fn().mockImplementation((args: any) => {
    const userMessage = args.messages.find((m: any) => m.role === 'user').content;
    
    if (userMessage.includes('hey')) {
      return Promise.resolve({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: 'hey! what\'s up?'
              })
            }
          }
        ]
      });
    }

    if (userMessage.includes('who are you')) {
      return Promise.resolve({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: 'i\'m Wisps. think of me as the friend who remembers the stuff you don\'t want to.'
              })
            }
          }
        ]
      });
    }

    if (userMessage.includes('what can you do')) {
      return Promise.resolve({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: 'mostly the remembering and follow-through stuff. you talk to me when you need context, and i\'ll figure out what matters.'
              })
            }
          }
        ]
      });
    }

    // Default catch-all
    return Promise.resolve({
      choices: [
        {
          message: {
            content: JSON.stringify({
              reply: 'i am just chatting.'
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

describe('ConversationalAgent', () => {
  const agent = new ConversationalAgent();

  it('should generate a friendly reply for "hey"', async () => {
    const input = { userQuery: 'hey' };
    const result = await agent.chat(input);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.reply).toContain("hey! what's up?");

    const openai = new OpenAI();
    expect(openai.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 300
      })
    );
  });

  it('should generate an identity reply for "who are you"', async () => {
    const input = { userQuery: 'who are you?' };
    const result = await agent.chat(input);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.reply).toContain("i'm Wisps");
  });

  it('should generate a capabilities reply for "what can you do"', async () => {
    const input = { userQuery: 'what can you do?' };
    const result = await agent.chat(input);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.reply).toContain("remembering and follow-through");
  });
});
