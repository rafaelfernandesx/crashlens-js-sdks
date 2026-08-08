import { CrashLens } from '@crashlens/core';

interface XhrMeta {
  method?: string;
  url?: string;
}

const xhrMeta = new WeakMap<XMLHttpRequest, XhrMeta>();

/** Instrumenta fetch e XMLHttpRequest para adicionar breadcrumbs de rede. */
export function instrumentHttpBreadcrumbs(client: CrashLens): () => void {
  const addRequest = (method: string, url: string, status?: number) => {
    client.addBreadcrumb({
      message: `${method} ${url}`,
      type: 'request',
      category: 'http',
      data: { status, url },
    });
  };

  // ── fetch ──
  const originalFetch = window.fetch.bind(window);
  const wrappedFetch: typeof fetch = (input, init) => {
    let method = init?.method ?? 'GET';
    let url: string;
    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof URL) {
      url = input.toString();
    } else {
      url = input.url;
      method = input.method ?? method;
    }
    const promise = originalFetch(input, init);
    promise
      .then((res) => {
        addRequest(method, url, res.status);
        return res;
      })
      .catch(() => addRequest(method, url));
    return promise;
  };
  window.fetch = wrappedFetch;

  // ── XMLHttpRequest ──
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string,
  ): void {
    xhrMeta.set(this, { method, url });
    originalOpen.call(this, method, url, true);
  };

  XMLHttpRequest.prototype.send = function (
    this: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    this.addEventListener('loadend', () => {
      const meta = xhrMeta.get(this);
      if (meta) addRequest(meta.method ?? 'GET', meta.url ?? '', this.status);
    });
    originalSend.call(this, body);
  };

  return () => {
    window.fetch = originalFetch;
    XMLHttpRequest.prototype.open = originalOpen;
    XMLHttpRequest.prototype.send = originalSend;
  };
}