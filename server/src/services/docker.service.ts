import Docker from "dockerode";

const CONTAINER_NAME = "openkick-waha";
const IMAGE_NAME = "devlikeapro/waha";
const WAHA_INTERNAL_PORT = 3000;
const DAEMON_TIMEOUT_MS = 5000;

export type DaemonCheckResult =
  | { available: true }
  | { available: false; error: string };

export type WahaStatus =
  | { status: "not_found" }
  | { status: "running"; port: number | undefined }
  | { status: "stopped" };

export interface WahaInstallConfig {
  port: number;
  engine: "WEBJS" | "NOWEB";
}

/**
 * Wraps dockerode to manage the Docker daemon and the openkick-waha container.
 */
export class DockerService {
  private docker: Docker;

  constructor(opts?: Docker.DockerOptions) {
    this.docker = new Docker(opts);
  }

  /**
   * Checks whether the Docker daemon is reachable.
   */
  async checkDaemon(): Promise<DaemonCheckResult> {
    try {
      await Promise.race([
        this.docker.ping(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Docker daemon timeout")), DAEMON_TIMEOUT_MS),
        ),
      ]);
      return { available: true };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Docker daemon unreachable";
      return { available: false, error: message };
    }
  }

  /**
   * Returns the current state of the openkick-waha container.
   */
  async getWahaStatus(): Promise<WahaStatus> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: { name: [CONTAINER_NAME] },
    });

    const container = containers.find((c) =>
      c.Names.some((n) => n === `/${CONTAINER_NAME}`),
    );

    if (!container) {
      return { status: "not_found" };
    }

    if (container.State === "running") {
      const portMapping = container.Ports?.find(
        (p: { PrivatePort: number }) => p.PrivatePort === WAHA_INTERNAL_PORT,
      );
      return {
        status: "running",
        port: portMapping?.PublicPort,
      };
    }

    return { status: "stopped" };
  }

  /**
   * Pulls the WAHA image, creates the container, and starts it.
   * Optionally calls onProgress with status messages during the image pull.
   */
  async installWaha(
    config: WahaInstallConfig,
    onProgress?: (msg: string) => void,
  ): Promise<void> {
    // Remove any existing container to allow re-runs
    try {
      const existing = this.docker.getContainer(CONTAINER_NAME);
      await existing.remove({ force: true });
    } catch {
      // Container doesn't exist, which is fine
    }

    // Pull the image
    const stream = await this.docker.pull(IMAGE_NAME);

    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(
        stream,
        (err: Error | null, _output: unknown[]) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        },
        (event: { status: string }) => {
          if (onProgress && event.status) {
            onProgress(event.status);
          }
        },
      );
    });

    // Build the webhook URL
    const webhookUrl =
      process.env.WEBHOOK_URL ??
      `http://host.docker.internal:${process.env.PORT || 3001}/api/whatsapp/webhook`;

    // Create the container
    const container = await this.docker.createContainer({
      name: CONTAINER_NAME,
      Image: IMAGE_NAME,
      Env: [
        `WHATSAPP_HOOK_URL=${webhookUrl}`,
        "WHATSAPP_HOOK_EVENTS=message",
        `WHATSAPP_DEFAULT_ENGINE=${config.engine}`,
      ],
      HostConfig: {
        PortBindings: {
          "3000/tcp": [{ HostPort: String(config.port) }],
        },
        RestartPolicy: { Name: "unless-stopped" },
      },
    });

    await container.start();
  }

  /**
   * Starts an existing stopped openkick-waha container.
   */
  async startWaha(): Promise<void> {
    const info = await this.findWahaContainer();
    const container = this.docker.getContainer(info.Id);
    await container.start();
  }

  /**
   * Stops a running openkick-waha container.
   */
  async stopWaha(): Promise<void> {
    const info = await this.findWahaContainer();
    const container = this.docker.getContainer(info.Id);
    await container.stop();
  }

  /**
   * Finds the openkick-waha container or throws if not found.
   */
  private async findWahaContainer(): Promise<Docker.ContainerInfo> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: { name: [CONTAINER_NAME] },
    });

    const container = containers.find((c) =>
      c.Names.some((n) => n === `/${CONTAINER_NAME}`),
    );

    if (!container) {
      throw new Error(`Container ${CONTAINER_NAME} not found`);
    }

    return container;
  }
}
