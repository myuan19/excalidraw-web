export class ApiError extends Error {
  readonly status: number;
  readonly body: Record<string, unknown> | undefined;

  constructor(message: string, status: number, body?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export function isFileConflictError(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.body?.error === "file_conflict"
  );
}

export function parseApiErrorBody(
  raw: string,
  contentType: string,
): { message: string; body?: Record<string, unknown> } {
  if (!contentType.includes("application/json") || !raw) {
    return { message: raw };
  }
  try {
    const parsed = JSON.parse(raw) as {
      message?: string;
      error?: string;
      content_sha256?: string | null;
    };
    const message = parsed.message || parsed.error || raw;
    return { message, body: parsed as Record<string, unknown> };
  } catch {
    return { message: raw };
  }
}
