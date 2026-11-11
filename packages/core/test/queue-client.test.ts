import { describe, it, expect, vi, afterEach } from 'vitest';
import { CrashLens } from '../src/client/crashlens';
import { CrashLensEvent } from '../src/event';
import { EventQueue } from '../src/queue/event-queue';
import type { ITransport, TResponse } from '../src/transport/transport';

const ev = (m: string) => new CrashLensEvent({ apiKey: 'k', message: m });

class FakeTransport implements ITransport {
  batches: string[][] = [];
  singles: string[] = [];
  batchRes: TResponse[] = [];
  singleRes: (e: CrashLensEvent) => TResponse = () => ({ ok: true, status: 201 });
  async sendBatch(events: CrashLensEvent[]) {
    this.batches.push(events.map((e) => e.message));
    return this.batchRes.shift() ?? ({ ok: true, status: 201 } as TResponse);
  }
  async sendEvent(e: CrashLensEvent) {
    this.singles.push(e.message);
    return this.singleRes(e);
  }
  async validateApiKey() {
    return true;
  }
  async sendSessionStart() {
    return { ok: true, status: 201 } as TResponse;
  }
  async sendSessionEnd() {
    return { ok: true, status: 200 } as TResponse;
  }
  async sendHeartbeat() {
    return { ok: true, status: 200 } as TResponse;
  }
}

describe('EventQueue (robustez)', () => {
  afterEach(() => vi.useRealTimers());

  it('não reenvia itens já entregues após falha parcial', async () => {
    const t = new FakeTransport();
    t.batchRes = [{ ok: false, status: 500 }];
    t.singleRes = (e) => (e.message === 'b' ? { ok: false, status: 500 } : { ok: true, status: 201 });
    const q = new EventQueue({ transport: t });
    ['a', 'b', 'c'].forEach((m) => q.enqueue(ev(m)));
    await q.flush();
    expect(t.singles).toEqual(['a', 'b', 'c']);
    expect(q.pendingCount).toBe(1); // apenas 'b', sem duplicar
    t.singles.length = 0;
    t.singleRes = () => ({ ok: true, status: 201 });
    t.batchRes = [{ ok: false, status: 500 }];
    await q.flush();
    expect(t.batches[1]).toEqual(['b']);
    expect(t.singles).toEqual(['b']);
    expect(q.pendingCount).toBe(0);
  });

  it('descarta após maxRetries', async () => {
    const t = new FakeTransport();
    t.batchRes = [{ ok: false, status: 500 }, { ok: false, status: 500 }];
    t.singleRes = () => ({ ok: false, status: 500 });
    const q = new EventQueue({ transport: t, maxRetries: 2 });
    q.enqueue(ev('x'));
    await q.flush();
    expect(q.pendingCount).toBe(1);
    await q.flush();
    expect(q.pendingCount).toBe(0);
  });

  it('descarta evento 413 imediatamente', async () => {
    const t = new FakeTransport();
    t.batchRes = [{ ok: false, status: 413 }];
    t.singleRes = () => ({ ok: false, status: 413 });
    const q = new EventQueue({ transport: t });
    q.enqueue(ev('big'));
    await q.flush();
    expect(q.pendingCount).toBe(0);
    expect(q.isPaused).toBe(false);
  });

  it('429 faz backoff (Retry-After) sem pausar permanentemente', async () => {
    vi.useFakeTimers();
    const t = new FakeTransport();
    t.batchRes = [{ ok: false, status: 429, retryAfter: 10 }];
    let quota = false;
    const q = new EventQueue({ transport: t, onQuotaExceeded: () => (quota = true) });
    q.enqueue(ev('a'));
    await q.flush();
    expect(q.isPaused).toBe(false);
    expect(quota).toBe(false);
    expect(q.pendingCount).toBe(1);
    await q.flush(); // ainda em backoff
    expect(t.batches.length).toBe(1);
    vi.advanceTimersByTime(10_001);
    await q.flush();
    expect(t.batches.length).toBe(2);
    expect(q.pendingCount).toBe(0);
  });

  it('respeita resultados por item do lote', async () => {
    const t = new FakeTransport();
    t.batchRes = [
      {
        ok: true,
        status: 200,
        body: JSON.stringify({
          results: [
            { index: 0, ok: true },
            { index: 1, ok: false, error: 'validation failed' },
            { index: 2, ok: false, error: { status: 503 } },
          ],
        }),
      },
    ];
    const q = new EventQueue({ transport: t });
    ['a', 'b', 'c'].forEach((m) => q.enqueue(ev(m)));
    await q.flush();
    expect(q.pendingCount).toBe(1); // só 'c' (transitório) volta
  });

  it('limita a fila descartando os mais antigos', () => {
    const q = new EventQueue({ transport: new FakeTransport(), maxQueueSize: 3 });
    for (let i = 0; i < 5; i++) q.enqueue(ev(`m${i}`));
    expect(q.pendingCount).toBe(3);
  });

  it('limita o lote por bytes', async () => {
    const t = new FakeTransport();
    const q = new EventQueue({ transport: t, maxBatchBytes: 1500 });
    for (let i = 0; i < 4; i++) q.enqueue(new CrashLensEvent({ apiKey: 'k', message: 'x'.repeat(600) }));
    await q.flush();
    expect(t.batches.length).toBeGreaterThan(1);
    expect(t.batches.flat().length).toBe(4);
  });
});

