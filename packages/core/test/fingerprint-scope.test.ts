import { describe, it, expect } from 'vitest';
import { CrashLens } from '../src/client/crashlens';
import { Scope } from '../src/scope';
import type { CrashLensEvent } from '../src/event';

function makeClient(extra: Record<string, unknown> = {}) {
  const events: CrashLensEvent[] = [];
  const client = new CrashLens({
    apiKey: 'k',
    beforeSend: (e) => {
      events.push(e);
      return e;
    },
    ...extra,
  });
  return { client, events };
}

describe('fingerprint', () => {
  it('não envia fingerprint automático', () => {
    const { client, events } = makeClient();
    client.captureException(new Error('boom'));
    client.captureMessage('hello');
    client.captureEvent({ message: 'x' });
    expect(events).toHaveLength(3);
    for (const e of events) {
      expect(e.fingerprint).toBeUndefined();
      expect('fingerprint' in e.toJson()).toBe(false);
    }
  });

  it('repassa fingerprint explícito', () => {
    const { client, events } = makeClient();
    client.captureException(new Error('boom'), { fingerprint: 'custom-group' });
    client.captureMessage('m', { fingerprint: 'g2' });
    client.captureEvent({ message: 'x', fingerprint: 'g3' });
    expect(events.map((e) => e.toJson().fingerprint)).toEqual(['custom-group', 'g2', 'g3']);
  });
});

describe('scope provider', () => {
  it('usa o escopo do provider quando fornecido', () => {
    const custom = new Scope();
    const { client, events } = makeClient({ scopeProvider: { getScope: () => custom } });
    client.setTag('a', 1);
    client.setUser({ id: 'u1' });
    client.addBreadcrumb({ message: 'b' });
    client.captureMessage('m');
    expect(custom.tags.a).toBe(1);
    expect(events[0].user?.id).toBe('u1');
    expect(events[0].breadcrumbs).toHaveLength(1);
  });

  it('Scope.clone é independente do original', () => {
    const s = new Scope();
    s.setTag('a', 1);
    s.addBreadcrumb({ message: 'x' });
    const c = s.clone();
    c.setTag('b', 2);
    c.addBreadcrumb({ message: 'y' });
    expect(s.tags).toEqual({ a: 1 });
    expect(s.breadcrumbs).toHaveLength(1);
    expect(c.breadcrumbs).toHaveLength(2);
  });
});
