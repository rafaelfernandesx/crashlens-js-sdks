import { describe, it, expect, afterEach } from 'vitest';
import { initNextServer, captureRequestError } from '../src/server';

const transport: any = {
  validateApiKey: async () => true,
  sendEvent: async () => ({ ok: true, status: 201 }),
  sendBatch: async () => ({ ok: true, status: 201 }),
  sendSessionStart: async () => ({ ok: true, status: 201 }),
  sendSessionEnd: async () => ({ ok: true, status: 201 }),
  sendHeartbeat: async () => ({ ok: true, status: 200 }),
};

function setup(extra: Record<string, unknown> = {}) {
  const events: any[] = [];
  initNextServer({
    apiKey: 'k',
    transport,
    enableGlobalHandlers: false,
    flushIntervalMs: 3_600_000,
    beforeSend: (e: any) => {
      events.push(e);
      return e;
    },
    ...extra,
  } as any);
  return events;
}

afterEach(() => {
  delete process.env.CRASHLENS_RELEASE;
  delete process.env.NEXT_PUBLIC_CRASHLENS_ENVIRONMENT;
});

describe('captureRequestError', () => {
  it('captura com tags de rota e sem headers sensíveis', () => {
    const events = setup();
    captureRequestError(
      Object.assign(new Error('render failed'), { digest: 'abc123' }),
      {
        path: '/blog/42?token=secret',
        method: 'GET',
        headers: { authorization: 'Bearer SECRET', cookie: 'a=b', 'x-request-id': 'rid-1' },
      },
      { routerKind: 'App Router', routePath: '/blog/[id]', routeType: 'render', renderSource: 'react-server-components' },
    );
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.tags).toMatchObject({
      httpMethod: 'GET',
      routePath: '/blog/[id]',
      routeType: 'render',
      routerKind: 'App Router',
      requestId: 'rid-1',
      framework: 'nextjs',
    });
    expect(e.url).toBe('/blog/42');
    expect(e.extra.digest).toBe('abc123');
    expect(JSON.stringify(e.toJson())).not.toMatch(/SECRET|a=b|token=secret/);
  });

  it('release/environment vêm das variáveis de ambiente', () => {
    process.env.CRASHLENS_RELEASE = 'r1';
    process.env.NEXT_PUBLIC_CRASHLENS_ENVIRONMENT = 'preview';
    const events = setup();
    captureRequestError(new Error('x'), { path: '/', method: 'GET' }, {});
    expect(events[0].release).toBe('r1');
    expect(events[0].environment).toBe('preview');
  });
});
