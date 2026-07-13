let csrfTokenCache: string | null = null;

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  csrf?: boolean;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function readPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return response.json().catch(() => undefined);
  return response.text().catch(() => undefined);
}

async function getCsrfToken() {
  if (csrfTokenCache) return csrfTokenCache;

  const response = await fetch('/api/auth/csrf', {
    credentials: 'include',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new ApiError('CSRF 토큰을 불러오지 못했습니다.', response.status);
  }

  const data = (await response.json()) as { csrfToken: string };
  csrfTokenCache = data.csrfToken;
  return csrfTokenCache;
}

export function clearCsrfToken() {
  csrfTokenCache = null;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: HeadersInit = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && options.csrf !== false) {
    headers['x-csrf-token'] = await getCsrfToken();
  }

  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    throw new ApiError(
      `요청을 처리하지 못했습니다. (${response.status})`,
      response.status,
      await readPayload(response),
    );
  }
  return response.json() as Promise<T>;
}

export async function uploadRequest<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { accept: 'application/json', 'x-csrf-token': await getCsrfToken() },
    body: formData,
  });
  if (!response.ok) {
    throw new ApiError(
      `파일을 업로드하지 못했습니다. (${response.status})`,
      response.status,
      await readPayload(response),
    );
  }
  return response.json() as Promise<T>;
}
