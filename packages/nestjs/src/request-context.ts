import type { CrashLensUser } from '@crashlensorg/node';

/** Usuário retornado por `resolveUser`. */
export interface ResolvedUser {
  id: string | number;
  email?: string;
  username?: string;
}

export interface HttpRequestContext {
  method?: string;
  /** Padrão da rota (ex.: "/users/:id"), ou o path sem query string como fallback. */
  route?: string;
  /** Path real da requisição, sem query string. */
  path?: string;
  requestId?: string;
}

function stripQuery(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  const i = url.search(/[?#]/);
  return i === -1 ? url : url.slice(0, i);
}

function firstHeader(value: unknown): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' && v ? v : undefined;
}

/** Extrai método, padrão da rota e request id. Nunca lê body, cookies nem Authorization. */
export function getHttpRequestContext(req: any): HttpRequestContext {
  if (!req) return {};
  const path = stripQuery(req.originalUrl ?? req.url);
  let route: string | undefined;
  const expressRoute = req.route?.path;
  if (typeof expressRoute === 'string') {
    route = `${req.baseUrl ?? ''}${expressRoute}`;
  } else {
    // Fastify
    const fastifyRoute = req.routeOptions?.url ?? req.routerPath;
    route = typeof fastifyRoute === 'string' ? fastifyRoute : path;
  }
  return {
    method: req.method,
    route,
    path,
    requestId: firstHeader(req.headers?.['x-request-id']) ?? (req.requestId ? String(req.requestId) : undefined),
  };
}

/** Resolução padrão do usuário: `req.user` com `id`, `userId` ou `sub`. */
export function defaultResolveUser(req: any): ResolvedUser | null {
  const u = req?.user;
  if (!u || typeof u !== 'object') return null;
  const id = u.id ?? u.userId ?? u.sub;
  if (id === undefined || id === null || id === '') return null;
  return { id, email: u.email, username: u.username };
}

export function toCrashLensUser(user: ResolvedUser | null | undefined): CrashLensUser | undefined {
  if (!user || user.id === undefined || user.id === null) return undefined;
  const out: CrashLensUser = { id: String(user.id) };
  if (user.email) out.email = user.email;
  if (user.username) out.username = user.username;
  return out;
}
