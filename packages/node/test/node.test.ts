import { describe, it, expect } from 'vitest';
import { collectRuntimeInfo } from '../src/runtime';
import { getRequestContext } from '../src/middleware';
import { IncomingMessage } from 'node:http';
import { CrashLens } from '@crashlensorg/core';
import { runWithScope, asyncLocalScopeProvider } from '../src/scope-context';

describe('node runtime info', () => {
  it('coleta informações do host', () => {
    const info = collectRuntimeInfo();
    expect(info.deviceId).toBeTruthy();
    expect(info.deviceType).toBe('server');
    expect(info.deviceOs).toBe(process.platform);
    expect(info.cpuArchitecture).toBe(process.arch);
  });
});

describe('middleware', () => {
  it('extrai contexto de request', () => {
    const req = {
      method: 'POST',
      url: '/api/events?x=1',
      headers: { 'user-agent': 'curl', 'x-request-id': 'abc' },
      socket: { remoteAddress: '10.0.0.1' },
    } as unknown as IncomingMessage;
    const ctx = getRequestContext(req);
    expect(ctx.method).toBe('POST');
    expect(ctx.url).toBe('/api/events?x=1');
    expect(ctx.requestId).toBe('abc');
  });
});
describe('isolation scope', () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  function makeClient() {
    const events: any[] = [];
    const client = new CrashLens({
      apiKey: 'k',
      scopeProvider: asyncLocalScopeProvider,
      beforeSend: (e) => {
        events.push(e);
        return e;
      },
    });
    return { client, events };
  }

  it('não vaza usuário/breadcrumbs entre fluxos assíncronos concorrentes', async () => {
    const { client, events } = makeClient();
    client.setTag('global', 'yes');

    const flow = (id: string, delay: number) =>
      runWithScope(async () => {
        client.setUser({ id });
        client.addBreadcrumb({ message: `bc-${id}` });
        await sleep(delay);
        client.captureMessage(`msg-${id}`);
      });

    await Promise.all([flow('A', 20), flow('B', 5)]);

    const a = events.find((e) => e.message === 'msg-A');
    const b = events.find((e) => e.message === 'msg-B');
    expect(a.user.id).toBe('A');
    expect(b.user.id).toBe('B');
    expect(a.breadcrumbs.map((x: any) => x.message)).toEqual(['bc-A']);
    expect(b.breadcrumbs.map((x: any) => x.message)).toEqual(['bc-B']);
    expect(a.tags.global).toBe('yes');

    // fora do escopo isolado, o escopo global permanece intacto
    client.captureMessage('outside');
    const out = events.find((e) => e.message === 'outside');
    expect(out.user).toBeUndefined();
    expect(out.breadcrumbs).toHaveLength(0);
  });
});
