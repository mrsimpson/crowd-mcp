import { createServer } from "http";

/**
 * Find an available port starting from the preferred port
 * @param preferredPort The port to try first
 * @param maxAttempts Maximum number of ports to try (default: 10)
 * @returns Promise resolving to an available port number
 * @throws Error if no available port is found within maxAttempts
 */
export async function findAvailablePort(
  preferredPort: number,
  maxAttempts: number = 10,
): Promise<number> {
  let currentPort = preferredPort;
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      await checkPortAvailable(currentPort);
      return currentPort;
    } catch {
      // Port is in use, try the next one
      attempts++;
      currentPort++;
    }
  }

  throw new Error(
    `Could not find an available port after ${maxAttempts} attempts starting from ${preferredPort}`,
  );
}

/**
 * Check if a port is available by attempting to bind to it
 * @param port The port to check
 * @returns Promise that resolves if port is available, rejects if in use
 */
function checkPortAvailable(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        reject(new Error(`Port ${port} is already in use`));
      } else {
        reject(error);
      }
    });

    server.once("listening", () => {
      // Port is available, close the test server
      server.close(() => {
        resolve();
      });
    });

    server.listen(port);
  });
}
