import { describe, it, expect, beforeEach, vi, type Mocked } from "vitest";
import { GmailSyncService } from "../../../integrations/gmail/GmailSyncService";
import { GmailRepository } from "../../../integrations/gmail/GmailRepository";
import { GmailNormalizer } from "../../../integrations/gmail/GmailNormalizer";
import { MemoryAgent } from "../../../agents/MemoryAgent";
import { google } from "googleapis";

// Mock dependencies
vi.mock("../../../integrations/gmail/GmailRepository");
vi.mock("../../../integrations/gmail/GmailNormalizer");
vi.mock("../../../agents/MemoryAgent");
vi.mock("googleapis");

describe("GmailSyncService", () => {
  let service: GmailSyncService;
  let mockRepository: Mocked<GmailRepository>;
  let mockNormalizer: Mocked<GmailNormalizer>;
  let mockMemoryAgent: Mocked<MemoryAgent>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GmailSyncService();
    // Assuming the service instantiates these internally, we mock the prototypes
    mockRepository = GmailRepository.prototype as unknown as Mocked<GmailRepository>;
    mockNormalizer = GmailNormalizer.prototype as unknown as Mocked<GmailNormalizer>;
    mockMemoryAgent = MemoryAgent.prototype as unknown as Mocked<MemoryAgent>;

    const mockOAuth2Client = {
      setCredentials: vi.fn(),
    };

    (google.auth.OAuth2 as unknown as ReturnType<typeof vi.fn>).mockImplementation(function() { return mockOAuth2Client; });
  });

  it("should fail gracefully if integration is not found", async () => {
    mockRepository.getIntegration.mockRejectedValue(new Error("Integration not found"));
    await service.sync("invalid-id");
    
    expect(mockRepository.getIntegration).toHaveBeenCalledWith("invalid-id");
    expect(google.auth.OAuth2).not.toHaveBeenCalled();
  });

  it("should perform initial sync when no last_history_id exists", async () => {
    mockRepository.getIntegration.mockResolvedValue({
      id: "int-1",
      user_id: "user-1",
      access_token: "token",
      refresh_token: "refresh",
      last_history_id: null
    });

    const mockThreadsList = vi.fn().mockResolvedValue({
      data: {
        threads: [{ id: "thread-1" }, { id: "thread-2" }]
      }
    });
    
    const mockProfileGet = vi.fn().mockResolvedValue({
      data: { historyId: "history-123" }
    });

    const mockThreadsGet = vi.fn().mockResolvedValue({
      data: { id: "thread-1", messages: [{}] }
    });

    (google.gmail as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      users: {
        threads: { list: mockThreadsList, get: mockThreadsGet },
        getProfile: mockProfileGet,
      }
    });

    mockNormalizer.normalizeThread.mockReturnValue({
      source: "gmail",
      threadId: "thread-1",
      subject: "Test",
      participants: [],
      messages: [],
      historyId: "h1",
      timestamp: new Date().toISOString()
    });

    mockRepository.insertEvent.mockResolvedValue({ data: { id: "event-1" }, error: null });
    mockMemoryAgent.processEvent.mockResolvedValue({ success: true, data: { ignored: true } });

    await service.sync("int-1");

    expect(mockThreadsList).toHaveBeenCalledWith({ userId: "me", maxResults: 50 });
    expect(mockRepository.updateIntegrationSyncState).toHaveBeenCalledWith("int-1", "history-123");
  });
});
