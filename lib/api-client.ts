export type ApiError = {
  code: string;
  message: string;
  fields?: Record<string, string[]>;
};

export async function parseApiError(res: Response): Promise<ApiError> {
  try {
    const body = await res.clone().json();
    if (
      body?.error &&
      typeof body.error === 'object' &&
      typeof body.error.message === 'string'
    ) {
      return body.error as ApiError;
    }
  } catch {
    /* ignore */
  }
  return { code: `http_${res.status}`, message: `Request failed (HTTP ${res.status}).` };
}
