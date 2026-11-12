// 네트워크 함수. PC 서버는 기본 fetch 를, 휴대폰 앱은 CORS 제한이 없는 네이티브 요청을 끼워 넣는다.
export type HttpFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number }) => Promise<Response>;

let impl: HttpFetch = (url, init) =>
  fetch(url, { method: init?.method, headers: init?.headers, body: init?.body, signal: init?.timeoutMs ? AbortSignal.timeout(init.timeoutMs) : undefined });

export const setHttpFetch = (fn: HttpFetch) => { impl = fn; };
export const http: HttpFetch = (url, init) => impl(url, init);
