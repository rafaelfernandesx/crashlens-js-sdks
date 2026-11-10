import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { HttpException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { CrashLensService } from '../src/crash-lens.service';
import { CrashLensFilter } from '../src/crash-lens.filter';
import { CrashLensInterceptor } from '../src/crash-lens.interceptor';
import { runWithScope } from '@crashlensorg/node';
import { of, throwError, lastValueFrom } from 'rxjs';

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
  const service = new CrashLensService({
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
  return { service, events };
}

function makeHost(req: any) {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
    getArgByIndex: (i: number) => [req, {}][i],
    getArgs: () => [req, {}],
  } as any;
}

const req = {
  method: 'POST',
  originalUrl: '/users/42?token=secret',
  url: '/users/42?token=secret',
  baseUrl: '',
  route: { path: '/users/:id' },
  headers: { 'x-request-id': 'req-1', authorization: 'Bearer SECRET', cookie: 'sid=abc' },
  body: { password: 'hunter2' },
  cookies: { sid: 'abc' },
  user: { sub: 'u-9', email: 'a@b.c' },
};

function makeFilter(service: CrashLensService) {
  const filter = new CrashLensFilter(service);
  (filter as any).applicationRef = {
    reply: vi.fn(),
    isHeadersSent: () => false,
    end: vi.fn(),
    setHeader: vi.fn(),
  };
  return filter;
}

describe('CrashLensFilter', () => {
  it('não captura HttpException 404 (abaixo de captureStatus)', () => {
    const { service, events } = setup();
    makeFilter(service).catch(new NotFoundException(), makeHost(req));
    expect(events).toHaveLength(0);
  });

  it('captura erro 500/Error exatamente uma vez', () => {
    const { service, events } = setup();
    const filter = makeFilter(service);
    filter.catch(new Error('boom'), makeHost(req));
    filter.catch(new InternalServerErrorException('x'), makeHost(req));
    expect(events).toHaveLength(2);
    expect(events[0].exceptionMessage).toBe('boom');
  });

  it('respeita captureStatus customizado', () => {
    const { service, events } = setup({ captureStatus: (s: number) => s >= 400 });
    makeFilter(service).catch(new NotFoundException(), makeHost(req));
    expect(events).toHaveLength(1);
  });

  it('o interceptor não captura (só breadcrumb) e junto com o filtro não duplica', async () => {
    const { service, events } = setup();
    const interceptor = new CrashLensInterceptor(service);
    const ctx: any = { getType: () => 'http', switchToHttp: () => ({ getRequest: () => req }) };
    const err = new Error('boom');
    await expect(
      lastValueFrom(interceptor.intercept(ctx, { handle: () => throwError(() => err) })),
    ).rejects.toBe(err);
    expect(events).toHaveLength(0);
    await lastValueFrom(interceptor.intercept(ctx, { handle: () => of(1) }));
    makeFilter(service).catch(err, makeHost(req));
    expect(events).toHaveLength(1);
  });
});

describe('request context', () => {
  it('inclui método, rota, request id e usuário; sem body/cookies/authorization', () => {
    const { service, events } = setup();
    service.captureHttpException(new Error('boom'), makeHost(req));
    const e = events[0];
    expect(e.tags.httpMethod).toBe('POST');
    expect(e.tags.route).toBe('/users/:id');
    expect(e.tags.requestId).toBe('req-1');
    expect(e.url).toBe('/users/42');
    expect(e.user).toEqual({ id: 'u-9', email: 'a@b.c' });
    const json = JSON.stringify(e.toJson());
    expect(json).not.toMatch(/hunter2|SECRET|sid=abc|token=secret/i);
  });

  it('usa req.requestId e resolveUser customizado; fallback de rota é o path sem query', () => {
    const { service, events } = setup({ resolveUser: () => ({ id: 7, username: 'bob' }) });
    service.captureHttpException(
      new Error('x'),
      makeHost({ method: 'GET', url: '/a/b?x=1', headers: {}, requestId: 'r-2' }),
    );
    const e = events[0];
    expect(e.tags.route).toBe('/a/b');
    expect(e.tags.requestId).toBe('r-2');
    expect(e.user).toEqual({ id: '7', username: 'bob' });
  });
});

describe('captureHttpException', () => {
  it('aplica o filtro de status e nunca lança', () => {
    const { service, events } = setup({
      resolveUser: () => {
        throw new Error('resolver quebrou');
      },
    });
    expect(() => service.captureHttpException(new HttpException('x', 400), makeHost(req))).not.toThrow();
    expect(events).toHaveLength(0);
    expect(() => service.captureHttpException(new Error('boom'), makeHost(req))).not.toThrow();
    expect(events).toHaveLength(1);
    expect(events[0].user).toBeUndefined();
    expect(() => service.captureHttpException(new Error('boom'), {} as any)).not.toThrow();
  });
});

describe('defaults e escopo', () => {
  it('release/environment vêm das variáveis de ambiente', () => {
    process.env.CRASHLENS_RELEASE = 'v9';
    process.env.CRASHLENS_ENVIRONMENT = 'staging';
    try {
      const { service, events } = setup();
      service.captureHttpException(new Error('boom'), makeHost(req));
      expect(events[0].release).toBe('v9');
      expect(events[0].environment).toBe('staging');
    } finally {
      delete process.env.CRASHLENS_RELEASE;
      delete process.env.CRASHLENS_ENVIRONMENT;
    }
  });

  it('usuário setado dentro de runWithScope não vaza', () => {
    const { service, events } = setup();
    runWithScope(() => {
      service.setUser({ id: 'scoped' });
      service.captureMessage('in');
    });
    service.captureMessage('out');
    expect(events[0].user?.id).toBe('scoped');
    expect(events[1].user).toBeUndefined();
  });
});
