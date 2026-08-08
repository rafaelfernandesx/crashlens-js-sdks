import type { Breadcrumb, CrashLensUser } from './types';
import { uuidv4 } from './utils/nanoid';

export interface ScopeOptions {
  maxBreadcrumbs?: number;
  user?: CrashLensUser;
  tags?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

/**
 * Escopo global: usuário, tags, extra e breadcrumbs que acompanham todos os eventos.
 * Espelha o escopo do SDK Flutter (setUser, setTag, addBreadcrumb).
 */
export class Scope {
  maxBreadcrumbs: number;
  private _user?: CrashLensUser;
  private _tags: Record<string, unknown> = {};
  private _extra: Record<string, unknown> = {};
  private _breadcrumbs: Breadcrumb[] = [];
  private _sessionId?: string;

  constructor(opts: ScopeOptions = {}) {
    this.maxBreadcrumbs = opts.maxBreadcrumbs ?? 100;
    this._user = opts.user;
    this._tags = opts.tags ?? {};
    this._extra = opts.extra ?? {};
  }

  get user(): CrashLensUser | undefined {
    return this._user;
  }

  get tags(): Record<string, unknown> {
    return this._tags;
  }

  get extra(): Record<string, unknown> {
    return this._extra;
  }

  get breadcrumbs(): Breadcrumb[] {
    return this._breadcrumbs;
  }

  get sessionId(): string | undefined {
    return this._sessionId;
  }

  setUser(user: CrashLensUser | null): void {
    this._user = user ?? undefined;
  }

  setTag(key: string, value: unknown): void {
    this._tags[key] = value;
  }

  removeTag(key: string): void {
    delete this._tags[key];
  }

  setTags(tags: Record<string, unknown>): void {
    this._tags = { ...tags };
  }

  setExtra(key: string, value: unknown): void {
    this._extra[key] = value;
  }

  setSessionId(sessionId: string | undefined): void {
    this._sessionId = sessionId;
  }

  addBreadcrumb(breadcrumb: Breadcrumb): void {
    const normalized: Breadcrumb = {
      message: breadcrumb.message,
      type: breadcrumb.type ?? 'custom',
      category: breadcrumb.category,
      data: breadcrumb.data,
      timestamp: breadcrumb.timestamp ?? new Date().toISOString(),
    };
    this._breadcrumbs.push(normalized);
    if (this._breadcrumbs.length > this.maxBreadcrumbs) {
      this._breadcrumbs.splice(0, this._breadcrumbs.length - this.maxBreadcrumbs);
    }
  }

  clearBreadcrumbs(): void {
    this._breadcrumbs = [];
  }
}

/** Gera um ID de sessão único. */
export function newSessionId(): string {
  return uuidv4();
}