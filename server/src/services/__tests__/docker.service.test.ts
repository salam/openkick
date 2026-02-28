import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We mock dockerode at the module level
const mockPing = vi.fn();
const mockListContainers = vi.fn();
const mockCreateContainer = vi.fn();
const mockPull = vi.fn();
const mockGetContainer = vi.fn();
const mockModem = { followProgress: vi.fn() };

vi.mock("dockerode", () => {
  class MockDocker {
    ping = mockPing;
    listContainers = mockListContainers;
    createContainer = mockCreateContainer;
    pull = mockPull;
    getContainer = mockGetContainer;
    modem = mockModem;
  }
  return { default: MockDocker };
});

let DockerService: typeof import("../../services/docker.service.js").DockerService;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import("../../services/docker.service.js");
  DockerService = mod.DockerService;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DockerService.checkDaemon", () => {
  it("returns available: true when daemon is reachable", async () => {
    mockPing.mockResolvedValue("OK");

    const service = new DockerService();
    const result = await service.checkDaemon();

    expect(result).toEqual({ available: true });
    expect(mockPing).toHaveBeenCalledOnce();
  });

  it("returns available: false with error when daemon is unreachable", async () => {
    mockPing.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const service = new DockerService();
    const result = await service.checkDaemon();

    expect(result).toEqual({
      available: false,
      error: "connect ECONNREFUSED",
    });
  });

  it("returns available: false with fallback message for non-Error throws", async () => {
    mockPing.mockRejectedValue("something weird");

    const service = new DockerService();
    const result = await service.checkDaemon();

    expect(result).toEqual({
      available: false,
      error: "Docker daemon unreachable",
    });
  });
});

describe("DockerService.getWahaStatus", () => {
  it("returns not_found when no container matches", async () => {
    mockListContainers.mockResolvedValue([]);

    const service = new DockerService();
    const result = await service.getWahaStatus();

    expect(result).toEqual({ status: "not_found" });
    expect(mockListContainers).toHaveBeenCalledWith({
      all: true,
      filters: { name: ["openkick-waha"] },
    });
  });

  it("returns running with port when container is running", async () => {
    mockListContainers.mockResolvedValue([
      {
        State: "running",
        Ports: [{ PublicPort: 3080, PrivatePort: 3000 }],
        Names: ["/openkick-waha"],
      },
    ]);

    const service = new DockerService();
    const result = await service.getWahaStatus();

    expect(result).toEqual({ status: "running", port: 3080 });
  });

  it("returns stopped when container exists but is not running", async () => {
    mockListContainers.mockResolvedValue([
      {
        State: "exited",
        Ports: [],
        Names: ["/openkick-waha"],
      },
    ]);

    const service = new DockerService();
    const result = await service.getWahaStatus();

    expect(result).toEqual({ status: "stopped" });
  });

  it("returns running without port when no ports are mapped", async () => {
    mockListContainers.mockResolvedValue([
      {
        State: "running",
        Ports: [],
        Names: ["/openkick-waha"],
      },
    ]);

    const service = new DockerService();
    const result = await service.getWahaStatus();

    expect(result).toEqual({ status: "running", port: undefined });
  });
});

