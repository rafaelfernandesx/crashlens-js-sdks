import { describe, it, expect } from 'vitest';
import { collectRuntimeInfo } from '../src/runtime';
import { getRequestContext } from '../src/middleware';
import { IncomingMessage } from 'node:http';

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