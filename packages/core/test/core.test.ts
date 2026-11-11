import { describe, it, expect } from 'vitest';
import { CrashLensEvent } from '../src/event';
import { computeEventHash } from '../src/fingerprint';
import { sha256Hex } from '../src/utils/sha256';
import { uuidv4 } from '../src/utils/nanoid';
import { EventQueue } from '../src/queue/event-queue';
import { BaseTransport, TResponse } from '../src/transport/transport';

describe('sha256', () => {
  it('produces the correct known hash', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('uuidv4', () => {
  it('generates unique valid v4 uuids', () => {
    const a = uuidv4();
    const b = uuidv4();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(a).not.toBe(b);
  });
});

describe('fingerprint', () => {
  it('ignora o timestamp e é determinístico', () => {
    const base = { apiKey: 'k', message: 'boom', exceptionType: 'TypeError' };
    const e1 = new CrashLensEvent({ ...base, timestamp: '2024-01-01T00:00:00.000Z' });
    const e2 = new CrashLensEvent({ ...base, timestamp: '2024-06-01T00:00:00.000Z' });
    expect(computeEventHash(e1)).toBe(computeEventHash(e2));
  });

  it('muda para conteúdo diferente', () => {
    const e1 = new CrashLensEvent({ apiKey: 'k', message: 'a' });
    const e2 = new CrashLensEvent({ apiKey: 'k', message: 'b' });
    expect(computeEventHash(e1)).not.toBe(computeEventHash(e2));
  });
});

describe('EventQueue', () => {
  class MockTransport extends BaseTransport {
    posted: Array<TResponse> = [];
    constructor(readonly responses: TResponse[]) {
      super({ baseUrl: 'https://x/api', apiKey: 'k' });
    }
    protected async post(): Promise<TResponse> {
      return this.responses.shift() ?? { ok: false, status: 500 };
    }
  }

  it('acumula eventos e envia em lote no flush', async () => {
    const t = new MockTransport([{ ok: true, status: 201 }]);
    const q = new EventQueue({ transport: t, maxBatchSize: 10 });
    for (let i = 0; i < 3; i++) {
      q.enqueue(new CrashLensEvent({ apiKey: 'k', message: `m${i}` }));
    }
    await q.flush();
    expect(q.pendingCount).toBe(0);
  });

  it('pausa em 402 (quota)', async () => {
    const t = new MockTransport([{ ok: false, status: 402 }]);
    let quotaPaused = false;
    const q = new EventQueue({ transport: t, onQuotaExceeded: () => (quotaPaused = true) });
    q.enqueue(new CrashLensEvent({ apiKey: 'k', message: 'm' }));
    await q.flush();
    expect(quotaPaused).toBe(true);
    expect(q.isPaused).toBe(true);
  });
});