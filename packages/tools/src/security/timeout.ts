export class TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Tool execution timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Runs a promise with a hard timeout and cancellation abort signal.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  let timer: any = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fn(controller.signal), timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
