# API de Logística e Entregas

API REST backend para gestão de pedidos de entrega, motoristas, veículos e ocorrências, com fluxo de estados, autorização por papel e propriedade dos recursos, upload de comprovante e integração externa de CEP.

**Stack:** NestJS 12 · TypeScript · PostgreSQL · Prisma 7.10.0 (`prisma.config.ts`, driver adapter `pg`, migrations) · JWT · class-validator · Helmet · Compression · Swagger/OpenAPI · Vitest + Supertest.

## Sumário

1. [Requisitos](#1-requisitos)
2. [Instalação e execução](#2-instalação-e-execução)
3. [Variáveis de ambiente](#3-variáveis-de-ambiente)
4. [Scripts](#4-scripts)
5. [Arquitetura](#5-arquitetura)
6. [Modelo de dados](#6-modelo-de-dados)
7. [Fluxo de estados](#7-fluxo-de-estados)
8. [Perfis e matriz de permissões](#8-perfis-e-matriz-de-permissões)
9. [Regras de negócio](#9-regras-de-negócio)
10. [Convenções da API](#10-convenções-da-api)
11. [Endpoints](#11-endpoints)
12. [Exemplos de requisição](#12-exemplos-de-requisição)
13. [Upload de comprovante](#13-upload-de-comprovante)
14. [Integração externa (CEP)](#14-integração-externa-cep)
15. [Interceptor](#15-interceptor)
16. [Segurança e performance](#16-segurança-e-performance)
17. [Testes](#17-testes)
18. [Decisões de projeto](#18-decisões-de-projeto)

---

## 1. Requisitos

- Node.js 20.19+ (desenvolvido em Node 24)
- PostgreSQL 14+ (desenvolvido em PostgreSQL 18)
- Acesso à internet para a API de CEP (ou um mock, veja [seção 14](#14-integração-externa-cep))

## 2. Instalação e execução

```bash
# 1. Dependências (o postinstall já executa `prisma generate`)
npm install

# 2. Configuração: copie o modelo e edite DATABASE_URL (senha do seu PostgreSQL), JWT_SECRET e API_KEY
cp .env.example .env

# 3. Migrations (cria o banco se não existir e aplica as tabelas)
npx prisma migrate deploy        # ambiente/produção
# ou: npm run prisma:migrate     # desenvolvimento (migrate dev)

# 4. (Opcional) Dados de demonstração: 1 admin, 1 operador, 2 motoristas, 1 cliente, 3 veículos
npm run seed

# 5. Execução
npm run start:dev                # desenvolvimento, com watch
# ou, produção:
npm run build && npm run start:prod
```

A API sobe em `http://localhost:3000` (configurável em `PORT`). **Toda requisição, inclusive `GET /health`, exige o cabeçalho `X-API-KEY`** — veja a [seção 3.1](#31-x-api-key-uma-camada-extra-de-acesso). Verifique com:

```bash
curl -s http://localhost:3000/health -H "X-API-KEY: <valor de API_KEY no seu .env>"
```

**Documentação interativa (Swagger):** `http://localhost:3000/docs` — essa página é a única exceção que não exige `X-API-KEY` (é só a descrição da API, sem dado nenhum). Clique em **Authorize** e informe a `X-API-KEY` e, depois de um login em `POST /auth/login`, o token JWT — daí dá para testar qualquer endpoint direto pela página. O JSON puro (OpenAPI 3) fica em `/docs-json`.

> No PowerShell use `Copy-Item .env.example .env` no lugar do `cp`.

**Gerar um `JWT_SECRET` ou `API_KEY` fortes** (mesmo comando para os dois; gere um valor diferente para cada):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Usuários criados pelo seed** (senha `Senha@1234`, ou o valor de `SEED_PASSWORD`):

| Papel | E-mail |
|---|---|
| ADMIN | `admin@logistica.local` |
| OPERATOR | `operador@logistica.local` |
| DRIVER (CNH B) | `motorista@logistica.local` |
| DRIVER (CNH A) | `moto@logistica.local` |
| CUSTOMER | `cliente@logistica.local` |

> O primeiro ADMIN não pode ser criado pela própria API (seria uma brecha de segurança), por isso existe o seed. Em produção o seed exige `SEED_PASSWORD`.

## 3. Variáveis de ambiente

Validadas na inicialização: se alguma faltar ou for inválida, a aplicação **não sobe** e lista todos os problemas.

| Variável | Obrigatória | Padrão | Descrição |
|---|:-:|---|---|
| `NODE_ENV` | não | `development` | `development`, `test` ou `production` |
| `PORT` | não | `3000` | Porta HTTP |
| `DATABASE_URL` | **sim** | — | `postgresql://usuario:senha@host:5432/banco?schema=public` |
| `JWT_SECRET` | **sim** | — | Segredo de assinatura do JWT, **mínimo 32 caracteres** |
| `JWT_EXPIRES_IN` | não | `1h` | Validade do token (`15m`, `1h`, `7d`…) |
| `API_KEY` | **sim** | — | Chave exigida no cabeçalho `X-API-KEY` em **todas** as rotas, **mínimo 20 caracteres** |
| `UPLOAD_DIR` | não | `uploads` | Pasta base dos comprovantes |
| `UPLOAD_MAX_SIZE_BYTES` | não | `5242880` (5 MB) | Tamanho máximo do upload |
| `CEP_API_BASE_URL` | **sim** | — | Base da API de CEP (com `http://` ou `https://`) |
| `CEP_API_TIMEOUT_MS` | não | `5000` | Timeout da consulta de CEP |
| `SEED_PASSWORD` | não | `Senha@1234` (só em dev) | Senha dos usuários do seed |

O arquivo `.env` **não é versionado** (está no `.gitignore`); apenas `.env.example`.

### 3.1 `X-API-KEY`: uma camada extra de acesso

Além do JWT (que identifica o **usuário**), a API exige em **toda** requisição — inclusive `GET /health`, `POST /auth/register` e `POST /auth/login` — o cabeçalho:

```
X-API-KEY: <valor de API_KEY no .env>
```

Ele identifica o **cliente/serviço** que está chamando a API, independente de haver um usuário logado. É uma segunda camada, aplicada **antes** de qualquer verificação de JWT ou papel:

| Cabeçalho enviado | Resultado |
|---|---|
| Sem `X-API-KEY` | `401` — mesmo em rota pública |
| `X-API-KEY` errada | `401` |
| `X-API-KEY` correta, sem token | `401` (agora pela falta do JWT) |
| `X-API-KEY` e token corretos | segue normalmente |

Sem essa chave, ninguém fora dos clientes autorizados consegue sequer testar credenciais de usuário na API. Todos os exemplos deste README e o `curl` de todo endpoint devem incluir `-H "X-API-KEY: <sua chave>"` junto com o `Authorization: Bearer`.

## 4. Scripts

| Comando | O que faz |
|---|---|
| `npm run build` | `prisma generate` + compilação NestJS para `dist/` |
| `npm run start:dev` | Sobe com recarga automática |
| `npm run start:prod` | Executa `dist/main` |
| `npm run seed` | Popula dados de demonstração |
| `npm run prisma:migrate` | `prisma migrate dev` (cria/aplica migrations em dev) |
| `npm run prisma:deploy` | `prisma migrate deploy` (aplica migrations existentes) |
| `npm run prisma:studio` | Interface visual do banco |
| `npm test` | Testes unitários |
| `npm run test:e2e` | Testes de integração (banco de teste separado) |
| `npm run test:all` | Unitários + integração |
| `npm run lint` / `npm run format` | Lint (oxlint) / formatação (Prettier) |

## 5. Arquitetura

```
src/
├── main.ts / app.setup.ts       # bootstrap; Helmet e Compression
├── app.module.ts                # módulos + pipe, filtro e interceptor globais
├── config/                      # validação do .env (falha cedo)
├── prisma/                      # PrismaService (PrismaClient + adapter pg)
├── common/
│   ├── guards/                  # JwtAuthGuard (global), RolesGuard (global)
│   ├── decorators/              # @CurrentUser(), @Roles(), @Public()
│   ├── filters/                 # AllExceptionsFilter (formato único de erro)
│   ├── interceptors/            # LoggingInterceptor
│   └── dto/ utils/ types/       # paginação, transforms, hash de senha
├── auth/ users/ customers/ drivers/ vehicles/
├── orders/ deliveries/ occurrences/
└── cep/                         # integração externa via HttpService
prisma/
├── schema.prisma  migrations/  seed.ts
test/                            # testes de integração + helpers
```

**Ciclo de uma requisição:** middleware (Helmet, Compression) → `JwtAuthGuard` → `RolesGuard` → Interceptor → `ValidationPipe` (DTO) → controller → service → Prisma. Qualquer exceção passa pelo `AllExceptionsFilter`.

**Rotas privadas por padrão:** `JwtAuthGuard` e `RolesGuard` são globais. Uma rota só é pública se marcada com `@Public()` (apenas `/health`, `/auth/register` e `/auth/login`). Esquecer de proteger uma rota nova **não** a deixa aberta.

## 6. Modelo de dados

```mermaid
erDiagram
    User ||--o| Customer : "perfil 1-1"
    User ||--o| Driver : "perfil 1-1"
    Customer ||--o{ DeliveryOrder : "faz"
    DeliveryOrder ||--o{ Delivery : "tentativas"
    Driver ||--o{ Delivery : "executa"
    Vehicle ||--o{ Delivery : "usado em"
    User ||--o{ Delivery : "atribui"
    Delivery ||--o{ DeliveryStatusHistory : "histórico"
    Delivery ||--o{ Occurrence : "ocorrências"
    User ||--o{ DeliveryStatusHistory : "altera"
    User ||--o{ Occurrence : "registra"
```

| Entidade | Papel | Constraints principais |
|---|---|---|
| `User` | Identidade e papel de acesso | `email` único; `passwordHash` (bcrypt) |
| `Customer` | Perfil do cliente (1-1 com User) | `userId` único; `document` (CPF/CNPJ) único |
| `Driver` | Perfil do motorista (1-1 com User) | `userId` único; `licenseNumber` único; categoria e validade da CNH |
| `Vehicle` | Veículo da frota | `plate` única; `capacityKg` > 0 |
| `DeliveryOrder` | **A demanda**: o que levar, de onde e para onde | `weightKg` > 0; CEP com 8 dígitos |
| `Delivery` | **A execução**: motorista + veículo cumprindo um pedido | no máximo **1 entrega ativa** por pedido, por motorista e por veículo |
| `DeliveryStatusHistory` | Histórico append-only de mudanças de estado | — |
| `Occurrence` | Problema registrado durante uma entrega | — |

**Pedido × Entrega:** um pedido pode ter várias entregas (tentativas). Se a primeira falha, o pedido volta para `PENDING` e recebe uma nova entrega com outro motorista, sem perder o histórico da tentativa anterior.

**Integridade no banco** (além do código), na migration `20260921142205_init`:

- índices únicos **parciais** (`WHERE status IN ('ASSIGNED','PICKED_UP','IN_TRANSIT')`) garantem 1 entrega ativa por pedido/motorista/veículo, mesmo com requisições simultâneas;
- `CHECK`: entrega `DELIVERED` exige comprovante; estado final ⇔ `finishedAt` preenchido; peso e capacidade positivos; CEP com 8 dígitos.

## 7. Fluxo de estados

**Entrega:**

```mermaid
stateDiagram-v2
    [*] --> ASSIGNED
    ASSIGNED --> PICKED_UP
    PICKED_UP --> IN_TRANSIT
    IN_TRANSIT --> DELIVERED : exige comprovante
    ASSIGNED --> FAILED : exige ocorrência
    PICKED_UP --> FAILED
    IN_TRANSIT --> FAILED
    ASSIGNED --> CANCELLED
    PICKED_UP --> CANCELLED
    IN_TRANSIT --> CANCELLED
    DELIVERED --> [*]
    FAILED --> [*]
    CANCELLED --> [*]
```

**Sincronização do pedido:**

| Entrega passa a | Pedido passa a |
|---|---|
| `ASSIGNED`, `PICKED_UP` | `SCHEDULED` |
| `IN_TRANSIT` | `IN_TRANSIT` |
| `DELIVERED` | `DELIVERED` |
| `FAILED`, `CANCELLED` | `PENDING` (pode ser reatribuído) |

Um pedido `PENDING` também pode ser cancelado diretamente (`CANCELLED`).

**Quem executa cada transição:**

- **Motorista responsável:** `PICKED_UP`, `IN_TRANSIT`, `DELIVERED`, `FAILED`.
- **Operador/Administrador:** somente `CANCELLED`.
- Estados finais (`DELIVERED`, `FAILED`, `CANCELLED`) não aceitam nenhuma transição.

## 8. Perfis e matriz de permissões

Perfis: `CUSTOMER`, `DRIVER`, `OPERATOR`, `ADMIN`.

| Ação | CUSTOMER | DRIVER | OPERATOR | ADMIN |
|---|:-:|:-:|:-:|:-:|
| Registrar-se / login | ✅ | — | — | — |
| Criar usuários OPERATOR/ADMIN | ❌ | ❌ | ❌ | ✅ |
| Gerenciar usuários (listar, ativar/desativar) | ❌ | ❌ | ❌ | ✅ |
| CRUD de motoristas | ❌ | ❌ | ✅ | ✅ |
| CRUD de veículos | ❌ | ❌ | ✅ | ✅ |
| Listar/consultar clientes | ❌ | ❌ | ✅ | ✅ |
| Ver/editar o próprio perfil (`/me`) | ✅ | ✅ | — | — |
| Criar pedido | ✅ (só em seu nome) | ❌ | ✅ (para um cliente) | ✅ |
| Ver pedidos | só os **seus** | ❌ | todos | todos |
| Cancelar pedido | o seu, se `PENDING` | ❌ | ✅ | ✅ |
| Atribuir motorista/veículo (criar entrega) | ❌ | ❌ | ✅ | ✅ |
| Ver entregas, histórico e ocorrências | as do **seu pedido** | as **suas** | todas | todas |
| Avançar estado (`PICKED_UP`…`FAILED`) | ❌ | só se **responsável** | ❌ | ❌ |
| Cancelar entrega | ❌ | ❌ | ✅ | ✅ |
| Enviar comprovante | ❌ | só se **responsável** | ❌ | ❌ |
| Baixar comprovante | do seu pedido | o seu | ✅ | ✅ |
| Registrar ocorrência | ❌ | só se **responsável** | ✅ | ✅ |
| Consultar CEP | ✅ | ✅ | ✅ | ✅ |

**Duas camadas de proteção:**

1. **Papel** (`@Roles`, `RolesGuard`) → sem permissão para a operação = **403**.
2. **Propriedade** (o recurso é *seu*?) → checada no service usando o `id` do **token**, nunca um ID vindo da requisição. Recurso de terceiro devolve **404**, para não revelar que ele existe. É isso que impede manipular recursos alheios trocando IDs.

O papel do usuário é lido **do banco a cada requisição** (não do token): desativar um usuário ou trocar seu papel vale imediatamente.

## 9. Regras de negócio

**Atribuição** (`POST /deliveries`) retorna **409** com todos os motivos se:

- pedido não está `PENDING`;
- motorista inativo ou com **CNH vencida**;
- motorista ou veículo **já em entrega ativa**;
- veículo em `MAINTENANCE` ou `INACTIVE`;
- **categoria da CNH não habilita** o tipo do veículo (A → moto; B → carro/van; C, D, E → carro/van/caminhão);
- **peso do pedido** acima da capacidade do veículo.

Referências inexistentes (pedido, motorista, veículo) retornam **404**. A verificação e a criação ocorrem numa **transação**, e o índice parcial do banco garante a regra mesmo sob concorrência.

**Estado:** transição fora do fluxo = **409**. `DELIVERED` sem comprovante = **409**. `FAILED` sem ocorrência registrada = **409**. Alteração concorrente detectada por *update condicional* (`WHERE status = <estado lido>`) = **409**.

**Cadastros:** e-mail, documento, CNH e placa duplicados = **409**. Veículo com histórico de entregas não pode ser excluído (**409**; use `status: INACTIVE`); o mesmo vale para usuário, cliente e motorista com qualquer histórico de pedidos, entregas, mudanças de status ou ocorrências (**409**; desative com `active: false`), para não quebrar a trilha de auditoria. Excluir um usuário apaga junto o perfil de cliente/motorista, e o token dele passa a responder **401**. Motorista/veículo em entrega ativa não podem ser inativados. Um administrador não pode desativar nem excluir a própria conta.

## 10. Convenções da API

**Formato de erro** (todos os erros, sem exceção):

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "Motorista já possui uma entrega ativa",
  "path": "/deliveries",
  "timestamp": "2026-09-21T15:10:22.481Z"
}
```

Erros de validação (400) trazem `message` como **lista** de problemas.

| Código | Quando |
|---|---|
| **400** | Body/query/parâmetro inválido, campo desconhecido, UUID malformado, arquivo inválido |
| **401** | `X-API-KEY` ausente/errada; token ausente, inválido, expirado ou de usuário inexistente/desativado; credenciais erradas |
| **403** | Autenticado, mas o **papel** não permite a operação |
| **404** | Recurso inexistente **ou pertencente a outro usuário**; CEP inexistente |
| **409** | Conflito de regra de negócio, de estado ou de unicidade |
| **413** | Upload acima do limite configurado |
| **502** | Provedor de CEP indisponível ou com resposta inválida |
| **504** | Provedor de CEP excedeu o timeout |

**Paginação** (listas): `?page=1&limit=20&order=desc` (limit máx. 100; ordenação por data de criação).

```json
{ "data": [ ... ], "meta": { "total": 42, "page": 1, "limit": 20, "totalPages": 3 } }
```

**Autenticação:** cabeçalho `Authorization: Bearer <accessToken>` — presente em toda rota que não seja `/health`, `/auth/register` ou `/auth/login`. **Em conjunto** com o `X-API-KEY` da [seção 3.1](#31-x-api-key-uma-camada-extra-de-acesso), exigido literalmente em toda rota, sem exceção.

**Segurança de entrada:** campos não declarados no DTO são rejeitados com 400 (impede *mass assignment*, por exemplo enviar `"role": "ADMIN"` no cadastro).

## 11. Endpoints

> A lista abaixo também está disponível de forma interativa (com "Try it out") em `/docs`.

Legenda de acesso: **Público** = sem token · **Autenticado** = qualquer papel · demais = papéis listados.
Toda rota não pública responde **401** sem token válido, e **403** se o papel não é permitido; esses dois não são repetidos abaixo. **Todas** as rotas, incluindo as públicas, também exigem `X-API-KEY` válida (401 sem ela) — ver [seção 3.1](#31-x-api-key-uma-camada-extra-de-acesso).

### Saúde

| Método | URL | Acesso | Body | Respostas |
|---|---|---|---|---|
| GET | `/health` | Público | — | `200 {status:"ok", timestamp}` · `503` banco indisponível |

### Autenticação

| Método | URL | Acesso | Body | Respostas |
|---|---|---|---|---|
| POST | `/auth/register` | Público | `{name, email, password, document, phone}` | `201` usuário CUSTOMER + perfil · `400` · `409` e-mail ou documento já cadastrado |
| POST | `/auth/login` | Público | `{email, password}` | `200 {accessToken, tokenType:"Bearer", expiresIn, user:{id,name,email,role}}` · `400` · `401` credenciais inválidas |
| GET | `/auth/me` | Autenticado | — | `200` dados do usuário + perfil (customer/driver) |

Regras: `password` 8–72 caracteres com letras e números; `document` CPF (11) ou CNPJ (14) dígitos; `phone` 10–11 dígitos (máscaras são removidas).

### Usuários (administração)

| Método | URL | Acesso | Body / Query | Respostas |
|---|---|---|---|---|
| POST | `/users` | ADMIN | `{name, email, password, role: "OPERATOR"\|"ADMIN"}` | `201` · `400` · `409` e-mail duplicado |
| GET | `/users` | ADMIN | `?role&active&page&limit&order` | `200` lista paginada |
| GET | `/users/:id` | ADMIN | — | `200` · `400` UUID inválido · `404` |
| PATCH | `/users/:id` | ADMIN | `{name?, active?}` | `200` · `404` · `409` desativar a própria conta |
| DELETE | `/users/:id` | ADMIN | — | `204` (apaga também o perfil de cliente/motorista) · `404` · `409` a própria conta ou conta com histórico |

### Clientes

| Método | URL | Acesso | Body / Query | Respostas |
|---|---|---|---|---|
| GET | `/customers/me` | CUSTOMER | — | `200` perfil do token |
| PATCH | `/customers/me` | CUSTOMER | `{name?, phone?}` | `200` · `400` |
| GET | `/customers` | OPERATOR, ADMIN | `?page&limit&order` | `200` lista paginada |
| GET | `/customers/:id` | OPERATOR, ADMIN | — | `200` · `404` |
| GET | `/customers/:id/orders` | OPERATOR, ADMIN | `?status&page&limit&order` | `200` pedidos do cliente · `404` |
| DELETE | `/customers/:id` | OPERATOR, ADMIN | — | `204` (apaga o usuário junto) · `404` · `409` cliente com pedidos |

### Motoristas

| Método | URL | Acesso | Body / Query | Respostas |
|---|---|---|---|---|
| POST | `/drivers` | OPERATOR, ADMIN | `{name, email, password, licenseNumber, licenseCategory: A-E, licenseExpiresAt: "YYYY-MM-DD", phone}` | `201` (cria o User DRIVER junto) · `400` · `409` e-mail ou CNH duplicados |
| GET | `/drivers` | OPERATOR, ADMIN | `?active&licenseCategory&available&page&limit&order` | `200` (`available=true`: ativos, CNH válida e sem entrega ativa) |
| GET | `/drivers/me` | DRIVER | — | `200` |
| PATCH | `/drivers/me` | DRIVER | `{phone}` | `200` · `400` |
| GET | `/drivers/:id` | OPERATOR, ADMIN | — | `200` · `404` |
| PATCH | `/drivers/:id` | OPERATOR, ADMIN | `{phone?, licenseCategory?, licenseExpiresAt?, active?}` | `200` · `404` · `409` desativar motorista com entrega ativa |
| GET | `/drivers/:id/deliveries` | OPERATOR, ADMIN | `?status&page&limit&order` | `200` · `404` |
| DELETE | `/drivers/:id` | OPERATOR, ADMIN | — | `204` (apaga o usuário junto) · `404` · `409` motorista com entregas |

### Veículos

| Método | URL | Acesso | Body / Query | Respostas |
|---|---|---|---|---|
| POST | `/vehicles` | OPERATOR, ADMIN | `{plate, model, type: MOTORCYCLE\|CAR\|VAN\|TRUCK, capacityKg}` | `201` · `400` placa inválida · `409` placa duplicada |
| GET | `/vehicles` | OPERATOR, ADMIN | `?type&status&available&page&limit&order` | `200` (`available=true`: `AVAILABLE` e sem entrega ativa) |
| GET | `/vehicles/:id` | OPERATOR, ADMIN | — | `200` · `404` |
| PATCH | `/vehicles/:id` | OPERATOR, ADMIN | `{plate?, model?, type?, capacityKg?, status?: AVAILABLE\|MAINTENANCE\|INACTIVE}` | `200` · `404` · `409` |
| DELETE | `/vehicles/:id` | OPERATOR, ADMIN | — | `204` · `404` · `409` veículo com histórico |
| GET | `/vehicles/:id/deliveries` | OPERATOR, ADMIN | `?status&page&limit&order` | `200` · `404` |

Placa: `ABC1234` ou `ABC1D23` (normalizada para maiúsculas, sem hífen).

### Pedidos

| Método | URL | Acesso | Body / Query | Respostas |
|---|---|---|---|---|
| POST | `/orders` | CUSTOMER, OPERATOR, ADMIN | `{customerId?, description, weightKg, origin:{cep, number, complement?}, destination:{cep, number, complement?}}` | `201` com endereços resolvidos pelo CEP · `400` · `403` cliente em nome de outro · `404` cliente ou CEP inexistente · `502`/`504` falha do provedor de CEP |
| GET | `/orders` | CUSTOMER (só os seus), OPERATOR, ADMIN | `?status&customerId&page&limit&order` | `200` lista paginada |
| GET | `/orders/:id` | CUSTOMER (dono), OPERATOR, ADMIN | — | `200` · `404` (inclusive de terceiros) |
| GET | `/orders/:id/deliveries` | CUSTOMER (dono), OPERATOR, ADMIN | `?status&page&limit&order` | `200` tentativas de entrega do pedido · `404` |
| POST | `/orders/:id/cancel` | CUSTOMER (dono), OPERATOR, ADMIN | — | `201` pedido `CANCELLED` · `404` · `409` pedido não está `PENDING` |

`customerId` é obrigatório para OPERATOR/ADMIN e, para CUSTOMER, só pode ser o próprio (senão `403`). `weightKg` entre 0,01 e 100000. Origem e destino não podem ser idênticos.

### Entregas

| Método | URL | Acesso | Body / Query | Respostas |
|---|---|---|---|---|
| POST | `/deliveries` | OPERATOR, ADMIN | `{orderId, driverId, vehicleId}` | `201` entrega `ASSIGNED` · `400` · `404` referência inexistente · `409` atribuição incompatível (mensagem lista os motivos) |
| GET | `/deliveries` | Autenticado, escopo por papel | `?status&orderId&driverId&vehicleId&page&limit&order` | `200` (cliente: as do seu pedido; motorista: as suas; staff: todas) |
| GET | `/deliveries/:id` | Autenticado, com acesso | — | `200` · `404` |
| GET | `/deliveries/:id/history` | Autenticado, com acesso | — | `200 [{fromStatus, toStatus, note, createdAt, changedBy}]` em ordem cronológica |
| PATCH | `/deliveries/:id/status` | DRIVER (responsável), OPERATOR, ADMIN | `{status, note?}` | `200` · `400` · `403` alvo não permitido ao papel · `404` · `409` transição inválida / sem comprovante / sem ocorrência |
| POST | `/deliveries/:id/proof` | DRIVER (responsável) | `multipart/form-data`, campo `file` | `201` · `400` · `404` · `409` não está `IN_TRANSIT` · `413` |
| GET | `/deliveries/:id/proof` | Autenticado, com acesso | — | `200` arquivo (`Content-Type` real) · `404` sem comprovante |

O cliente recebe uma visão reduzida: motorista só com `id` e `name`, veículo só com placa/modelo/tipo, sem CNH, e-mail nem telefone.

### Ocorrências

| Método | URL | Acesso | Body | Respostas |
|---|---|---|---|---|
| POST | `/deliveries/:deliveryId/occurrences` | DRIVER (responsável), OPERATOR, ADMIN | `{type: RECIPIENT_ABSENT\|WRONG_ADDRESS\|DAMAGED_GOODS\|VEHICLE_BREAKDOWN\|OTHER, description: 3-500 caracteres}` | `201` · `400` · `404` · `409` entrega já finalizada |
| GET | `/deliveries/:deliveryId/occurrences` | Autenticado, com acesso | — | `200` lista cronológica |

### CEP

| Método | URL | Acesso | Respostas |
|---|---|---|---|
| GET | `/cep/:cep` | Autenticado | `200 {cep, street, neighborhood, city, state}` · `400` formato inválido · `404` CEP não encontrado · `502` provedor indisponível/inválido · `504` timeout |

## 12. Exemplos de requisição

Fluxo completo usando os usuários do seed. Em Bash/Git Bash (no PowerShell, use `curl.exe`). **`$KEY` (o `X-API-KEY`) vai em toda chamada, sem exceção** — inclusive nas que só têm o `Authorization`.

```bash
API=http://localhost:3000
KEY="<valor de API_KEY no seu .env>"

# Login (operador)
curl -s $API/auth/login -H "X-API-KEY: $KEY" -H "Content-Type: application/json" \
  -d '{"email":"operador@logistica.local","password":"Senha@1234"}'
# → {"accessToken":"eyJ...","tokenType":"Bearer","expiresIn":"1h","user":{...}}

OP="eyJ..."   # accessToken do operador
```

**1. Cliente se cadastra e cria um pedido** (endereços vêm da API de CEP):

```bash
curl -s $API/auth/register -H "X-API-KEY: $KEY" -H "Content-Type: application/json" -d '{
  "name":"Maria Silva","email":"maria@email.com","password":"Senha@1234",
  "document":"529.982.247-25","phone":"(11) 98888-7777"}'

CUSTOMER="eyJ..."   # login da Maria
curl -s $API/orders -H "X-API-KEY: $KEY" -H "Authorization: Bearer $CUSTOMER" -H "Content-Type: application/json" -d '{
  "description":"Notebook para reparo","weightKg":3.5,
  "origin":{"cep":"01310-100","number":"1000"},
  "destination":{"cep":"20040-020","number":"50","complement":"Sala 5"}}'
# → 201 {"id":"<orderId>","status":"PENDING","originStreet":"Avenida Paulista",...}
```

**2. Operador consulta quem está disponível e atribui a entrega:**

```bash
curl -s "$API/drivers?available=true" -H "X-API-KEY: $KEY" -H "Authorization: Bearer $OP"
curl -s "$API/vehicles?available=true" -H "X-API-KEY: $KEY" -H "Authorization: Bearer $OP"

curl -s $API/deliveries -H "X-API-KEY: $KEY" -H "Authorization: Bearer $OP" -H "Content-Type: application/json" \
  -d '{"orderId":"<orderId>","driverId":"<driverId>","vehicleId":"<vehicleId>"}'
# → 201 {"id":"<deliveryId>","status":"ASSIGNED",...}
```

**3. Motorista executa a entrega:**

```bash
DRIVER="eyJ..."   # login do motorista
for s in PICKED_UP IN_TRANSIT; do
  curl -s -X PATCH $API/deliveries/<deliveryId>/status \
    -H "X-API-KEY: $KEY" -H "Authorization: Bearer $DRIVER" -H "Content-Type: application/json" -d "{\"status\":\"$s\"}"
done

curl -s $API/deliveries/<deliveryId>/proof -H "X-API-KEY: $KEY" -H "Authorization: Bearer $DRIVER" \
  -F "file=@comprovante.png;type=image/png"
# → 201 {"...","proof":{"originalName":"comprovante.png","mimeType":"image/png","size":48213,...}}

curl -s -X PATCH $API/deliveries/<deliveryId>/status \
  -H "X-API-KEY: $KEY" -H "Authorization: Bearer $DRIVER" -H "Content-Type: application/json" \
  -d '{"status":"DELIVERED","note":"Entregue ao destinatário"}'
```

**4. Cliente acompanha e baixa o comprovante:**

```bash
curl -s $API/deliveries/<deliveryId>/history -H "X-API-KEY: $KEY" -H "Authorization: Bearer $CUSTOMER"
curl -s $API/deliveries/<deliveryId>/proof -H "X-API-KEY: $KEY" -H "Authorization: Bearer $CUSTOMER" -o comprovante-baixado.png
```

**Exemplos de erro:**

```bash
# 400 - body inválido
curl -s $API/auth/register -H "X-API-KEY: $KEY" -H "Content-Type: application/json" -d '{"email":"x","role":"ADMIN"}'
# → {"statusCode":400,"message":["property role should not exist","name must be ...", ...],...}

# 401 - sem a chave de API (nem chega a olhar para o token)
curl -s $API/orders
# → {"statusCode":401,"message":"Chave de API ausente ou inválida",...}

# 401 - com a chave, mas sem token
curl -s $API/orders -H "X-API-KEY: $KEY"
# → {"statusCode":401,"message":"Token ausente ou inválido",...}

# 403 - cliente tentando listar veículos
curl -s $API/vehicles -H "X-API-KEY: $KEY" -H "Authorization: Bearer $CUSTOMER"
# → {"statusCode":403,"message":"Seu perfil não tem permissão para esta operação",...}

# 404 - pedido de outro cliente
curl -s $API/orders/<orderId-de-outro-cliente> -H "X-API-KEY: $KEY" -H "Authorization: Bearer $CUSTOMER"
# → {"statusCode":404,"message":"Pedido não encontrado",...}

# 409 - motorista já ocupado
# → {"statusCode":409,"message":"Motorista já possui uma entrega ativa",...}
```

## 13. Upload de comprovante

`POST /deliveries/:id/proof`, `multipart/form-data`, campo **`file`**, somente pelo motorista responsável e com a entrega em `IN_TRANSIT`. O comprovante é **requisito de domínio**: sem ele a entrega não pode ir para `DELIVERED` (regra no service e `CHECK` no banco).

Validações:

| Validação | Resultado |
|---|---|
| Arquivo ausente / vazio | `400` |
| Tipo não permitido (aceitos: JPEG, PNG, PDF) | `400` |
| **Conteúdo real** (magic bytes) diferente do `Content-Type` declarado | `400` — um `.png` que na verdade é texto/HTML é barrado |
| Tamanho acima de `UPLOAD_MAX_SIZE_BYTES` | `413` |
| Entrega fora de `IN_TRANSIT` | `409` |

Armazenamento: o arquivo é salvo em `UPLOAD_DIR/proofs/<uuid>.<ext>` com nome **gerado pelo servidor** (o nome enviado nunca entra no caminho, evitando *path traversal*). Um novo envio substitui o anterior e apaga o arquivo antigo. Os arquivos **não** ficam publicamente acessíveis: o download passa por `GET /deliveries/:id/proof`, que confere se o solicitante tem acesso.

## 14. Integração externa (CEP)

`CepService` usa o `HttpService` (`@nestjs/axios`) para consultar `GET {CEP_API_BASE_URL}/{cep}/json/` (formato ViaCEP). URL e timeout vêm do ambiente.

| Situação do provedor | Resposta da API |
|---|---|
| Sucesso | `200` com `{cep, street, neighborhood, city, state}` |
| CEP inexistente (`{"erro": true}`) ou HTTP 404/400 | `404` |
| Timeout (`CEP_API_TIMEOUT_MS`) | `504` |
| HTTP 5xx, conexão recusada ou resposta inesperada | `502` |

As mensagens de erro **não vazam** URL interna nem detalhes do provedor. Na criação de pedido, se a consulta falhar nada é gravado.

Para usar uma API mock, basta apontar `CEP_API_BASE_URL` para ela (deve responder em `/{cep}/json/` no formato ViaCEP).

## 15. Interceptor

**`LoggingInterceptor`** (`src/common/interceptors/logging.interceptor.ts`), global.

**Finalidade:** observabilidade. Emite **uma linha JSON por requisição** e adiciona cabeçalhos de rastreio. Não contém nenhuma regra de negócio.

```json
{"requestId":"ee9ca379-...","method":"POST","path":"/orders","statusCode":201,"durationMs":444.4,"userId":"5fd97aef-..."}
```

- Cabeçalhos de resposta: `X-Request-Id` (reaproveita o enviado pelo cliente se for seguro) e `X-Response-Time`.
- **Nunca registra** body, query string nem o cabeçalho `Authorization` — logo, não vaza senha nem token.
- Rejeições de guard (401/403) não passam por interceptors no Nest; elas são registradas pelo `AllExceptionsFilter` como evento `access_denied`, também sem dados sensíveis.

## 16. Segurança e performance

- **`X-API-KEY`** exigida em toda rota (camada extra de acesso, ver [seção 3.1](#31-x-api-key-uma-camada-extra-de-acesso)), comparada em tempo constante (`crypto.timingSafeEqual`) para não vazar a chave por diferença de tempo de resposta.
- **JWT** assinado com `JWT_SECRET` do ambiente (mínimo 32 caracteres, validado na inicialização); `.env` fora do Git.
- **Senhas** com bcrypt; o hash nunca sai em resposta (consultas usam `select` explícito). Login com mensagem única para e-mail inexistente e senha errada, e comparação de custo constante contra hash falso (evita enumeração de contas por tempo de resposta).
- **Helmet** habilitado (cabeçalhos de segurança; `X-Powered-By` removido). **Compression** (gzip) habilitado.
- **Rotas privadas por padrão** (guards globais); autorização por papel + propriedade do recurso.
- **Validação estrita:** `whitelist` + `forbidNonWhitelisted`; UUIDs validados nos parâmetros.
- **Upload** validado por conteúdo, tamanho e tipo; nome do arquivo controlado pelo servidor.
- **Logs sem segredos** (veja seção 15).
- Erros inesperados retornam mensagem genérica ao cliente; o detalhe fica só no log do servidor.

## 17. Testes

```bash
npm test          # 85 testes unitários
npm run test:e2e  # 180 testes de integração
```

Os testes de integração usam um banco **separado** (`<nome>_test`), criado e migrado automaticamente; seus dados de desenvolvimento não são tocados. A API de CEP é substituída por um servidor HTTP local (mock) para simular sucesso, CEP inexistente, lentidão, erro 500, resposta inválida e provedor fora do ar.

| Requisito da avaliação | Onde é demonstrado |
|---|---|
| Fluxo principal com sucesso | `delivery-flow.e2e-spec.ts` |
| Fluxo completo de mudança de estado (+ histórico) | `delivery-flow.e2e-spec.ts`, `delivery.rules.spec.ts`, `business-rules.e2e-spec.ts` |
| Body inválido → 400 | `auth.e2e-spec.ts`, `business-rules.e2e-spec.ts` |
| Sem token / token inválido → 401 | `auth.e2e-spec.ts` (sem token, malformado, assinatura falsa, expirado, usuário desativado) |
| `X-API-KEY` ausente/errada → 401 em toda rota | `api-key.e2e-spec.ts` |
| Sem permissão → 403 | `authorization.e2e-spec.ts` (matriz de papéis) |
| Recurso inexistente → 404 | `business-rules.e2e-spec.ts` |
| Conflito de regra → 409 | `business-rules.e2e-spec.ts` (inclui condição de corrida), `deletes.e2e-spec.ts` (exclusão com histórico) |
| Acesso a recurso de terceiro | `authorization.e2e-spec.ts` |
| Upload válido e inválido | `upload.e2e-spec.ts`, `file-signature.spec.ts` |
| Integração externa funcionando e falhando | `cep-integration.e2e-spec.ts`, `cep.service.spec.ts` |
| Helmet, Compression, Interceptor, dados sensíveis | `security.e2e-spec.ts` |

## 18. Decisões de projeto

- **Recurso de terceiro → 404 (não 403):** não revela a existência do recurso. 403 fica para "seu papel não permite".
- **Papel lido do banco a cada requisição:** custa uma consulta, mas revogação de acesso é imediata.
- **Sem Passport:** um guard próprio com `@nestjs/jwt` cobre o requisito com menos dependências.
- **Estado do veículo "em uso" é derivado**, não armazenado, para não haver duas fontes da verdade.
- **Regras críticas em duas camadas** (service + banco): índices parciais e `CHECK`s garantem integridade mesmo se houver falha de código ou concorrência.
- **Migration com SQL manual:** o Prisma não descreve índices parciais no schema, então foram acrescentados à migration inicial (documentados no próprio arquivo).
- **Bônus implementados:** paginação, filtros, ordenação, seed, testes automatizados e Swagger. Não implementados: Docker e indicadores.
- **`X-API-KEY` em todas as rotas:** extensão pedida além do enunciado original. Aplicada globalmente, antes do JWT (`ApiKeyGuard`), então nem `/health` funciona sem ela — **exceto** a própria página do Swagger (`/docs`), que fica fora do pipeline de guards do Nest por como `SwaggerModule.setup()` registra suas rotas (ver seção 15 do material de estudo).
- **Swagger gerado majoritariamente por inferência:** o plugin `@nestjs/swagger` do Nest CLI (`nest-cli.json`) lê os tipos TypeScript e os decorators do `class-validator` de cada DTO e monta o schema sozinho (`classValidatorShim`), sem precisar anotar campo por campo. Só os enums do Prisma (que não são `enum` nativo do TS) precisaram de `@ApiProperty({ enum: ... })` explícito.

**Limitações conhecidas:** armazenamento de comprovantes em disco local (em produção com várias instâncias, usar armazenamento de objetos); sem limitação de taxa (*rate limiting*); validação de CPF/CNPJ apenas por tamanho, sem dígitos verificadores.