describe("DockerService.installWaha", () => {
  it("pulls image, creates container, and starts it", async () => {
    const mockStream = {};
    mockPull.mockResolvedValue(mockStream);

    // Mock modem.followProgress to call onFinished immediately
    mockModem.followProgress.mockImplementation(
      (_stream: unknown, onFinished: (err: null, output: unknown[]) => void) => {
        onFinished(null, []);
      },
    );

    const mockStart = vi.fn().mockResolvedValue(undefined);
    mockCreateContainer.mockResolvedValue({ start: mockStart });

    const service = new DockerService();
    await service.installWaha({ port: 3080, engine: "WEBJS" });

    // Verify pull
    expect(mockPull).toHaveBeenCalledWith("devlikeapro/waha");

    // Verify container creation
    expect(mockCreateContainer).toHaveBeenCalledOnce();
    const createArgs = mockCreateContainer.mock.calls[0][0];
    expect(createArgs.name).toBe("openkick-waha");
    expect(createArgs.Image).toBe("devlikeapro/waha");
    expect(createArgs.HostConfig.PortBindings["3000/tcp"]).toEqual([
      { HostPort: "3080" },
    ]);
    expect(createArgs.HostConfig.RestartPolicy).toEqual({
      Name: "unless-stopped",
    });

    // Verify env vars
    expect(createArgs.Env).toContain("WHATSAPP_HOOK_EVENTS=message");
    expect(createArgs.Env).toContain("WHATSAPP_DEFAULT_ENGINE=WEBJS");
    const hookUrlEnv = createArgs.Env.find((e: string) =>
      e.startsWith("WHATSAPP_HOOK_URL="),
    );
    expect(hookUrlEnv).toBeTruthy();

    // Verify start was called
    expect(mockStart).toHaveBeenCalledOnce();
  });

  it("calls onProgress during image pull", async () => {
    const mockStream = {};
    mockPull.mockResolvedValue(mockStream);

    mockModem.followProgress.mockImplementation(
      (
        _stream: unknown,
        onFinished: (err: null, output: unknown[]) => void,
        onProgress: (event: { status: string }) => void,
      ) => {
        onProgress({ status: "Pulling layer 1/3" });
        onProgress({ status: "Pulling layer 2/3" });
        onFinished(null, []);
      },
    );

    const mockStart = vi.fn().mockResolvedValue(undefined);
    mockCreateContainer.mockResolvedValue({ start: mockStart });

    const progressMessages: string[] = [];
    const service = new DockerService();
    await service.installWaha({ port: 3080, engine: "NOWEB" }, (msg) => {
      progressMessages.push(msg);
    });

    expect(progressMessages).toContain("Pulling layer 1/3");
    expect(progressMessages).toContain("Pulling layer 2/3");
  });

  it("rejects when image pull fails", async () => {
    const mockStream = {};
    mockPull.mockResolvedValue(mockStream);

    mockModem.followProgress.mockImplementation(
      (_stream: unknown, onFinished: (err: Error | null) => void) => {
        onFinished(new Error("pull failed"));
      },
    );

    const service = new DockerService();
    await expect(
      service.installWaha({ port: 3080, engine: "WEBJS" }),
    ).rejects.toThrow("pull failed");
  });

  it("uses WEBHOOK_URL env var when available", async () => {
    const originalEnv = process.env.WEBHOOK_URL;
    process.env.WEBHOOK_URL = "https://my-server.com/api/whatsapp/webhook";

    const mockStream = {};
    mockPull.mockResolvedValue(mockStream);
    mockModem.followProgress.mockImplementation(
      (_stream: unknown, onFinished: (err: null, output: unknown[]) => void) => {
        onFinished(null, []);
      },
    );
    const mockStart = vi.fn().mockResolvedValue(undefined);
    mockCreateContainer.mockResolvedValue({ start: mockStart });

    const service = new DockerService();
    await service.installWaha({ port: 3080, engine: "WEBJS" });

    const createArgs = mockCreateContainer.mock.calls[0][0];
    expect(createArgs.Env).toContain(
      "WHATSAPP_HOOK_URL=https://my-server.com/api/whatsapp/webhook",
    );

    // Restore
    if (originalEnv === undefined) {
      delete process.env.WEBHOOK_URL;
    } else {
      process.env.WEBHOOK_URL = originalEnv;
    }
  });

  it("uses fallback webhook URL with host.docker.internal", async () => {
    const originalWebhook = process.env.WEBHOOK_URL;
    const originalPort = process.env.PORT;
    delete process.env.WEBHOOK_URL;
    delete process.env.PORT;

    const mockStream = {};
    mockPull.mockResolvedValue(mockStream);
    mockModem.followProgress.mockImplementation(
      (_stream: unknown, onFinished: (err: null, output: unknown[]) => void) => {
        onFinished(null, []);
      },
    );
    const mockStart = vi.fn().mockResolvedValue(undefined);
    mockCreateContainer.mockResolvedValue({ start: mockStart });

    const service = new DockerService();
    await service.installWaha({ port: 3080, engine: "WEBJS" });

    const createArgs = mockCreateContainer.mock.calls[0][0];
    expect(createArgs.Env).toContain(
      "WHATSAPP_HOOK_URL=http://host.docker.internal:3001/api/whatsapp/webhook",
    );

    // Restore
    if (originalWebhook !== undefined) process.env.WEBHOOK_URL = originalWebhook;
    if (originalPort !== undefined) process.env.PORT = originalPort;
  });
});

describe("DockerService.startWaha", () => {
  it("starts the stopped container", async () => {
    const mockStart = vi.fn().mockResolvedValue(undefined);
    mockListContainers.mockResolvedValue([
      { State: "exited", Names: ["/openkick-waha"], Id: "abc123" },
    ]);
    mockGetContainer.mockReturnValue({ start: mockStart });

    const service = new DockerService();
    await service.startWaha();

    expect(mockGetContainer).toHaveBeenCalledWith("abc123");
    expect(mockStart).toHaveBeenCalledOnce();
  });

  it("throws when container is not found", async () => {
    mockListContainers.mockResolvedValue([]);

    const service = new DockerService();
    await expect(service.startWaha()).rejects.toThrow(
      "Container openkick-waha not found",
    );
  });
});

describe("DockerService.stopWaha", () => {
  it("stops the running container", async () => {
    const mockStop = vi.fn().mockResolvedValue(undefined);
    mockListContainers.mockResolvedValue([
      { State: "running", Names: ["/openkick-waha"], Id: "def456" },
    ]);
    mockGetContainer.mockReturnValue({ stop: mockStop });

    const service = new DockerService();
    await service.stopWaha();

    expect(mockGetContainer).toHaveBeenCalledWith("def456");
    expect(mockStop).toHaveBeenCalledOnce();
  });

  it("throws when container is not found", async () => {
    mockListContainers.mockResolvedValue([]);

    const service = new DockerService();
    await expect(service.stopWaha()).rejects.toThrow(
      "Container openkick-waha not found",
    );
  });
});
