export interface FakeCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
}

export type FakeHandler = Response | ((call: FakeCall) => Response | Promise<Response>);

export function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

/** Maps `METHOD url-prefix` (longest prefix wins) to a Response factory and records calls. */
export function fakeFetch(routes: Record<string, FakeHandler>): { fetch: typeof fetch; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  const keys = Object.keys(routes).sort((a, b) => b.length - a.length);
  const fake = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const call: FakeCall = {
      method: init?.method ?? 'GET',
      url: String(input),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === 'string' ? init.body : undefined,
    };
    calls.push(call);
    const key = keys.find((k) => `${call.method} ${call.url}`.startsWith(k));
    if (!key) throw new Error(`fakeFetch: no route for ${call.method} ${call.url}`);
    const handler = routes[key];
    return typeof handler === 'function' ? handler(call) : handler.clone();
  };
  return { fetch: fake as typeof fetch, calls };
}
