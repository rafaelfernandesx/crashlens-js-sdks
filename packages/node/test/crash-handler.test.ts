import { describe, it, expect, vi, afterEach } from 'vitest';
import { installGlobalErrorHandlers } from '../src/runtime';

describe('uncaughtException handler', () => {
  const events = ['uncaughtException', 'unhandledRejection', 'beforeExit', 'SIGTERM'] as const;
  const saved = events.map((e) => [e, process.listeners(e as any)] as const);

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const [e, ls] of saved) {
      process.removeAllListeners(e as any);
      ls.forEach((l) => process.on(e as any, l as any));
    }
  });

  function setup(flush: () => Promise<void>) {
    const order: string[] = [];
    const client: any = {
      captureException: vi.fn(() => order.push('capture')),
      flush: vi.fn(async () => {
        order.push('flush');
        await flush();
      }),
    };
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      order.push(`exit:${code}`);
      return undefined as never;
    }) as any);
    process.removeAllListeners('uncaughtException'); // remove listeners do runner
    installGlobalErrorHandlers(client);
    return { client, exit, order };
  }

  it('captura, faz flush e sai com 1', async () => {
    const { client, exit, order } = setup(async () => {});
    (process as any).emit('uncaughtException', new Error('boom'), 'uncaughtException');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(client.captureException).toHaveBeenCalled();
    expect(order).toEqual(['capture', 'flush', 'exit:1']);
  });

  it('não sai se existirem outros listeners', async () => {
    const { client, exit } = setup(async () => {});
    process.on('uncaughtException', () => {});
    (process as any).emit('uncaughtException', new Error('boom'), 'uncaughtException');
    await vi.waitFor(() => expect(client.flush).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(exit).not.toHaveBeenCalled();
  });

  it('sai mesmo se o flush travar (timeout ~2s)', async () => {
    vi.useFakeTimers();
    const { exit } = setup(() => new Promise(() => {}));
    (process as any).emit('uncaughtException', new Error('x'), 'uncaughtException');
    await vi.advanceTimersByTimeAsync(2100);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
