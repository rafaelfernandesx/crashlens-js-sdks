# CrashLens JS / TS SDKs

SDKs oficiais de monitoramento de erros para JavaScript e TypeScript, publicados no npm sob o escopo **`@crashlensorg`**.

## 📦 Pacotes

| Pacote | Descrição | Depende de |
| --- | --- | --- |
| [`@crashlensorg/core`](packages/core) | Núcleo compartilhado: tipos, transporte, fila, escopo e sessões | — |
| [`@crashlensorg/node`](packages/node) | SDK para Node.js: `uncaughtException`, `unhandledRejection`, middleware HTTP e contexto de requisição | `core` |
| [`@crashlensorg/browser`](packages/browser) | SDK para browser: `window.onerror`, `unhandledrejection`, fetch/XHR, breadcrumbs e info de dispositivo web | `core` |
| [`@crashlensorg/react`](packages/react) | Integração com React: `ErrorBoundary`, `withErrorBoundary`, `useErrorHandler` e `CrashLensProvider` | `browser` |
| [`@crashlensorg/nestjs`](packages/nestjs) | Integração com NestJS: módulo, filtro global de exceções e interceptor HTTP | `node` |
| [`@crashlensorg/nextjs`](packages/nextjs) | Integração com Next.js: instrumentação server/client, error boundaries e API routes | `node`, `react` |

> **Atenção:** os pacotes referenciam as dependências internas com **versões exatas** (ex.: `"@crashlensorg/core": "0.1.0"`). Por isso, a ordem de publicação **importa** — sempre publique as dependências antes dos dependentes.

---

## 🚀 Começando

A instalação depende do pacote que você quer usar:

```bash
# Node.js
npm install @crashlensorg/node

# Browser / React
npm install @crashlensorg/browser          # só browser
npm install @crashlensorg/react            # browser + React

# NestJS
npm install @crashlensorg/nestjs

# Next.js
npm install @crashlensorg/nextjs
```

### Node.js

```ts
import { initNode } from '@crashlensorg/node';

const crashlens = initNode({
  apiKey: 'cl_live_xxxxxxxx',
  baseUrl: 'https://apicrashlens.laziv.com/api',
  environment: 'production',
});

// captura automática de uncaughtException / unhandledRejection
```

### React (browser)

```tsx
import { CrashLensProvider, ErrorBoundary } from '@crashlensorg/react';

<CrashLensProvider apiKey="cl_live_xxxxxxxx" baseUrl="https://apicrashlens.laziv.com/api">
  <ErrorBoundary fallback={<h1>Erro</h1>}>
    <App />
  </ErrorBoundary>
</CrashLensProvider>
```

### NestJS

```ts
import { Module } from '@nestjs/common';
import { CrashLensModule } from '@crashlensorg/nestjs';

@Module({
  imports: [
    CrashLensModule.forRoot({
      apiKey: 'cl_live_xxxxxxxx',
      baseUrl: 'https://apicrashlens.laziv.com/api',
      globalFilter: true,
      globalInterceptor: true,
    }),
  ],
})
export class AppModule {}
```

**Opções (`CrashLensModule.forRoot`)**

| Opção | Padrão | Descrição |
| --- | --- | --- |
| `captureStatus` | `status >= 500` | `(status) => boolean`. HttpExceptions cujo status não passa **não** são capturadas (400/401/403/404 ficam de fora). Erros que não são `HttpException` contam como 500. |
| `resolveUser` | `req.user.id / userId / sub` | `(req) => { id, email?, username? } \| null`. Usuário anexado aos eventos. |
| `release` | `CRASHLENS_RELEASE`, depois `GIT_SHA` | |
| `environment` | `CRASHLENS_ENVIRONMENT`, depois `NODE_ENV` | |
| `enableGlobalHandlers` | `true` | `uncaughtException` / `unhandledRejection`. |
| `isolateRequestScope` | `true` | Cada request HTTP roda num escopo isolado (middleware registrado para todas as rotas). |