describe('CrashLens client', () => {
  it('mantém em buffer eventos capturados antes do init terminar', async () => {
    const t = new FakeTransport();
    let release!: (v: boolean) => void;
    t.validateApiKey = () => new Promise<boolean>((r) => (release = r));
    const client = new CrashLens({ apiKey: 'k', transport: t, enableSessionTracking: false });
    const init = client.init();
    expect(client.captureMessage('early').ok).toBe(true);
    expect(t.batches).toEqual([]);
    expect(client.pendingEvents).toBe(1);
    release(true);
    await init;
    await client.flush();
    expect(t.batches.flat()).toEqual(['early']);
    await client.close();
  });

  it('descarta o buffer se a chave for inválida', async () => {
    const t = new FakeTransport();
    t.validateApiKey = async () => false;
    const client = new CrashLens({ apiKey: 'k', transport: t, enableSessionTracking: false });
    const init = client.init();
    client.captureMessage('early');
    await init;
    expect(client.pendingEvents).toBe(0);
    expect(client.captureMessage('late').ok).toBe(false);
  });
});

describe('payload', () => {
  it('envia eventId', () => {
    const e = ev('m');
    expect(e.toJson().eventId).toBe(e.eventId);
    expect(e.toJson().eventId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('trunca message, stack, breadcrumbs, extra e tags', () => {
    const e = new CrashLensEvent({
      apiKey: 'k',
      message: 'm'.repeat(20_000),
      stackTrace: 's'.repeat(200_000),
      extra: { big: 'x'.repeat(100_000) },
      tags: { t: 'y'.repeat(100_000) },
      breadcrumbs: Array.from({ length: 80 }, (_, i) => ({
        message: `b${i}`,
        data: { blob: 'z'.repeat(10_000) },
      })),
    });
    const p = e.toJson();
    expect(p.message.length).toBeLessThanOrEqual(8 * 1024);
    expect(p.stackTrace!.length).toBeLessThanOrEqual(64 * 1024);
    expect(JSON.stringify(p.extra).length).toBeLessThan(32 * 1024 + 100);
    expect(JSON.stringify(p.tags).length).toBeLessThan(32 * 1024 + 100);
    expect(p.breadcrumbs!.length).toBe(50);
    expect(p.breadcrumbs![49].message).toBe('b79');
    expect(JSON.stringify(p.breadcrumbs![0].data).length).toBeLessThan(2 * 1024 + 100);
  });
});
