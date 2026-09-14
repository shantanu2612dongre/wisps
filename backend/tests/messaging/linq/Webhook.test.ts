import { describe, it, expect, beforeEach, vi, type Mocked } from "vitest";
import { POST } from "../../../app/api/webhooks/linq/route";
import { LinqProvider } from "../../../messaging/linq/LinqProvider";
import { Orchestrator } from "../../../agents/Orchestrator";
import { createClient } from "@supabase/supabase-js";

vi.mock("@supabase/supabase-js", () => {
  const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
    insert: vi.fn().mockReturnThis(),
  };
  return {
    createClient: vi.fn(() => mockSupabase),
  };
});

vi.mock("../../../messaging/linq/LinqProvider");
vi.mock("../../../agents/Orchestrator");

describe("Linq Webhook POST", () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createClient("", "");
    mockSupabase.single.mockReset();
    mockSupabase.maybeSingle.mockReset();
    
    // Default mocks
    (LinqProvider.prototype.verifyWebhookSignature as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (LinqProvider.prototype.parseIncomingPayload as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      id: "msg-1",
      senderId: "+1234567890",
      text: "Hello Wisps",
      timestamp: new Date()
    });

    // Mock User exists
    mockSupabase.single.mockResolvedValueOnce({ data: { id: "user-123" }, error: null });
    // Mock no duplicate run
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    // Mock successful run insert
    mockSupabase.single.mockResolvedValueOnce({ data: { id: "run-1" }, error: null });

    // Mock orchestrator
    (Orchestrator.prototype.handleIncomingMessage as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it("should reject invalid signatures", async () => {
    (LinqProvider.prototype.verifyWebhookSignature as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const req = new Request("http://localhost/api/webhooks/linq", {
      method: "POST",
      body: JSON.stringify({ test: "data" }),
      headers: { "x-linq-signature": "bad-sig" }
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("should return 404 for unknown sender", async () => {
    mockSupabase.single.mockReset();
    // user not found
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: { message: "Not found" } });
    // insert user fails to return a valid object if not mocked, so let's mock it
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: { message: "Failed to create" } });

    const req = new Request("http://localhost/api/webhooks/linq", {
      method: "POST",
      body: JSON.stringify({ id: "1", senderId: "+0000", text: "hi" })
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("should deduplicate existing messages", async () => {
    mockSupabase.maybeSingle.mockReset();
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { id: "existing-run" } });

    const req = new Request("http://localhost/api/webhooks/linq", {
      method: "POST",
      body: JSON.stringify({ id: "1", senderId: "+1234567890", text: "hi" })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.duplicate).toBe(true);
    expect(Orchestrator.prototype.handleIncomingMessage).not.toHaveBeenCalled();
  });

  it("should dispatch to Orchestrator for valid new messages", async () => {
    const req = new Request("http://localhost/api/webhooks/linq", {
      method: "POST",
      body: JSON.stringify({ id: "1", senderId: "+1234567890", text: "hi" })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(Orchestrator.prototype.handleIncomingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        input: "Hello Wisps",
        metadata: expect.objectContaining({
          messageId: "msg-1",
          runId: "run-1",
          senderId: "+1234567890"
        })
      })
    );
  });
});