Cada evento capturado leva método, **padrão da rota** (ex.: `/users/:id`), request id (`x-request-id` ou `req.requestId`) e o usuário. Body, cookies e `Authorization` nunca são enviados.

Só o **filtro** captura erros; o `CrashLensInterceptor` apenas adiciona o breadcrumb HTTP. Usando o interceptor sem o filtro, nada é enviado.

**Já tem um filtro global próprio?** Desligue o filtro do módulo e chame o helper dentro do seu `catch()` (mesmo filtro de status e mesmo contexto de request; nunca lança):

```ts
CrashLensModule.forRoot({ apiKey: '...', globalFilter: false });

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly crashLens: CrashLensService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    this.crashLens.captureHttpException(exception, host);
    // ... sua resposta de erro atual
  }
}
```

### Next.js

```ts
// instrumentation.ts
export async function register() {
  const { initNextServer } = await import('@crashlensorg/nextjs/server');
  initNextServer({ apiKey: process.env.NEXT_PUBLIC_CRASHLENS_API_KEY });
}
```

```tsx
// app/layout.tsx
import { CrashLensProvider } from '@crashlensorg/nextjs/browser';
// <CrashLensProvider apiKey="...">…</CrashLensProvider>
```

```ts
// instrumentation.ts — erros de render/route handlers/server actions (Next 15/16)
export async function register() {
  const { initNextServer } = await import('@crashlensorg/nextjs/server');
  initNextServer({ apiKey: process.env.CRASHLENS_API_KEY! });
}

export { captureRequestError as onRequestError } from '@crashlensorg/nextjs/server';
```

`captureRequestError` envia tags `routePath`, `routeType`, `routerKind`, o método e o path (sem query); headers nunca, exceto o `x-request-id` se existir.

```tsx
// app/global-error.tsx (ou error.tsx)
'use client';
import { useEffect } from 'react';
import { captureBoundaryError } from '@crashlensorg/nextjs/browser';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => captureBoundaryError(error), [error]); // registra também error.digest
  return <html><body><h1>Algo deu errado</h1></body></html>;
}
```

Variáveis de ambiente: `release` ← `CRASHLENS_RELEASE` / `NEXT_PUBLIC_CRASHLENS_RELEASE`; `environment` ← `CRASHLENS_ENVIRONMENT` / `NEXT_PUBLIC_CRASHLENS_ENVIRONMENT`, depois `NODE_ENV`.

### Agrupamento (fingerprint) e escopo por request

- O SDK **não envia mais fingerprint automático**: o servidor agrupa pelo tipo da exceção + frames do app. Passe `fingerprint: 'minha-chave'` em `captureException/captureMessage/captureEvent` apenas para um agrupamento customizado. (`computeEventHash` continua exportado, mas está *deprecated*.)
- No Node, `runWithScope(fn)` / `withIsolationScope(fn)` (de `@crashlensorg/node`) roda `fn` com um escopo clonado do global, via `AsyncLocalStorage`: `setUser`, `setTag`, `setExtra` e `addBreadcrumb` afetam só esse escopo e as capturas leem o escopo corrente. `crashlensMiddleware` e o módulo NestJS já fazem isso por request. Fora de um escopo isolado, o escopo continua global. O browser mantém o escopo global.

---

## 🛠️ Desenvolvimento

O monorepo usa **npm workspaces**. Rode os comandos a partir da raiz (`js-sdks/`).

| Comando | Descrição |
| --- | --- |
| `npm install` | Instala as dependências de todos os pacotes |
| `npm run build` | Compila todos os pacotes (CJS + ESM + tipos) com `tsup` |
| `npm run test` | Executa os testes com `vitest` |
| `npm run typecheck` | Roda `tsc --noEmit` em todos os pacotes |

