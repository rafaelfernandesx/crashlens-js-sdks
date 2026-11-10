import { AsyncLocalStorage } from 'node:async_hooks';
import type { Scope, ScopeProvider } from '@crashlensorg/core';

interface ScopeStore {
  parent?: ScopeStore;
  scope?: Scope;
}

const storage = new AsyncLocalStorage<ScopeStore>();

/** Resolve (clonando preguiçosamente a partir do pai/global) o escopo de um store. */
function resolve(store: ScopeStore, globalScope: Scope): Scope {
  if (!store.scope) {
    const base = store.parent ? resolve(store.parent, globalScope) : globalScope;
    store.scope = base.clone();
  }
  return store.scope;
}

/**
 * Provedor de escopo baseado em AsyncLocalStorage: dentro de `runWithScope` devolve o
 * escopo isolado; fora dele devolve o escopo global.
 */
export const asyncLocalScopeProvider: ScopeProvider = {
  getScope(globalScope: Scope): Scope {
    const store = storage.getStore();
    return store ? resolve(store, globalScope) : globalScope;
  },
};

/**
 * Executa `fn` com um escopo isolado, clonado do escopo global (ou do escopo isolado pai).
 * Dentro dele setUser/setTag/setExtra/addBreadcrumb afetam apenas esse escopo e as
 * capturas leem o escopo corrente. Fora de qualquer escopo isolado, o comportamento é o global.
 */
export function runWithScope<T>(fn: () => T): T {
  return storage.run({ parent: storage.getStore() }, fn);
}

/** Alias de `runWithScope`. */
export const withIsolationScope = runWithScope;
