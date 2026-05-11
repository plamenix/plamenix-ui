/**
 * Transport — the single boundary between the Plamenix React shell and its
 * host runtime.
 *
 * The desktop edition supplies a Tauri-backed implementation that forwards
 * calls through `@tauri-apps/api`'s `invoke()`. The web edition supplies an
 * HTTP-backed implementation that forwards calls through `fetch()` to the
 * Fastify server. Every shared component, hook, and store talks to the host
 * exclusively through this interface; nothing else in `@plamenix/ui`
 * imports edition-specific APIs.
 */

/**
 * One-way command dispatch into the host runtime.
 *
 * A command is a named, string-addressed function exposed by the host (a
 * Tauri command on desktop, a JSON-RPC endpoint on web). Arguments are
 * serialised as JSON; return values are deserialised by the caller.
 */
export interface Transport {
  /**
   * Invokes a host command and resolves with its result.
   *
   * @param command - The host command identifier, e.g. `"db_connect"`.
   * @param args    - Optional payload object. Must be JSON-serialisable.
   * @returns A promise that resolves with the command's typed return value,
   *          or rejects with a {@link TransportError} when the host reports
   *          failure or the underlying channel breaks.
   */
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

/**
 * Error thrown when the transport layer cannot satisfy a command.
 *
 * Distinguishes channel-level failures (network down, IPC closed, host
 * crashed) from application-level command errors (which are surfaced as
 * typed `Result` shapes inside the command's return type).
 */
export class TransportError extends Error {
  /**
   * Constructs a transport error.
   *
   * @param message - Human-readable description of what went wrong.
   * @param cause   - Optional underlying error (network exception, IPC
   *                  bridge failure, host panic) for diagnostics.
   */
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'TransportError';
  }
}