> **⚠️ Ordem de build:** `npm run build` descoberta os workspaces em ordem. Se o DTS de `nestjs`/`nextjs` falhar, é porque `node` ainda não tinha sido compilado. Nesse caso, builda explicitamente em ordem:
>
> ```bash
> npm run build -w @crashlensorg/core
> npm run build -w @crashlensorg/node
> npm run build -w @crashlensorg/browser
> npm run build -w @crashlensorg/react
> npm run build -w @crashlensorg/nestjs
> npm run build -w @crashlensorg/nextjs
> ```

Cada pacote gera `dist/` com:

- `index.js` — CommonJS
- `index.mjs` — ESM
- `index.d.ts` / `index.d.mts` — tipos TypeScript

O `files` de cada `package.json` é `["dist"]`, então **apenas** o conteúdo de `dist/` é publicado.

---

## 📦 Publicando no npm

### Pré-requisitos

1. **Login** no npm:
   ```bash
   npm login
   ```
2. Confirme quem está logado:
   ```bash
   npm whoami
   ```
   > ⚠️ Você precisa ser membro da organização **`crashlensorg`** no npm para publicar no escopo `@crashlensorg`.

3. **Build** todos os pacotes antes de publicar:
   ```bash
   npm run build
   ```

### Publicação inicial (primeira vez)

Os pacotes já vêm com `"publishConfig": { "access": "public" }` em cada `package.json`, então a primeira publicação do escopo usa `--access public`:

```bash
# 1. core (não depende de ninguém)
npm publish -w @crashlensorg/core --access public

# 2. node e browser (dependem só do core)
npm publish -w @crashlensorg/node --access public
npm publish -w @crashlensorg/browser --access public

# 3. react (depende do browser)
npm publish -w @crashlensorg/react --access public

# 4. nestjs (depende do node)
npm publish -w @crashlensorg/nestjs --access public

# 5. nextjs (depende de node + react)
npm publish -w @crashlensorg/nextjs --access public
```

> **⚠️ Ordem é obrigatória:** como as dependências internas usam versões exatas, publicar um dependente antes da dependência quebra a instalação de quem consumir.

### Publicando uma nova versão (atualização)

1. **Bump de versão** nos pacotes afetados:
   ```bash
   # patch (0.1.0 → 0.1.1)
   npm version patch -w @crashlensorg/core

   # minor (0.1.0 → 0.2.0)
   npm version minor -w @crashlensorg/core

   # major (0.1.0 → 1.0.0)
   npm version major -w @crashlensorg/core
   ```

2. Se o pacote em questão é uma **dependência interna** (ex.: `core`), **atualize a versão exata** nos `package.json` dos dependentes e faça o bump deles também:
   ```bash
   # ex.: core subiu para 0.1.1 → atualize node/browser/react... e bumpeie-os
   npm version patch -w @crashlensorg/node -w @crashlensorg/browser
   ```

3. **Build** e **publique na ordem**:
   ```bash
   npm run build
   npm publish -w @crashlensorg/core
   npm publish -w @crashlensorg/node
   npm publish -w @crashlensorg/browser
   npm publish -w @crashlensorg/react
   npm publish -w @crashlensorg/nestjs
   npm publish -w @crashlensorg/nextjs
   ```

### Publicando prerelease (beta/rc)

```bash
# em cada pacote, ajuste a versão e o dist-tag
npm version 0.2.0-beta.0 -w @crashlensorg/core
npm publish -w @crashlensorg/core --tag beta
```

### Verificando o que foi publicado

```bash
npm view @crashlensorg/core version
npm view @crashlensorg/core versions
npm view @crashlensorg/core dist-tags
```

---

## 📁 Estrutura

```
js-sdks/
├── package.json            # workspaces raiz
├── package-lock.json
├── README.md
└── packages/
    ├── core/               # @crashlensorg/core
    ├── node/               # @crashlensorg/node
    ├── browser/            # @crashlensorg/browser
    ├── react/              # @crashlensorg/react
    ├── nestjs/             # @crashlensorg/nestjs
    └── nextjs/             # @crashlensorg/nextjs
```

## 📄 Licença

MIT