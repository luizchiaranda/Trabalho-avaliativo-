# Aula: como esta API funciona e por quê

Material de estudo do projeto **API de Logística e Entregas**. Não é documentação de uso (isso é o `README.md`): aqui o objetivo é você **entender cada decisão** e conseguir explicá-la e defendê-la.

**Como estudar:** leia uma seção, abra o arquivo indicado no projeto, e tente responder a pergunta "por que foi feito assim e não de outro jeito?" antes de ler a resposta. No fim há perguntas de defesa oral e exercícios.

## Índice

1. [O problema e o vocabulário do domínio](#1-o-problema-e-o-vocabulário-do-domínio)
2. [Visão geral do NestJS e da requisição](#2-visão-geral-do-nestjs-e-da-requisição)
3. [Prisma 7: o que mudou e como usamos](#3-prisma-7-o-que-mudou-e-como-usamos)
4. [Modelagem de dados](#4-modelagem-de-dados)
5. [Migrations e o SQL que o Prisma não escreve](#5-migrations-e-o-sql-que-o-prisma-não-escreve)
6. [Autenticação](#6-autenticação)
7. [Autorização: papel e propriedade](#7-autorização-papel-e-propriedade)
8. [Validação de entrada](#8-validação-de-entrada)
9. [Regras de negócio e a máquina de estados](#9-regras-de-negócio-e-a-máquina-de-estados)
10. [Concorrência e transações](#10-concorrência-e-transações)
11. [Tratamento de erros](#11-tratamento-de-erros)
12. [Upload de arquivo](#12-upload-de-arquivo)
13. [Integração externa com HttpService](#13-integração-externa-com-httpservice)
14. [Interceptor](#14-interceptor)
15. [Segurança e performance](#15-segurança-e-performance)
16. [Testes](#16-testes)
17. [Erros reais que cometemos (e o que ensinaram)](#17-erros-reais-que-cometemos-e-o-que-ensinaram)
18. [Perguntas de defesa oral](#18-perguntas-de-defesa-oral)
19. [Exercícios](#19-exercícios)
20. [Glossário](#20-glossário)
21. [Adendo: Swagger completo](#21-adendo-24092026-swagger-completo)

---

## 1. O problema e o vocabulário do domínio

Uma empresa de logística recebe **pedidos** de clientes, atribui cada um a um **motorista** com um **veículo**, e acompanha a **entrega** até o fim, registrando **ocorrências** e o **comprovante**.

### 1.1 As diferenças que mais importam

**User × Customer × Driver**

| | Responde a | Exemplo |
|---|---|---|
| `User` | "Quem pode entrar no sistema e com qual papel?" | e-mail, senha, papel |
| `Customer` | "Quem é esse cliente para o negócio?" | CPF/CNPJ, telefone |
| `Driver` | "Quem é esse motorista para o negócio?" | CNH, categoria, validade |

Separar **identidade** (login) de **perfil de negócio** evita uma tabela `users` cheia de colunas nulas. A relação é **1-1**: `Customer.userId` e `Driver.userId` são `@unique`. OPERATOR e ADMIN só têm `User`.

**DeliveryOrder × Delivery**

| | O que é | Guarda |
|---|---|---|
| `DeliveryOrder` (pedido) | **A demanda**: o cliente quer levar algo | origem, destino, peso, descrição |
| `Delivery` (entrega) | **A execução**: alguém tentou cumprir o pedido | motorista, veículo, estado, comprovante |

Relação **1 pedido → N entregas**. Se a primeira tentativa falha (destinatário ausente), o pedido volta para `PENDING` e ganha uma **nova** entrega com outro motorista. Se pedido e entrega fossem a mesma tabela, a tentativa fracassada seria sobrescrita e o histórico se perderia.

> **Pergunta de defesa:** "Por que dois conceitos em vez de um?" → Porque uma demanda pode exigir várias execuções, e queremos preservar cada tentativa.

### 1.2 Os quatro perfis

`CUSTOMER` (pede e acompanha), `DRIVER` (executa), `OPERATOR` (gerencia frota e atribui), `ADMIN` (tudo do operador + gestão de usuários). A matriz completa está no README, seção 8.

---

## 2. Visão geral do NestJS e da requisição

### 2.1 Peças do Nest

| Peça | Papel | Exemplo no projeto |
|---|---|---|
| **Module** | Agrupa peças relacionadas | `src/orders/orders.module.ts` |
| **Controller** | Recebe HTTP, valida e delega | `orders.controller.ts` |
| **Service** | Regras de negócio e acesso a dados | `orders.service.ts` |
| **Provider / DI** | O Nest cria e injeta as dependências | `constructor(private readonly prisma: PrismaService)` |
| **DTO** | Molde e validação do que entra | `create-order.dto.ts` |
| **Guard** | Decide se a requisição pode prosseguir | `ApiKeyGuard`, `JwtAuthGuard`, `RolesGuard` |
| **Pipe** | Valida/transforma parâmetros | `ValidationPipe`, `ParseUUIDPipe` |
| **Interceptor** | Executa código antes e depois do handler | `LoggingInterceptor` |
| **Filter** | Converte exceções em resposta HTTP | `AllExceptionsFilter` |

### 2.2 O caminho de uma requisição

```
Cliente
  → Middleware (Helmet, Compression)                 app.setup.ts
  → Guards: ApiKeyGuard → JwtAuthGuard → RolesGuard   app.module / auth.module (APP_GUARD)
  → Interceptor (antes)                               LoggingInterceptor
  → Pipes: ValidationPipe (DTO), ParseUUIDPipe
  → Controller → Service → Prisma → PostgreSQL
  → Interceptor (depois)
  → (se houve exceção) Exception Filter
```

**Por que a ordem importa:** uma requisição sem chave de API é barrada antes mesmo de o Nest tentar entender quem é o usuário; uma sem token é barrada antes de gastar processamento validando body ou tocando no banco. Isso também explica por que rejeições de guard (401/403) **não** passam pelo Interceptor, e por isso o filtro registra esses eventos.

### 2.3 Providers globais (`src/app.module.ts`)

```ts
providers: [
  { provide: APP_GUARD, useClass: ApiKeyGuard },
  {
    provide: APP_PIPE,
    useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  },
  { provide: APP_FILTER, useClass: AllExceptionsFilter },
  { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
],
```

Registrar pelo token `APP_*` (em vez de `app.useGlobalPipes` no `main.ts`) faz o Nest aplicar o mesmo comportamento **nos testes**, pois eles montam o módulo sem passar pelo `main.ts`. Só Helmet e Compression (middlewares) ficam em `app.setup.ts`, chamado pelo `main.ts` e pelos testes. `JwtAuthGuard` e `RolesGuard` são registrados do mesmo jeito, mas dentro de `auth.module.ts`.

### 2.4 ESM

O Nest 12 gera projeto **ESM** (`"type": "module"`). Por isso todos os imports relativos terminam em `.js` (`import { X } from './x.js'`), mesmo o arquivo sendo `.ts`. É exigência do Node para ES Modules; o TypeScript entende e resolve.

---

## 3. Prisma 7: o que mudou e como usamos

### 3.1 Mudanças em relação ao Prisma 6

| | Prisma 6 | Prisma 7 |
|---|---|---|
| URL do banco | no `schema.prisma` (`url = env(...)`) | em **`prisma.config.ts`** |
| Generator | `prisma-client-js` | `prisma-client`, com `output` **obrigatório** |
| Onde o client fica | `node_modules` | pasta que você define: `src/generated/prisma` |
| Driver | motor Rust embutido | **driver adapter** obrigatório (`@prisma/adapter-pg`) |
| `.env` | lido automaticamente | você carrega (`import 'dotenv/config'`) |

### 3.2 Como está montado

`prisma.config.ts`:

```ts
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: process.env['DATABASE_URL'] },
});
```

`src/prisma/prisma.service.ts`:

```ts
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    super({ adapter: new PrismaPg({ connectionString: config.getOrThrow<string>('DATABASE_URL') }) });
  }
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
```

O serviço **estende** `PrismaClient`; então qualquer service faz `this.prisma.order.findMany(...)`. `onModuleInit`/`onModuleDestroy` abrem e fecham a conexão junto com a aplicação.

### 3.3 Por que `process.env` e não `env()` no config

`env('DATABASE_URL')` **lança erro** se a variável não existir. Aí `prisma generate` (que roda no `postinstall` e no `build`) quebraria em quem clona o projeto sem `.env`. Com `process.env[...]` a geração funciona, e os comandos que realmente precisam do banco (migrate) reclamam da URL na hora certa. Descobrimos isso **testando em clone limpo**.

### 3.4 Fluxo de trabalho com Prisma

```
editar schema.prisma
   → npx prisma migrate dev --name algo   (gera SQL, aplica, regenera o client)
   → commit da pasta prisma/migrations
em outro ambiente:
   → npx prisma migrate deploy            (só aplica o que já existe)
```

`src/generated/` está no `.gitignore` porque é **artefato gerado**; o `postinstall` recria com `prisma generate`.

---

## 4. Modelagem de dados

Arquivo: `prisma/schema.prisma`. Leia-o inteiro com este roteiro.

### 4.1 UUID como chave

`id String @id @default(uuid()) @db.Uuid`. IDs sequenciais (1, 2, 3) permitem adivinhar o pedido do vizinho. UUID torna isso inviável. **Não substitui** a checagem de dono (seção 7), mas ajuda.

### 4.2 Relacionamentos

| Relação | Como o Prisma expressa |
|---|---|
| **1-1** User↔Customer | `Customer.userId String @unique` + `user User @relation(...)` / `User.customer Customer?` |
| **1-N** Customer→Orders | `DeliveryOrder.customerId` + `Customer.orders DeliveryOrder[]` |
| **N-1** Delivery→Driver/Vehicle | `Delivery.driverId`, `Delivery.vehicleId` |
| Duas relações entre as mesmas tabelas | `@relation("DeliveryAssignedBy")` dá nome para desambiguar `Delivery.assignedBy` |

O `@unique` é o que faz o 1-1: sem ele, um usuário poderia ter vários perfis de cliente.

### 4.3 `onDelete: Restrict`

Tudo usa `Restrict`: o banco **recusa** apagar um motorista que tem entregas. O sistema **desativa** (`active = false`) em vez de apagar, e o histórico nunca se perde.

### 4.4 O estado "em uso" do veículo é derivado

```prisma
// "Em uso" não é um status: é derivado de existir uma Delivery ativa.
enum VehicleStatus { AVAILABLE MAINTENANCE INACTIVE }
```

Se guardássemos `IN_USE` no veículo **e** existisse a entrega, teríamos duas fontes da verdade que podem divergir (veículo "em uso" sem entrega alguma). Consultamos o que é verdade: existe uma entrega ativa?

```ts
deliveries: { none: { status: { in: ACTIVE_DELIVERY_STATUSES } } }   // "disponível"
```

### 4.5 Histórico append-only

`DeliveryStatusHistory` só recebe `INSERT`. Guarda `fromStatus` (nulo na criação), `toStatus`, quem mudou (`changedById`), nota e data. Um campo `status` sozinho só conta o **agora**; a tabela conta a **história**.

### 4.6 Endereço copiado no pedido

O pedido guarda `originStreet`, `originCity`… como **cópia** obtida no CEP, não uma referência viva. Se o provedor mudar o nome da rua, pedidos antigos não mudam: o pedido é um registro histórico.

### 4.7 `Float` para peso

Peso não é dinheiro. Para valores monetários usaríamos `Decimal`, porque `Float` tem erro de arredondamento binário.

---

## 5. Migrations e o SQL que o Prisma não escreve

Arquivo: `prisma/migrations/20260921142205_init/migration.sql`.

O Prisma gera as tabelas, mas **não sabe** descrever dois tipos de regra no schema:

### 5.1 Índice único parcial

```sql
CREATE UNIQUE INDEX "deliveries_one_active_per_driver"
  ON "deliveries" ("driverId")
  WHERE "status" IN ('ASSIGNED', 'PICKED_UP', 'IN_TRANSIT');
```

**Leitura:** "não pode haver duas linhas com o mesmo `driverId` **entre as entregas ativas**". Entregas finalizadas (`DELIVERED`, `FAILED`, `CANCELLED`) ficam fora do índice, então o motorista volta a ficar livre. Há um índice igual para veículo e para pedido.

**Por que no banco e não só no código?** Imagine dois operadores atribuindo o **mesmo motorista** no mesmo segundo. Os dois services checam "motorista livre?" → ambos veem que sim → ambos inserem. Só o banco consegue impedir, porque ele serializa a escrita. É uma **condição de corrida** clássica.

### 5.2 CHECK constraints

```sql
CHECK ("status" <> 'DELIVERED' OR "proofPath" IS NOT NULL)          -- entregue exige comprovante
CHECK (("status" IN ('DELIVERED','FAILED','CANCELLED')) = ("finishedAt" IS NOT NULL))  -- final ⇔ finishedAt
CHECK ("capacityKg" > 0)  CHECK ("weightKg" > 0)  CHECK ("originCep" ~ '^[0-9]{8}$')
```

São a **última linha de defesa**: mesmo que um bug no código tente gravar um dado inválido, o banco recusa.

**Consequência para o código:** ao ir para um estado final, o service tem de preencher `finishedAt` **no mesmo UPDATE**, senão o banco rejeita.

### 5.3 Boa prática

**Nunca edite uma migration já aplicada.** O Prisma guarda o *checksum*; se o arquivo mudar, ele acusa divergência. Por isso as explicações ficam nos comentários do SQL manual, escritos antes de aplicar. Depois que aplicada, mudanças = **nova migration**.

Verificamos que o Prisma aceita nosso SQL manual sem tentar desfazê-lo: `prisma migrate diff` devolveu "empty migration".

---

## 6. Autenticação

**Autenticação = "quem é você?"** (vs. autorização = "o que você pode fazer?").

### 6.1 Senha: hash, nunca texto

`src/common/utils/password.ts` usa **bcrypt** (`bcryptjs`, 10 rounds). Bcrypt é um hash **lento de propósito** e com *salt* aleatório embutido: a mesma senha gera hashes diferentes, e testar bilhões de senhas fica caro para um atacante. Nunca guardamos nem devolvemos a senha; a coluna se chama `passwordHash`.

Limite de 72 caracteres na senha: o bcrypt só considera os primeiros 72 bytes.

### 6.2 Login (`src/auth/auth.service.ts`)

```ts
const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

// Compara contra um hash falso quando o e-mail não existe, para que o
// tempo de resposta não revele se a conta existe.
const passwordOk = await verifyPassword(dto.password, user?.passwordHash ?? this.dummyHash);
if (!user || !passwordOk || !user.active) throw new UnauthorizedException('Credenciais inválidas');
```

Dois cuidados de segurança:

1. **Mensagem única** ("Credenciais inválidas") para e-mail inexistente e senha errada. Mensagens diferentes deixariam um atacante descobrir quais e-mails existem (*user enumeration*).
2. **Comparação de custo constante.** Se o e-mail não existe e retornássemos na hora, a resposta seria mais rápida que a de "senha errada" (que gasta bcrypt), e o tempo entregaria a informação. Por isso comparamos com um hash falso. O `dummyHash` precisa ser um **hash bcrypt válido**: uma string qualquer faria o `compare` retornar rápido. (Erro real que corrigimos, seção 17.)

### 6.3 JWT

`JwtModule` assina com `JWT_SECRET` (do ambiente) e validade `JWT_EXPIRES_IN`. O token guarda só `{ sub: userId }`.

JWT tem 3 partes: `header.payload.assinatura`. O payload é **legível por qualquer um** (só base64): nunca coloque segredo nele. A assinatura garante que **não foi adulterado**.

### 6.4 O guard global (`src/common/guards/jwt-auth.guard.ts`)

```ts
const payload = await this.jwt.verifyAsync<{ sub: string }>(token, { secret });
// O papel vem SEMPRE do banco, nunca do token
const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true, active: true } });
if (!user?.active) throw new UnauthorizedException('Token ausente ou inválido');
request.user = { id: user.id, email: user.email, role: user.role };
```

**Por que consultar o banco a cada requisição?** Se o papel viesse do token, um usuário rebaixado ou desativado continuaria com poder **até o token expirar**. Custa uma consulta, ganha revogação imediata. É uma decisão consciente de segurança sobre desempenho.

### 6.5 Rotas privadas por padrão

O guard é registrado globalmente (`APP_GUARD`). Toda rota exige token, **exceto** as marcadas com `@Public()` (`/health`, `/auth/register`, `/auth/login`). O padrão seguro é "fechado": esquecer de proteger uma rota nova não a deixa aberta. Isso vale para o JWT — a chave de API (seção 15.1) é ainda mais estrita: nem `@Public()` a dispensa.

### 6.6 `@CurrentUser()`

`src/common/decorators/current-user.decorator.ts` lê `request.user` (preenchido pelo guard). No controller: `create(@CurrentUser() user: AuthUser, ...)`. É a **fonte da identidade**: nunca confiamos em um `userId` vindo do body.

---

## 7. Autorização: papel e propriedade

Duas perguntas diferentes, duas camadas.

### 7.1 Camada 1: papel (RBAC), resulta em **403**

```ts
@Roles(Role.OPERATOR, Role.ADMIN)
@Controller('vehicles')
export class VehiclesController { ... }
```

`RolesGuard` lê os papéis exigidos (via `Reflector`) e compara com `request.user.role`. Sem permissão → `403 Forbidden`.

O `@Roles()` pode ficar na **classe** (vale para todas as rotas: `VehiclesController`, `UsersController`) ou no **método** (`DriversController`, que tem rotas de papéis diferentes: `@Roles(DRIVER)` em `/drivers/me` e `@Roles(OPERATOR, ADMIN)` nas demais). O `getAllAndOverride` procura primeiro no método e, se não achar, na classe, então o do método prevalece.

### 7.2 Camada 2: propriedade ("isso é **seu**?"), resulta em **404**

Aqui está o requisito "não manipular recursos de terceiros alterando IDs". A resposta é **filtrar a consulta pelo dono**, usando o `id` do token:

```ts
private accessWhere(user: AuthUser): Prisma.DeliveryWhereInput {
  switch (user.role) {
    case Role.CUSTOMER: return { order: { customer: { userId: user.id } } };
    case Role.DRIVER:   return { driver: { userId: user.id } };
    default:            return {};          // OPERATOR/ADMIN veem tudo
  }
}

async findAccessibleOrFail(user, id) {
  const delivery = await this.prisma.delivery.findFirst({ where: { id, ...this.accessWhere(user) }, include });
  if (!delivery) throw new NotFoundException('Entrega não encontrada');
  return delivery;
}
```

Se o cliente B pedir o ID de uma entrega do cliente A, a consulta com o filtro de B **não encontra nada** → 404. Não existe código do tipo "achou, mas não é seu → erro", que é fácil de esquecer em algum endpoint. O filtro faz parte da própria busca. Em entregas, **todas** as operações (leitura, histórico, mudança de estado, upload, download e ocorrências) passam por `findAccessibleOrFail`; em pedidos, o mesmo papel é do `findOne` e do `accessWhere` da listagem.

### 7.3 Por que 404 e não 403 para terceiros?

Responder 403 confirma "esse recurso existe, mas você não pode vê-lo". 404 não vaza a existência. Regra do projeto: **403 = seu papel não permite a operação; 404 = para você, esse recurso não existe**.

### 7.4 Um caso sutil: criar pedido "em nome de outro"

O cliente pode enviar `customerId` no body. Se for diferente do próprio, respondemos **403** (é uma tentativa explícita de agir por outra pessoa, não um recurso "escondido"). Se omitido, usamos o do token.

### 7.5 Dados por audiência

O cliente vê um **resumo** do motorista, não a CNH, o e-mail nem o telefone:

```ts
if (role === Role.CUSTOMER) {
  return { ...base, driver: { id, name }, vehicle: { plate, model, type }, assignedBy: undefined, proof };
}
```

Regra: **minimizar dados por padrão**; cada papel recebe só o que precisa.

---

## 8. Validação de entrada

### 8.1 O `ValidationPipe`

```ts
new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
```

| Opção | Efeito |
|---|---|
| `whitelist` | descarta campos que **não** estão no DTO |
| `forbidNonWhitelisted` | em vez de descartar, responde **400** |
| `transform` | converte o body para a classe do DTO (e aplica `@Transform`) |

**`forbidNonWhitelisted` protege contra *mass assignment*:** se alguém enviar `{"email": "...", "role": "ADMIN"}` no cadastro, o campo `role` não existe no `RegisterDto` e a requisição é rejeitada. Sem isso, um descuido no service poderia gravar o papel escolhido pelo atacante.

### 8.2 Decorators do class-validator

```ts
export class RegisterDto {
  @Transform(normalizeEmail)  @IsEmail()  @MaxLength(160)   email: string;
  @IsString() @MinLength(8) @MaxLength(72) @Matches(PASSWORD_RULE, {...}) password: string;
  @Transform(onlyDigits) @Matches(/^(\d{11}|\d{14})$/) document: string;
}
```

`@Transform` **normaliza antes de validar**: `"529.982.247-25"` vira `52998224725`; e-mail vira minúsculo. Assim `Ana@X.com` e `ana@x.com` não viram duas contas.

### 8.3 Validando objetos aninhados

```ts
@IsDefined() @ValidateNested() @Type(() => AddressInputDto) origin: AddressInputDto;
```

Sem `@Type` o class-transformer não sabe converter o objeto interno em `AddressInputDto`, e o `@ValidateNested` não valida nada.

### 8.4 Parâmetros

`@Param('id', ParseUUIDPipe)` transforma um ID malformado em **400** limpo. Sem isso o Prisma lançaria um erro obscuro.

### 8.5 Query strings

Vêm como texto (`"2"`, `"true"`). Por isso os DTOs de listagem usam `@Type(() => Number)` e `@Transform(toBoolean)`.

---

## 9. Regras de negócio e a máquina de estados

Arquivo central: `src/deliveries/delivery.rules.ts`. São **funções e constantes puras** (sem banco), o que as torna fáceis de testar (48 testes unitários).

### 9.1 O mapa de transições

```ts
export const DELIVERY_TRANSITIONS = {
  ASSIGNED:   ['PICKED_UP', 'FAILED', 'CANCELLED'],
  PICKED_UP:  ['IN_TRANSIT', 'FAILED', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'FAILED', 'CANCELLED'],
  DELIVERED: [], FAILED: [], CANCELLED: [],
};
export const canTransition = (from, to) => DELIVERY_TRANSITIONS[from].includes(to);
```

**Por que um mapa?** A regra fica em **um único lugar**, legível como uma tabela, e o service não tem `if`s espalhados. Um estado sem saídas (`[]`) é **final**.

### 9.2 Quem pode pedir qual transição

```ts
DRIVER_TARGET_STATUSES = [ASSIGNED, PICKED_UP, IN_TRANSIT, DELIVERED, FAILED];   // não CANCELLED
STAFF_TARGET_STATUSES  = [CANCELLED];                                            // operador/admin só cancelam
```

No service (`updateStatus`), a ordem das verificações define o código HTTP:

1. **Existe e é meu?** (`findAccessibleOrFail`) → senão **404**
2. **Meu papel pode pedir esse destino?** → senão **403**
3. **A transição é válida a partir do estado atual?** → senão **409**
4. **`DELIVERED` tem comprovante?** → senão **409**
5. **`FAILED` tem ocorrência?** → senão **409**

**403 × 409:** 403 = *"você não pode fazer isso"* (papel). 409 = *"isso não pode ser feito agora"* (estado). Um motorista pedindo `CANCELLED` recebe 403; pedir `DELIVERED` a partir de `ASSIGNED` recebe 409.

### 9.3 Sincronizando o pedido

```ts
ORDER_STATUS_ON_DELIVERY = { ASSIGNED: SCHEDULED, PICKED_UP: SCHEDULED, IN_TRANSIT: IN_TRANSIT,
                             DELIVERED: DELIVERED, FAILED: PENDING, CANCELLED: PENDING };
```

O estado do pedido **acompanha** a entrega, na mesma transação. Falha/cancelamento devolvem o pedido a `PENDING`, pronto para nova atribuição.

### 9.4 Regras de atribuição

`findAssignmentConflicts` recebe os dados e devolve **uma lista de motivos**:

```ts
if (order.status !== PENDING)                       conflicts.push(...)
if (!driver.active)                                 conflicts.push('Motorista está inativo')
if (driver.licenseExpiresAt < startOfTodayUtc(now)) conflicts.push('CNH do motorista está vencida')
if (driverHasActiveDelivery)                        ...
if (vehicle.status !== AVAILABLE)                   ...
if (!LICENSE_ALLOWED_VEHICLES[cat].includes(type))  ...   // A→moto; B→carro/van; C/D/E→+caminhão
if (order.weightKg > vehicle.capacityKg)            ...
```

Devolver **todos** os motivos de uma vez (em vez de parar no primeiro) é melhor para quem usa a API: ele corrige tudo de uma vez.

**Por que é uma função pura?** Recebe `now` como parâmetro. Assim os testes fixam a data e verificam, por exemplo, que "CNH vence hoje ainda vale" e "venceu ontem não vale", sem depender do relógio real.

### 9.5 Por que 404 vs 409 nas referências

Pedido, motorista ou veículo **que não existem** = **404** (a referência é inválida). Existem mas são **incompatíveis** = **409** (o pedido é válido, o estado do mundo é que conflita).

### 9.6 A mesma regra vale para editar, não só para atribuir

`findAssignmentConflicts` roda em `POST /deliveries`, no momento de atribuir. Mas nada impede um operador de, **depois**, editar o veículo ou o motorista que já está numa entrega em andamento: `PATCH /vehicles/:id` mudando `capacityKg`, ou `PATCH /drivers/:id` mudando `licenseCategory`. Numa revisão de bugs, ficou claro que essas duas rotas não revalidavam nada — dava para, por exemplo, reduzir a capacidade do veículo abaixo do peso que ele já estava carregando.

A correção segue o mesmo padrão de `findAssignmentConflicts`, só que "ao contrário": em vez de checar compatibilidade **antes** de criar o vínculo, checa se a mudança **quebraria** um vínculo que já existe.

```ts
// VehiclesService.update — mesma ideia em DriversService.update, espelhada
if (leavingService || changesCompatibility) {
  const active = await this.prisma.delivery.findFirst({
    where: { vehicleId: id, status: { in: ACTIVE_DELIVERY_STATUSES } },
    select: { order: { select: { weightKg: true } }, driver: { select: { licenseCategory: true } } },
  });
  if (active && dto.capacityKg !== undefined && dto.capacityKg < active.order.weightKg) {
    throw new ConflictException(`Capacidade não pode ficar abaixo do peso (${active.order.weightKg} kg) já em entrega ativa`);
  }
  // ...e o mesmo para dto.type contra a CNH do motorista
}
```

**A lição geral:** uma regra de negócio ("motorista/veículo não podem ter atribuições incompatíveis") normalmente tem **mais de um caminho de código** que pode violá-la. É fácil proteger o caminho óbvio (criar a atribuição) e esquecer o caminho menos óbvio (editar algo que já está atribuído). Ao revisar um service, vale perguntar: "que outras operações mexem nesses mesmos campos, e elas também respeitam essa regra?"

---

## 10. Concorrência e transações

### 10.1 Transação: tudo ou nada

```ts
await this.prisma.$transaction(async (tx) => {
  ...checa...
  const delivery = await tx.delivery.create({ ..., history: { create: {...} } });
  await tx.deliveryOrder.updateMany({ where: { id, status: PENDING }, data: { status: SCHEDULED } });
});
```

Criar a entrega, gravar o histórico e mudar o pedido acontecem **juntos**. Se qualquer passo falhar, nenhum é aplicado. Sem transação, uma falha no meio deixaria o pedido `PENDING` com uma entrega ativa "fantasma".

### 10.2 Modificação otimista com `updateMany`

```ts
const changed = await tx.delivery.updateMany({
  where: { id, status: delivery.status },       // só atualiza se AINDA estiver no estado que lemos
  data: { status: target, ...(isFinalStatus(target) && { finishedAt: new Date() }) },
});
if (changed.count !== 1) throw new ConflictException('A entrega foi alterada por outra requisição...');
```

Problema: lemos o estado (`ASSIGNED`), validamos, e antes de gravar **outra requisição** mudou a entrega. Se atualizássemos só por `id`, sobrescreveríamos. Incluir `status` no `WHERE` faz o UPDATE afetar 0 linhas se o estado mudou, e detectamos isso (`count`).

### 10.3 Os dois níveis contra a corrida

| Nível | Papel |
|---|---|
| Código (checagem + transação) | mensagens claras para o caso normal |
| Banco (índice parcial) | garante mesmo se duas requisições passarem juntas pela checagem |

O teste "condição de corrida" dispara duas atribuições simultâneas do mesmo motorista e verifica que o resultado é sempre **um 201 e um 409**, com uma única entrega ativa no banco.

---

## 11. Tratamento de erros

### 11.1 Um formato único

`src/common/filters/all-exceptions.filter.ts` com `@Catch()` (captura tudo):

```json
{ "statusCode": 409, "error": "Conflict", "message": "...", "path": "/deliveries", "timestamp": "..." }
```

Qualquer erro (do nosso código, do Nest, do Prisma) sai neste formato. O cliente não precisa tratar formatos diferentes.

### 11.2 Traduzindo erros do Prisma

| Código Prisma | Significado | Vira |
|---|---|---|
| `P2002` | violação de unicidade | **409** |
| `P2003` | violação de chave estrangeira | **409** |
| `P2025` | registro não encontrado | **404** |

Para `P2002` extraímos o nome do índice para dar mensagem útil:

```ts
const index = meta.driverAdapterError?.cause?.constraint?.index;   // ex.: "vehicles_plate_key"
if (CONSTRAINT_MESSAGES[index]) return CONSTRAINT_MESSAGES[index];  // índices parciais têm mensagem própria
const field = index.replace(`${table}_`, '').replace(/_key$/, '');  // "plate"
return `Já existe um registro com o mesmo valor de: ${field}`;
```

O Postgres nomeia índices únicos como `<tabela>_<campo>_key`, então derivamos o campo do nome.

### 11.2.1 Nem todo erro é um `HttpException` do Nest

O `@Catch()` sem argumento pega **qualquer** exceção, mas só sabe dar uma resposta específica para os tipos que `normalize()` reconhece explicitamente. Um corpo JSON acima do limite do `body-parser` (100 KB por padrão) faz o Express lançar um `PayloadTooLargeError` **antes** da requisição chegar ao Nest — é um erro puro do Express/`raw-body`, não um `HttpException`. Sem tratamento, ele caía direto no branch "erro desconhecido" (500), quando deveria ser **413**:

```ts
function isPayloadTooLarge(exception: unknown): boolean {
  return exception instanceof Error && (exception as { type?: unknown }).type === 'entity.too.large';
}
// dentro de normalize(), antes do "return { status: 500, ... }" padrão:
if (isPayloadTooLarge(exception)) {
  return { status: HttpStatus.PAYLOAD_TOO_LARGE, message: 'Corpo da requisição excede o tamanho permitido' };
}
```

**A lição:** um filtro global "pega tudo" cobre a **rota** de qualquer erro até o cliente, mas não cobre automaticamente o **significado** de cada erro. Cada nova biblioteca ou middleware que pode lançar algo diferente de um `HttpException` precisa ser ensinado ao filtro, um por um — do contrário, um problema do cliente (corpo grande demais) some dentro de um genérico "erro interno do servidor", que é justamente a categoria de erro que deveria estar reservada para bugs nossos, não para entradas inválidas.

### 11.3 Erros inesperados

Qualquer outra coisa vira **500 com mensagem genérica**; o detalhe (stack) vai só para o log do servidor. **Nunca** mostre stack trace ou mensagem interna ao cliente: isso ajuda atacantes.

### 11.4 Tabela de códigos usados

| Código | Quando |
|---|---|
| 400 | entrada inválida |
| 401 | chave de API ou token ausente/inválido |
| 403 | papel sem permissão |
| 404 | inexistente **ou de outro dono** |
| 409 | conflito de regra/estado/unicidade |
| 413 | arquivo de upload ou corpo JSON grande demais |
| 502 | provedor externo com falha |
| 504 | provedor externo estourou o tempo |

---

## 12. Upload de arquivo

Arquivos: `deliveries.module.ts` (Multer), `deliveries.service.ts` (`saveProof`), `file-signature.ts`.

### 12.1 Multer

`FileInterceptor('file')` lê o campo `file` de um `multipart/form-data`. Configuramos `memoryStorage()` (arquivo fica na memória até validarmos) com `limits.fileSize` vindo do `.env`. Estourou o limite → Nest devolve **413**.

### 12.2 Não confie no que o cliente declara

O cabeçalho `Content-Type` e a extensão do arquivo são escolhidos por **quem envia**. Um atacante manda um `.html` chamado `foto.png` com `Content-Type: image/png`. A defesa é olhar o **conteúdo real**, os primeiros bytes (*magic bytes*):

```ts
JPEG: FF D8 FF          PNG: 89 50 4E 47 0D 0A 1A 0A          PDF: "%PDF-"
```

`detectFileType(buffer)` identifica o tipo pelo conteúdo. Depois exigimos que ele **coincida** com o `Content-Type` declarado; se divergir → 400.

### 12.3 Nome do arquivo em disco

```ts
const storedName = `${randomUUID()}.${detected.extension}`;   // gerado pelo servidor
```

O nome original vai só para metadados (`proofOriginalName`), **sanitizado** com `basename` e troca de caracteres estranhos. Se usássemos o nome enviado no caminho, `../../etc/x` (*path traversal*) poderia gravar fora da pasta. O teste envia `../../../evil.png` e comprova que o arquivo fica só em `uploads/proofs/<uuid>.png`.

### 12.4 Ligação com o domínio

O upload **não é um enfeite**: `DELIVERED` exige `proofPath` (regra no service e `CHECK` no banco). E só é aceito com a entrega `IN_TRANSIT`, e apenas pelo motorista responsável.

### 12.5 Integridade

Se gravar o arquivo funciona mas o UPDATE no banco falha, o `catch` **apaga o arquivo** órfão. Ao substituir um comprovante, o antigo é removido do disco.

### 12.6 Download protegido

Os arquivos **não** ficam numa pasta pública. `GET /deliveries/:id/proof` primeiro passa por `findAccessibleOrFail` (autorização) e só então faz o *stream* (`StreamableFile`).

---

## 13. Integração externa com HttpService

Arquivos: `src/cep/cep.module.ts`, `cep.service.ts`.

### 13.1 Configuração

```ts
HttpModule.registerAsync({
  inject: [ConfigService],
  useFactory: (config) => ({ baseURL: config.getOrThrow('CEP_API_BASE_URL'), timeout: config.getOrThrow('CEP_API_TIMEOUT_MS'), maxRedirects: 0 }),
})
```

URL e timeout vêm do ambiente. Para trocar de ViaCEP para uma API mock, muda-se o `.env`, sem tocar em código.

### 13.2 A chamada

`HttpService` do Nest devolve **Observable** (RxJS). Convertemos para Promise:

```ts
const response = await firstValueFrom(this.http.get<ViaCepResponse>(`/${cep}/json/`));
```

### 13.3 Falha controlada

Tratar só o caminho feliz não basta: serviços externos **falham**. Traduzimos cada falha para uma resposta significativa:

| O que aconteceu | Resposta | Por quê |
|---|---|---|
| `{ "erro": true }` (CEP não existe) | **404** | é um "não encontrado" legítimo |
| timeout (`ECONNABORTED`) | **504 Gateway Timeout** | nosso servidor esperou demais o de fora |
| erro 5xx, conexão recusada, resposta estranha | **502 Bad Gateway** | o servidor de fora respondeu mal ou não respondeu |

E as mensagens **não vazam** detalhes internos (URL, porta, texto do erro original).

### 13.4 Efeito no domínio

Ao criar um pedido buscamos origem e destino **antes** de gravar. Se qualquer consulta falhar, nada é gravado (não fica pedido pela metade). O teste confirma que a contagem de pedidos não muda.

### 13.5 Testar sem depender da internet

Testes automatizados devem ser **determinísticos**: a internet fora do ar não pode quebrá-los. Nos testes de integração subimos um **servidor HTTP local** (`test/helpers/cep-mock.ts`) que simula sucesso, CEP inexistente, lentidão, erro 500, resposta inválida e queda.

---

## 14. Interceptor

Arquivo: `src/common/interceptors/logging.interceptor.ts`.

### 14.1 O que é

Um interceptor "embrulha" a execução do handler: código **antes** e **depois**. Usa RxJS: `next.handle()` devolve um Observable da resposta, e o operador `tap` observa o resultado sem alterá-lo.

```ts
return next.handle().pipe(
  tap({
    next: () => finish(response.statusCode),
    error: (error) => finish(error instanceof HttpException ? error.getStatus() : 500),
  }),
);
```

### 14.2 O que este faz

Uma linha JSON por requisição:

```json
{"requestId":"ee9c...","method":"POST","path":"/orders","statusCode":201,"durationMs":444.4,"userId":"5fd9..."}
```

e cabeçalhos `X-Request-Id` (rastreio) e `X-Response-Time`.

### 14.3 Por que é um bom uso de Interceptor

É uma preocupação **transversal** (aplica-se a todas as rotas, sem relação com uma regra específica). O enunciado avisa: **não coloque regra de negócio no interceptor**. Ele só observa.

### 14.4 Cuidado com segredos

Registra **caminho sem query string** e **nunca** o body nem `Authorization`. Um teste faz login com senha e verifica que nem a senha, nem o token, nem a palavra "authorization" aparecem em nenhum log.

O `X-Request-Id` enviado pelo cliente só é reaproveitado se casar com `^[\w-]{1,64}$`; senão geramos outro. (Aceitar qualquer texto permitiria injetar lixo nos logs.)

---

## 15. Segurança e performance

| Medida | Onde | Por quê |
|---|---|---|
| **`X-API-KEY` em toda rota** | `ApiKeyGuard` | ver 15.1 — segunda credencial, independente do usuário |
| **Helmet** | `app.setup.ts` | cabeçalhos protetores (`X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, CSP…) e remove `X-Powered-By` |
| **Compression** | `app.setup.ts` | gzip reduz tráfego; só comprime respostas acima de ~1 KB e se o cliente aceita |
| **Segredo por ambiente** | `.env`, `env.validation.ts` | `JWT_SECRET`/`API_KEY` fora do código, com tamanho mínimo, app não sobe sem eles |
| **`.env` fora do Git** | `.gitignore` | segredo vazado no repositório é para sempre |
| **Validação estrita** | `ValidationPipe` | barra *mass assignment* e lixo |
| **`select` explícito** | services | a senha só é lida no login (para comparar) e nunca sai em nenhuma resposta |
| **Mensagem genérica em 500** | filtro | não vaza detalhes internos |
| **Falhar cedo** | `validateEnv` | ambiente incompleto derruba a inicialização com mensagem clara |

Sobre `select` vs "remover a senha depois": remover depois exige lembrar em **todo** lugar. Selecionar só o que se pode expor é seguro **por construção**.

### 15.1 `X-API-KEY`: uma segunda credencial, independente do usuário

O JWT responde "**quem** é o usuário logado". A `X-API-KEY` responde uma pergunta diferente: "**este chamador tem permissão para sequer conversar com a API**?" É a mesma ideia por trás de uma chave de acesso a uma API pública (como as de mapas ou pagamento): identifica o **cliente/integração**, não a pessoa.

```ts
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-api-key'];
    const expected = this.config.getOrThrow<string>('API_KEY');

    if (typeof provided !== 'string' || !safeEqual(provided, expected)) {
      throw new UnauthorizedException('Chave de API ausente ou inválida');
    }
    return true;
  }
}
```

Registrado como `APP_GUARD` global em `app.module.ts` — **não** usa `@Public()`, porque `@Public()` só é lido pelo `JwtAuthGuard`. Por isso a chave é exigida em **literalmente** toda rota, inclusive `/health`.

**Três pontos que valem a pena entender:**

1. **É uma camada independente, não substitui o JWT.** Uma requisição pode ter a chave certa e ainda assim ser barrada por falta de token (401 "Token ausente ou inválido"), e vice-versa. As duas são checadas por guards diferentes, e **os dois têm de passar**.
2. **Comparação em tempo constante.** Comparar strings com `===` faz o JavaScript parar no primeiro caractere diferente — em teoria, alguém poderia medir microssegundos de diferença e descobrir a chave byte a byte. `crypto.timingSafeEqual` sempre gasta o mesmo tempo, então não vaza informação pelo relógio. É o mesmo princípio do `dummyHash` do login (seção 6.2), aplicado a um segredo diferente.
   ```ts
   function safeEqual(a: string, b: string): boolean {
     const bufA = Buffer.from(a);
     const bufB = Buffer.from(b);
     return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
   }
   ```
   Comparar o **comprimento** antes não enfraquece a defesa: o tamanho da chave não é segredo, só o conteúdo é.
3. **`@Public()` continua existindo, com outro significado.** Ele só dispensa o **JWT** (para permitir login sem estar logado). A `X-API-KEY` está num nível abaixo disso — é a "porta de entrada" do prédio, e o JWT é o "crachá" de cada usuário. Uma coisa não substitui a outra.

**Consequência prática:** um `curl http://localhost:3000/health` sem cabeçalho algum agora recebe 401, não 200. Qualquer monitoramento de disponibilidade (load balancer, uptime checker) precisa ser configurado para enviar a chave.

---

## 16. Testes

### 16.1 Duas categorias

| Tipo | Onde | O que prova | Velocidade |
|---|---|---|---|
| **Unitário** | `src/**/*.spec.ts` (85) | lógica pura isolada (transições, conflitos, tipo de arquivo, tratamento de erro do CEP, ambiente) | milissegundos |
| **Integração / e2e** | `test/*.e2e-spec.ts` (168) | a aplicação inteira, com HTTP e banco reais | segundos |

O ideal é muitos unitários (baratos, precisos) e integração para os fluxos e as fronteiras (HTTP, banco, autorização).

### 16.2 Banco de teste separado

`test/global-setup.ts` cria `<nome>_test`, aplica as migrations (`migrate deploy`) e o vitest usa essa URL. Seu banco de desenvolvimento **nunca é tocado**. Entre suites, `TRUNCATE ... CASCADE` zera os dados.

### 16.3 Testando o negativo, não só o positivo

Um bom teste de segurança inclui o **controle positivo**: "o perfil certo consegue" ao lado de "o perfil errado é barrado". Sem isso, um teste de 403 passaria se a rota estivesse simplesmente quebrada.

### 16.4 O que cada spec de integração cobre

| Spec | Cobre |
|---|---|
| `delivery-flow` | o caminho completo: cadastro → pedido → atribuição → estados → comprovante → histórico; falha e reagendamento; cancelamento |
| `api-key` | `X-API-KEY` em toda rota, inclusive pública; independência entre chave e JWT |
| `auth` | 400, 401 (7 formas de token inválido), 409, mass assignment |
| `authorization` | matriz papel × rota (403); acesso a recursos de terceiros (404) |
| `business-rules` | 404, 400, todos os 409, concorrência, filtros, paginação |
| `upload` | válidos e inválidos, path traversal, download |
| `cep-integration` | sucesso e cada modo de falha |
| `security` | Helmet, gzip, varredura de dados sensíveis, Interceptor, formato de erro |

### 16.5 Um wrapper para não editar duzentas chamadas de teste

Quando a `X-API-KEY` passou a ser obrigatória, os **150 testes já existentes** quebrariam, porque nenhum enviava o cabeçalho. Em vez de editar teste por teste, criamos `api()` em `test/helpers/factories.ts`: uma função que substitui `request(ctx.server)` e já anexa a chave de teste, mantendo cada teste livre para continuar isolando exatamente o que queria (token ausente, papel errado, etc.). Os testes que verificam a **própria** chave de API (`api-key.e2e-spec.ts`) usam o `request` bruto do Supertest de propósito, para poder omitir a chave.

```ts
export function api(server: Server) {
  const withKey = <T extends { set: (field: string, value: string) => T }>(req: T) => req.set('X-Api-Key', TEST_API_KEY);
  return {
    get: (path: string) => withKey(request(server).get(path)),
    post: (path: string) => withKey(request(server).post(path)),
    // ...
  };
}
```

Isso é um exemplo prático de um princípio maior: **quando uma exigência transversal muda, prefira resolver no ponto único onde as chamadas passam, em vez de espalhar a mudança por todo lugar.**

### 16.6 Testando código assíncrono simulando falhas

`cep.service.spec.ts` substitui o `HttpService` por um objeto com `get` simulado que devolve `of(...)` (sucesso) ou `throwError(...)` (falha) e verifica **qual exceção** o serviço lança para cada caso.

---

## 17. Erros reais que cometemos (e o que ensinaram)

Estudar erros reais vale mais do que ler regras.

| Erro | O que aconteceu | Lição |
|---|---|---|
| `env()` no `prisma.config.ts` | o build quebrava para quem clona sem `.env` | teste em **clone limpo**: o "funciona na minha máquina" esconde dependências de arquivos locais |
| Hash falso inválido no login | a proteção contra medição de tempo não funcionava | segurança depende de detalhes; uma string qualquer **não** é um hash bcrypt |
| Teste chamando o ViaCEP real | o `ConfigModule.forRoot()` lê o ambiente **quando o módulo é importado**, antes do teste definir a URL | entender **quando** o código roda; a solução foi definir a variável no ambiente do vitest |
| Mensagem de 409 genérica | o formato do erro `P2002` com driver adapter é diferente do documentado em tutoriais antigos | **inspecione o dado real** (imprimimos o erro) em vez de supor |
| `@IsUrl` aceitando `nao-e-url` | uma URL sem `http://` passaria na inicialização e quebraria só em runtime | o **teste unitário** achou uma falha no meu código, não no teste |
| Spread de DTO (`{...query, driverId}`) | o lint reclamou; e ainda deixava `?driverId=` da URL sobrescrever o escopo | um parâmetro `scope` explícito, combinado por `AND`, é mais claro **e** mais seguro |
| Testes com pasta de upload compartilhada | um spec deixava arquivos que outro contava | testes precisam ser **isolados** entre si |
| 150 testes quebrariam com a `X-API-KEY` nova | toda chamada de teste precisaria do cabeçalho novo | centralizar a mudança num wrapper (`api()`) em vez de editar cada `it(...)` — seção 16.5 |
| `PATCH /vehicles/:id` e `/drivers/:id` aceitavam tornar uma atribuição **já existente** incompatível (reduzir capacidade abaixo do peso em curso, trocar tipo/categoria para algo que não bate mais) | a regra de compatibilidade só era checada em `POST /deliveries` (na hora de atribuir); editar o cadastro *depois* não revalidava nada | uma regra de negócio vale para **todo** caminho que pode violá-la, não só o caminho "óbvio" pelo qual ela normalmente é violada — reproduzido com `curl` contra o banco de dev antes de corrigir |
| Corpo JSON acima de 100 KB (limite padrão do Express) virava **500**, não 413 | o `PayloadTooLargeError` do `body-parser` não é uma `HttpException` do Nest, então caía no branch "erro desconhecido" do filtro | um filtro global "pega tudo" (`@Catch()`) só é tão bom quanto os tipos de erro que ele sabe reconhecer; **todo** ponto de entrada não-HTTP-exception (middlewares, libs externas) precisa de um branch dedicado |
| Quase "corrigi" `DRIVER_TARGET_STATUSES` removendo `ASSIGNED` por parecer código morto | um teste existente quebrou: sem ele, pedir `status: "ASSIGNED"` virava 403 em vez do 409 já testado e intencional | nem toda coisa que parece redundante é um bug; **rode os testes antes de decidir que algo é lixo** — o "código morto" tinha uma razão de ser, documentada no comentário depois |
| `@ApiBearerAuth('JWT')` na classe de 8 controllers fazia a documentação Swagger dessas rotas mostrar só "exige JWT" | no OpenAPI, o `security` de uma operação **substitui** o padrão do documento, não soma a ele — a API continuava exigindo a X-API-KEY normalmente, só a *documentação* ficou incompleta | gerar o JSON e **inspecionar o campo de verdade** (`paths['/orders'].get.security`) revelou o problema que só ler o código não mostrava; a correção foi confiar no padrão global e parar de repetir a exigência rota a rota |

---

## 18. Perguntas de defesa oral

Tente responder em voz alta antes de ler.

**1. Por que separar `DeliveryOrder` e `Delivery`?**
Pedido é a demanda; entrega é a execução. Um pedido pode ter várias tentativas (falha, reagendamento). Numa tabela só perderíamos o histórico de tentativas.

**2. Como você impede que o cliente B veja o pedido do cliente A alterando o ID na URL?**
Toda busca inclui um filtro pelo dono usando o `id` do **token** (`accessWhere`). O ID vindo da requisição só serve para localizar; se não pertence ao usuário, a consulta não retorna nada e a resposta é 404.

**3. Por que 404 e não 403 para recurso de terceiro?**
403 confirmaria que o recurso existe. 404 não vaza a existência. 403 reservei para "seu papel não permite a operação".

**4. Diferença entre autenticação e autorização?**
Autenticação: quem é você (login, JWT). Autorização: o que você pode fazer (papel + propriedade do recurso).

**5. Por que o papel é lido do banco e não do token?**
Se estivesse no token, um usuário desativado ou rebaixado manteria os poderes até o token expirar. Lendo do banco, a revogação é imediata.

**6. O que acontece se dois operadores atribuírem o mesmo motorista ao mesmo tempo?**
Ambos passam pela checagem em código. O **índice único parcial** do banco recusa o segundo insert; o filtro traduz o erro `P2002` em 409. Testado com duas requisições simultâneas: sempre um 201 e um 409.

**7. Por que regras no banco (`CHECK`, índice parcial) se já validamos no código?**
Defesa em profundidade. O código dá mensagens claras; o banco garante a integridade contra bugs e concorrência.

**8. Qual a diferença entre 403 e 409 neste projeto?**
403: o papel não pode fazer aquilo nunca (motorista cancelando). 409: o papel poderia, mas o **estado atual** não permite (entregar sem comprovante).

**9. Por que validar o tipo do upload pelos magic bytes?**
`Content-Type` e extensão são controlados por quem envia. O conteúdo real não mente. Um `.html` disfarçado de `.png` é barrado.

**10. Como evitou *path traversal* no upload?**
O nome em disco é um UUID gerado pelo servidor. O nome original só vai para metadados e é sanitizado. Nunca entra no caminho.

**11. Como a integração de CEP falha de forma controlada?**
Timeout vira 504; erro do provedor ou resposta inválida vira 502; CEP inexistente vira 404. Nenhum detalhe interno vaza, e nada é gravado se a consulta falhar.

**12. O que faz o seu Interceptor e por que não tem regra de negócio?**
Loga uma linha JSON por requisição e devolve `X-Request-Id`/`X-Response-Time`. É preocupação transversal de observabilidade; regra de negócio fica nos services.

**13. Como garante que a senha nunca aparece numa resposta?**
Colunas sensíveis nunca são selecionadas (`select` explícito); e há um teste que varre 14 rotas procurando `passwordHash` e hashes bcrypt.

**14. Por que `forbidNonWhitelisted: true`?**
Impede *mass assignment*: enviar `role: "ADMIN"` no cadastro dá 400 em vez de ser aceito ou ignorado em silêncio.

**15. O que é a `updateMany` com `status` no `WHERE`?**
Modificação otimista: só atualiza se o estado ainda for o que li. Se outra requisição mudou, afeta 0 linhas e respondo 409 em vez de sobrescrever.

**16. Por que usar transação na atribuição?**
Criar a entrega, gravar o histórico e mudar o pedido têm de acontecer juntos. Sem transação, uma falha no meio deixaria o sistema inconsistente.

**17. Como o Prisma 7 difere do 6?**
URL no `prisma.config.ts`; generator `prisma-client` com `output` obrigatório; driver adapter obrigatório (`@prisma/adapter-pg`); `.env` carregado manualmente.

**18. Por que o veículo não tem status `IN_USE`?**
"Em uso" é derivável de existir uma entrega ativa. Guardar duplicaria a informação e ela poderia divergir.

**19. Como você testou que a API funciona de verdade e não só que compila?**
253 testes (85 unitários, 168 de integração com banco real), build em clone limpo, execução real com seed e a API real do ViaCEP, e testes das constraints direto no banco. Além disso, uma varredura dedicada de bugs (seção 17) achou e corrigiu 4 defeitos reais que nenhum teste anterior cobria.

**20. Quais são as limitações do projeto?**
Uploads em disco local (produção com várias instâncias pede armazenamento de objetos); sem *rate limiting* no login; CPF/CNPJ só validados por tamanho; sem Swagger/Docker.

**21. Para que serve a `X-API-KEY` se já existe JWT?**
São credenciais de níveis diferentes. O JWT identifica o **usuário** logado; a `X-API-KEY` identifica o **cliente/integração** que está chamando a API, mesmo antes de saber se há alguém logado. Por isso ela é exigida em toda rota — até nas públicas, como `/health` e `/auth/login` — e um guard não substitui o outro: os dois têm que passar.

**22. Numa revisão de bugs, você achou que `PATCH /vehicles/:id` deixava reduzir a capacidade do veículo abaixo do peso de uma entrega já em andamento. Por que isso é um bug, e como você provou antes de corrigir?**
É um bug porque a regra "veículo não pode receber atribuição incompatível" só era aplicada no momento de **atribuir** (`POST /deliveries`); editar o veículo *depois* de atribuído não revalidava nada, deixando o sistema num estado que a própria regra deveria proibir. Antes de corrigir, escrevi um teste que fazia exatamente esse PATCH e esperava `409` — rodei e confirmei que ele falhava (a API aceitava, `200`), só então implementei a checagem e reexecutei o teste para confirmar que passava. Provar o bug com um teste que falha, antes de corrigir, evita "consertar" algo que na verdade já funcionava.

**23. No Swagger, você definiu que toda rota exige X-API-KEY e Bearer ao mesmo tempo. Como isso é expresso no OpenAPI, e o que quase deu errado?**
No OpenAPI, um requisito de segurança é uma lista de alternativas (OR); dentro de um mesmo item da lista, cada chave é uma exigência simultânea (AND). Para expressar "as duas ao mesmo tempo", usei um único objeto com as duas chaves — `[{ ApiKey: [], JWT: [] }]` — como padrão do documento inteiro. Quase estraguei isso ao colocar `@ApiBearerAuth('JWT')` em quase todos os controllers: como a segurança de uma *operação* específica substitui (não soma) o padrão do documento, isso fazia a doc dessas rotas mostrar só "exige JWT", escondendo a X-API-KEY. A aplicação continuava correta (o guard real nunca dependeu disso); só a documentação estava errada. Corrigi removendo esses decorators redundantes e deixando as rotas herdarem o padrão global — só as 3 rotas de fato públicas para JWT (`/health`, `/auth/register`, `/auth/login`) têm uma sobrescrita explícita, e só com a X-API-KEY.

---

## 19. Exercícios

Faça sozinho para fixar; as dicas indicam onde mexer. Rode `npm run test:all` ao final: se algo quebrou, os testes dizem o quê.

**Fácil**

1. **Novo tipo de veículo `BICYCLE`.** Dica: enum no `schema.prisma` → `npx prisma migrate dev --name add_bicycle` → `LICENSE_ALLOWED_VEHICLES` em `delivery.rules.ts` (bicicleta não exige CNH: como modelar isso?). Pense: o que fazer com a tabela `LICENSE_ALLOWED_VEHICLES` que é indexada por categoria da CNH?
2. **Novo tipo de ocorrência `ADDRESS_NOT_FOUND`.** Dica: só o enum + migration. Por que não precisa mexer em nenhum service?
3. **Aumentar o limite de upload para 10 MB.** Dica: onde isso é configurado? (Resposta: `.env`, sem tocar em código.)

**Médio**

4. **Endpoint `GET /deliveries/stats`** (staff): total de entregas por status. Dica: `prisma.delivery.groupBy({ by: ['status'], _count: true })`. Atenção à ordem das rotas (`stats` antes de `:id`, senão o `ParseUUIDPipe` devolve 400). Escreva o teste antes. Depois de criar, documente-o no Swagger (`@ApiTags`, `@ApiOperation`, um `StatsResponseDto` novo) e confira em `/docs` se apareceu certo — e se herdou a segurança padrão (ApiKey+JWT) sem precisar declarar nada.
5. **Impedir atribuir motorista de CNH "vence em menos de 30 dias".** Dica: nova regra em `findAssignmentConflicts` + testes unitários (é função pura). Decida: bloquear ou só avisar?
6. **Permitir ao cliente editar `description` de pedido `PENDING`.** Dica: DTO de update com `@IsOptional`, `updateMany` com `status: PENDING` no `WHERE`. E se o pedido já foi agendado? (409.)
7. **Permitir mais de uma `API_KEY` válida** (uma por integração/cliente, ex.: `API_KEYS="chaveA,chaveB"`). Dica: `ApiKeyGuard` passa a comparar contra uma lista; cuidado para continuar em tempo constante contra **cada** chave, não parar no primeiro `for` que "parece" bater.

**Difícil**

8. **Rate limiting no login** (5 tentativas/minuto por IP). Dica: `@nestjs/throttler`. Como testar sem esperar um minuto?
9. **Refresh token.** Dica: novo modelo `RefreshToken` (hash do token, expiração, revogado); rotação a cada uso. Que ataque a rotação mitiga?
10. **Trocar o disco local por armazenamento de objetos** mantendo a interface de `saveProof/readProof`. Dica: extraia uma interface `FileStorage` e injete a implementação. Por que isso é mais fácil de testar?

---

## 20. Glossário

| Termo | Significado |
|---|---|
| **API REST** | interface HTTP em que recursos têm URLs e verbos (GET, POST, PATCH, DELETE) |
| **API Key** | credencial simples (uma string) que identifica um cliente/integração, não uma pessoa; comparada diretamente, sem login |
| **OpenAPI** | especificação (formato JSON/YAML) que descreve uma API REST: rotas, parâmetros, formatos de request/response, segurança. "Swagger" é o nome mais usado para o conjunto de ferramentas (UI, geradores) em torno dessa especificação |
| **Security requirement (OpenAPI)** | lista de alternativas (OR); dentro de um item da lista, várias chaves juntas = exigidas ao mesmo tempo (AND). Um requisito por **operação** substitui o padrão do documento, nunca soma a ele |
| **DTO** | *Data Transfer Object*: molde do que entra/sai pela API |
| **DI** | *Dependency Injection*: o framework cria e entrega as dependências das classes |
| **Guard** | decide se a requisição prossegue (autenticação/autorização) |
| **Pipe** | valida/transforma parâmetros |
| **Interceptor** | código antes/depois do handler (log, tempo, cache) |
| **Filter** | converte exceções em resposta HTTP |
| **JWT** | token assinado com identidade; não é criptografado, só protegido contra adulteração |
| **bcrypt** | hash de senha lento e com *salt* |
| **RBAC** | *Role-Based Access Control*: acesso por papel |
| **IDOR** | *Insecure Direct Object Reference*: acessar recurso alheio trocando o ID; mitigado filtrando pelo dono |
| **Mass assignment** | cliente define campos que não devia (ex.: `role`) |
| **Enumeração de usuários** | descobrir quais contas existem por diferenças de resposta/tempo |
| **Path traversal** | usar `../` num nome de arquivo para escrever/ler fora da pasta prevista |
| **Magic bytes** | primeiros bytes de um arquivo, que identificam seu formato |
| **Comparação em tempo constante** | comparar dois segredos sem deixar o tempo de execução revelar em qual posição eles diferem (`timingSafeEqual`) |
| **Migration** | script versionado que altera o esquema do banco |
| **Índice parcial** | índice que só cobre linhas que satisfazem uma condição |
| **CHECK constraint** | regra que o banco impõe sobre os dados de uma linha |
| **Transação** | conjunto de operações que se aplicam todas ou nenhuma |
| **Condição de corrida** | resultado depende de qual de duas operações simultâneas termina primeiro |
| **Modificação otimista** | atualizar só se o dado não mudou desde que foi lido |
| **Idempotente** | repetir a operação produz o mesmo efeito que fazer uma vez |
| **Observable / RxJS** | fluxo de valores assíncronos; o `HttpService` do Nest devolve um |
| **Mock** | substituto controlado de uma dependência externa, usado em testes |
| **Teste unitário × integração** | isolado e rápido × várias partes reais juntas |
| **Gateway Timeout (504) × Bad Gateway (502)** | o servidor de trás demorou demais × respondeu errado ou não respondeu |

---

## 21. Adendo (24/09/2026): Swagger completo

Extensão pedida depois da entrega original ("implemente o swagger completo"). Documentação interativa em `/docs` (JSON em `/docs-json`), cobrindo os 44 endpoints, os 44 schemas de request/response, e as duas credenciais exigidas por rota.

### 21.1 O plugin do Nest CLI: documentação por inferência, não por decorator

A forma manual de usar `@nestjs/swagger` é decorar **cada campo** de **cada DTO** com `@ApiProperty({...})`. Com ~35 DTOs isso seria centenas de decorators repetindo informação que o `class-validator` já tem. Em vez disso, ligamos o **plugin de compilação** do Nest:

```json
// nest-cli.json
{
  "compilerOptions": {
    "plugins": [{ "name": "@nestjs/swagger", "options": { "classValidatorShim": true, "introspectComments": true } }]
  }
}
```

Ele roda durante o `nest build` (não em runtime) e reescreve cada classe de DTO, acrescentando um método estático:

```ts
// como o DTO foi escrito
export class CreateVehicleDto {
  @Matches(PLATE_PATTERN) plate: string;
  @IsNumber() @IsPositive() @Max(100000) capacityKg: number;
}

// o que o plugin gera no dist/ (simplificado)
export class CreateVehicleDto {
  plate; capacityKg;
  static _OPENAPI_METADATA_FACTORY() {
    return {
      plate: { required: true, type: () => String },
      capacityKg: { required: true, type: () => Number, minimum: 0, maximum: 100000 },
    };
  }
}
```

`SwaggerModule` lê esse método em runtime para montar o schema. `classValidatorShim: true` é o que faz ele também olhar os decorators de validação (`@Max`, `@MinLength`, `@Matches`...) e traduzir para as restrições equivalentes do OpenAPI (`maximum`, `minLength`, `pattern`...). **Resultado prático:** documentei ~35 DTOs sem escrever um `@ApiProperty` sequer neles — só os enums do Prisma precisaram de anotação manual (próxima seção).

Comprovamos isso na prática: inspecionamos o `.js` compilado de um DTO e vimos o método gerado, antes de confiar no mecanismo para os outros 34.

### 21.2 Por que os enums do Prisma precisam de decorator manual

```ts
export class VehicleResponseDto {
  @ApiProperty({ enum: VehicleType })   // sem isso, o plugin não sabe que é um enum
  type: VehicleType;
}
```

O Prisma 7 gera seus "enums" como um objeto congelado (`export const VehicleType = { CAR: 'CAR', ... } as const`), não como um `enum` nativo do TypeScript. O plugin do Nest detecta automaticamente `enum` nativo; o padrão do Prisma é só um tipo derivado (`typeof VehicleType[keyof typeof VehicleType]`), que para o compilador é indistinguível de `string`. Por isso, todo campo tipado com um desses pseudo-enums (`Role`, `VehicleType`, `VehicleStatus`, `OrderStatus`, `DeliveryStatus`, `OccurrenceType`, `LicenseCategory`) tem seu `@ApiProperty({ enum: ... })` explícito — sem isso, o Swagger mostraria só `type: string`, sem a lista de valores possíveis.

### 21.3 Duas credenciais, uma regra de segurança

```ts
const config = new DocumentBuilder()
  .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
  .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-KEY' }, 'ApiKey')
  .build();

const document = SwaggerModule.createDocument(app, config);
document.security = [{ ApiKey: [], JWT: [] }];   // padrão: as duas, sempre
```

No OpenAPI, um requisito de segurança é uma **lista de alternativas** (troque `A` por `B` e o requisito mesmo assim é satisfeito = OR). Dentro de **um único objeto** da lista, cada chave é uma exigência **simultânea** (AND). `[{ ApiKey: [], JWT: [] }]` — um objeto só, duas chaves — significa "as duas, sempre", que é exatamente o comportamento real da API. Se eu tivesse escrito `[{ ApiKey: [] }, { JWT: [] }]` (dois objetos), o significado seria "uma ou outra", errado.

As 3 rotas que só exigem a API key (`/health`, `/auth/register`, `/auth/login`) sobrescrevem esse padrão:

```ts
@Public()                    // dispensa o JwtAuthGuard de verdade
@ApiSecurity('ApiKey')       // e documenta que só falta essa credencial
@Post('login')
login(@Body() dto: LoginDto) { ... }
```

### 21.4 O bug que quase passou: security de operação substitui, não soma

Na primeira versão, decorei a **classe** de quase todos os controllers com `@ApiBearerAuth('JWT')`, pensando em deixar explícito "esta rota pede login". Gerei o JSON depois e conferi:

```json
"paths": { "/orders": { "get": { "security": [{ "JWT": [] }] } } }
```

Só "JWT" — a X-API-KEY sumiu da documentação dessa rota! O motivo: no OpenAPI, o `security` de uma **operação** específica **substitui inteiramente** o padrão do documento, não soma a ele. Qualquer decorator de segurança em uma rota (`@ApiBearerAuth`, `@ApiSecurity`) cria essa substituição — mesmo que a intenção fosse só "reforçar" que o JWT é necessário. Como eu tinha isso em 8 controllers, praticamente toda a documentação da API estava dizendo "só precisa de JWT", quando na realidade (e nos testes, que continuavam passando) a X-API-KEY sempre foi exigida por um guard separado que nunca mudou.

A correção: remover os decorators redundantes e deixar cada operação **herdar** o padrão do documento. Só as 3 rotas genuinamente diferentes (que dispensam o JWT) têm uma sobrescrita, e ela é mínima: só o que muda.

**A lição, que já apareceu de outra forma na seção 17:** o código real (o guard) nunca mentiu — a superfície que mentia era a documentação, gerada por decorators que eu escrevi por engano. **Ler a saída de verdade** (o JSON gerado) achou um problema que ler o código-fonte, sozinho, não mostrava.

### 21.5 Por que `/docs` não pede X-API-KEY

`SwaggerModule.setup('docs', app, document)` registra as rotas de `/docs` e `/docs-json` **direto no adapter Express**, por fora do sistema de controllers/guards do Nest. Isso significa que o `ApiKeyGuard` — que é um `APP_GUARD` do Nest, e só intercepta rotas que passam pelo pipeline do Nest — nunca chega a rodar para essas duas rotas. Foi uma verificação empírica, não suposição: chamamos `/docs-json` sem nenhum cabeçalho e recebemos `200`.

Decisão consciente: como essas rotas só expõem a **descrição** da API (nenhum dado do domínio), deixamos assim. Um teste (`swagger.e2e-spec.ts`) trava esse comportamento, para não virar surpresa se alguém "corrigir" isso sem querer no futuro.

### 21.6 DTOs de resposta: por que criar classes novas em vez de reusar os de entrada

Os DTOs que já existiam (`CreateOrderDto`, `UpdateVehicleDto`...) descrevem o que **entra**. O que os services **devolvem** é moldado pelo `select`/`include` do Prisma, que não é uma classe TypeScript — é um objeto de configuração. Para o Swagger documentar a resposta, criamos uma classe por formato de saída (`OrderResponseDto`, `DeliveryResponseDto`...), copiando fielmente os mesmos campos que o `select`/`include` real devolve. Não é duplicação por acaso: é a mesma razão de sempre para ter um DTO — a resposta da API é um contrato, e um contrato precisa de um nome e um formato próprios, mesmo que hoje coincida com a saída do Prisma.

Um caso interessional: `DeliveriesService.toView()` devolve um formato **diferente** para `CUSTOMER` (motorista e veículo reduzidos, sem `assignedBy`) do que para o resto. O OpenAPI não tem um jeito elegante de dizer "a forma da resposta depende de quem pergunta" sem complicar demais o schema; a solução pragmática foi documentar o formato completo (staff) e explicar a redução na **descrição** da operação (`@ApiOperation({ description: '...' })`) — sinceridade sobre uma limitação da ferramenta, em vez de fingir que não existe.

### 21.7 Reaproveitando documentação repetida

Sem cuidado, cada um dos 44 endpoints repetiria a mesma documentação de erro (`400`, `401`, `403`...) e cada endpoint paginado repetiria a mesma forma `{ data, meta }`. Dois decorators compostos (`applyDecorators`, um recurso do Nest para "empacotar" vários decorators em um só) resolvem isso:

```ts
@ApiErrorResponses(400, 401, 403, 404, 409)   // em vez de 5 @ApiResponse repetidos
@ApiPaginatedResponse(VehicleResponseDto)      // em vez de escrever o schema { data, meta } à mão
@Get()
findAll(@Query() query: ListVehiclesDto) { ... }
```

**A lição:** o Swagger "completo" não significa "verboso" — as mesmas ideias de reaproveitamento que valem para o código de negócio (funções puras, decorators de erro no filtro global) valem para a documentação também.
