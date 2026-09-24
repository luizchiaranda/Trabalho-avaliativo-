# Relatório Técnico — API de Logística e Entregas

**Avaliação de 5 dias · NestJS + TypeScript + PostgreSQL + Prisma 7.10.0**
Data de conclusão: 21/09/2026 · Adendo (`X-API-KEY`): 22/09/2026

---

## 1. Resumo

Foi entregue uma API REST completa para logística e entregas, com **41 endpoints**, 4 perfis de acesso, fluxo de estados com histórico, atribuição com regras de compatibilidade, upload de comprovante e integração externa de CEP.

| Indicador | Resultado |
|---|---|
| `npm run build` | ✅ sem erros (também em clone limpo, sem `.env` e sem client gerado) |
| Lint (oxlint, com tipos) | ✅ 0 avisos, 0 erros |
| Testes unitários | ✅ **85 / 85** |
| Testes de integração (banco real) | ✅ **168 / 168** |
| Schema Prisma × banco | ✅ sem divergência (`migrate diff` vazio) |
| Verificação manual com a API real do ViaCEP | ✅ |
| Código de aplicação | 67 arquivos, ~2.750 linhas |
| Código de teste | 17 arquivos, ~2.700 linhas |

---

## 2. Cobertura do enunciado

### 2.1 Stack e conteúdos obrigatórios

| Requisito | Status | Onde |
|---|:-:|---|
| NestJS + TypeScript | ✅ | Nest 12, TypeScript estrito |
| PostgreSQL | ✅ | PostgreSQL 18 |
| Prisma 7.10.0 (versão exata) | ✅ | `package.json` fixa `prisma`, `@prisma/client`, `@prisma/adapter-pg` em `7.10.0` |
| `prisma.config.ts`, driver adapter, migrations | ✅ | `prisma.config.ts`, `src/prisma/prisma.service.ts` (`PrismaPg`), `prisma/migrations/` |
| DTOs, class-validator, ValidationPipe | ✅ | `*/dto/*.ts`; pipe global em `app.module.ts` (`whitelist` + `forbidNonWhitelisted`) |
| JWT e `@CurrentUser()` | ✅ | `auth/`, `common/guards/jwt-auth.guard.ts`, `common/decorators/current-user.decorator.ts` |
| Autorização por papel/permissão | ✅ | `RolesGuard` + `@Roles()` + checagem de propriedade nos services |
| Relacionamentos Prisma | ✅ | 1-1, 1-N e N-1 entre 8 modelos, com `include`/`select`/filtros relacionais |
| Upload de arquivo | ✅ | `POST /deliveries/:id/proof` |
| HttpService | ✅ | `src/cep/cep.service.ts` |
| Pelo menos um Interceptor útil | ✅ | `LoggingInterceptor` |
| `.env` / ConfigService | ✅ | `ConfigModule` global com validação; `.env.example` |
| Helmet | ✅ | `src/app.setup.ts` |
| Compression | ✅ | `src/app.setup.ts` |
| Tratamento de 400, 401, 403, 404, 409 | ✅ | `AllExceptionsFilter` + guards + services (mais 413, 502, 504) |
| Build de produção | ✅ | `npm run build` |
| README / documentação | ✅ | `README.md` |

### 2.2 Entidades, regras e funcionalidades

| Requisito | Status | Observação |
|---|:-:|---|
| Entidades mínimas (User, Customer, DeliveryOrder, Driver, Vehicle, Delivery, Occurrence) | ✅ | + entidade auxiliar `DeliveryStatusHistory` |
| Cardinalidades, constraints, enums, estados | ✅ | 7 enums; unicidades; índices parciais; `CHECK`s |
| Autenticação | ✅ | registro, login, `/auth/me` |
| CRUD das entidades administrativas | ✅ | usuários, motoristas, veículos (clientes: consulta) |
| Operações do usuário autenticado | ✅ | `/customers/me`, `/drivers/me`, `/auth/me`, pedidos e entregas por escopo |
| Consultas por relacionamento | ✅ | entregas por motorista/veículo/pedido; pedidos por cliente; histórico; ocorrências |
| Fluxo de estados do domínio | ✅ | entrega e pedido sincronizados |
| Histórico | ✅ | `DeliveryStatusHistory`, gravado na mesma transação da mudança |
| Motorista/veículo sem atribuições incompatíveis | ✅ | 7 regras de conflito; ver seção 3 |
| Somente responsável autorizado atualiza | ✅ | motorista responsável; operador/admin só cancelam |
| Referências inexistentes tratadas | ✅ | 404 |
| Operações incompatíveis com o estado rejeitadas | ✅ | 409 |
| Dados sensíveis fora das respostas | ✅ | varredura automatizada em 14 rotas |
| Operações pessoais usam a identidade autenticada | ✅ | `@CurrentUser()` / `/me` |
| Endpoints documentados (método, URL, permissão, body, respostas) | ✅ | README, seção 11 |

### 2.3 Upload, integração, interceptor, segurança

| Requisito | Status |
|---|:-:|
| Upload de comprovante ligado ao domínio (sem comprovante não há `DELIVERED`) | ✅ |
| Valida presença, tamanho e tipo (por conteúdo, não só pelo cabeçalho) | ✅ |
| HttpService para CEP, URL/timeout do ambiente, erros e timeout tratados | ✅ |
| Interceptor documentado, sem regra de negócio | ✅ |
| JWT secret por ambiente, `.env` fora do Git, rotas privadas, logs sem segredos, senhas nunca retornadas | ✅ |

### 2.4 Bônus (feitos somente depois do obrigatório)

| Bônus | Status |
|---|:-:|
| Paginação, filtros e ordenação | ✅ |
| Seed | ✅ |
| Testes automatizados | ✅ |
| Swagger | ✅ implementado (adendo 24/09/2026, seção 11) |
| Docker | ❌ não implementado |
| Indicadores do domínio | ❌ não implementado |

---

## 3. Decisões de arquitetura relevantes

1. **Pedido × Entrega.** O pedido é a demanda; a entrega é uma tentativa de execução. Um pedido tem N entregas, mas só uma ativa. Falha ou cancelamento devolve o pedido para `PENDING`, sem perder o histórico.
2. **Regras críticas em duas camadas.** O service valida e devolve mensagens claras; o banco garante a integridade mesmo sob concorrência ou falha de código: índices únicos **parciais** (1 entrega ativa por pedido, motorista e veículo) e `CHECK`s (DELIVERED exige comprovante; estado final ⇔ `finishedAt`; pesos positivos; CEP com 8 dígitos).
3. **Recurso de terceiro → 404.** Não revela que o recurso existe. 403 fica reservado a "seu papel não permite".
4. **Papel lido do banco a cada requisição**, não do token: desativar um usuário derruba o acesso imediatamente.
5. **Rotas privadas por padrão.** Guards globais; só `@Public()` libera (`/health`, `/auth/register`, `/auth/login`). Uma rota nova esquecida não fica aberta.
6. **Modificação otimista.** Mudança de estado usa `updateMany({ where: { id, status: <lido> } })`; se outra requisição alterou antes, retorna 409 em vez de sobrescrever.
7. **Estado "em uso" do veículo é derivado**, não armazenado — evita duas fontes da verdade.
8. **Mensagens de 409 completas.** A atribuição devolve *todos* os motivos de incompatibilidade de uma vez, não só o primeiro.

---

## 4. Testes

### 4.1 Testes de integração (168) — banco PostgreSQL real, banco de teste separado

| Arquivo | Testes | Foco |
|---|:-:|---|
| `delivery-flow.e2e-spec.ts` | 3 | Fluxo completo com histórico; falha e reagendamento; cancelamento |
| `api-key.e2e-spec.ts` | 8 | `X-API-KEY` exigida em toda rota, inclusive públicas; não substitui nem é substituída pelo JWT |
| `auth.e2e-spec.ts` | 31 | Registro, login, `/me`, 400/401/409, mass assignment |
| `authorization.e2e-spec.ts` | 31 | Matriz de papéis (403) e acesso a recursos de terceiros |
| `business-rules.e2e-spec.ts` | 54 | 404, 400, 409 de atribuição, de estado e de compatibilidade pós-atribuição, 413 de corpo grande, concorrência, filtros e paginação |
| `upload.e2e-spec.ts` | 15 | Upload válido e inválido, path traversal, download |
| `cep-integration.e2e-spec.ts` | 10 | Integração funcionando e falhando de forma controlada |
| `security.e2e-spec.ts` | 11 | Helmet, Compression, Interceptor, dados sensíveis, formato de erro |
| `swagger.e2e-spec.ts` | 5 | `/docs` e `/docs-json` acessíveis sem X-API-KEY; segurança padrão (ApiKey+JWT) vs. rotas públicas (só ApiKey); os 41 endpoints documentados |

### 4.2 Testes unitários (85)

| Arquivo | Testes | Foco |
|---|:-:|---|
| `delivery.rules.spec.ts` | 48 | Máquina de estados e conflitos de atribuição |
| `cep.service.spec.ts` | 14 | Todos os caminhos de erro do provedor (`HttpService` simulado) |
| `file-signature.spec.ts` | 10 | Detecção de tipo por conteúdo |
| `env.validation.spec.ts` | 6 | Validação de ambiente |
| `password.spec.ts` | 6 | Hash e regra de senha |

### 4.3 Requisito → evidência

| Exigido pela avaliação | Evidência |
|---|---|
| Fluxo principal com sucesso | `delivery-flow` → "executa o fluxo completo" |
| Body inválido → 400 | `auth`, `business-rules` (pedido, veículo, atribuição, paginação, JSON malformado) |
| Sem token / token inválido → 401 | `auth`: sem token, esquema errado, malformado, assinatura falsa, expirado, usuário inexistente, usuário desativado |
| Sem permissão → 403 | `authorization`: 17 combinações papel × rota |
| Recurso inexistente → 404 | `business-rules`: 6 recursos + referências na atribuição |
| Conflito de regra → 409 | `business-rules`: 12+ cenários, incluindo condição de corrida real |
| Acesso a recurso de terceiro | `authorization`: pedidos, entregas, histórico, ocorrências, comprovante, uploads |
| Upload válido e inválido | `upload`: PNG/JPEG/PDF válidos; ausente, vazio, tipo errado, conteúdo falso, tipo divergente, grande demais, estado errado |
| Integração externa funcionando e falhando | `cep-integration`: sucesso, 404, 504, 502 (erro 500, resposta inválida, provedor fora do ar) |
| Fluxo completo de mudança de estado | `delivery-flow` + `delivery.rules.spec` |

**Teste de concorrência:** duas atribuições simultâneas do mesmo motorista a pedidos diferentes resultam sempre em exatamente um `201` e um `409`, e o banco termina com uma única entrega ativa. Isso comprova o índice parcial, não apenas a checagem em código.

---

## 5. Verificações realizadas além dos testes

| Verificação | Resultado |
|---|---|
| Build em "clone limpo" (sem `.env`, sem `src/generated`, sem `dist`) | ✅ |
| `prisma migrate diff` entre schema e banco | vazio (sem divergência) |
| `migrate deploy` em banco inexistente | cria o banco e aplica a migration |
| 12 casos de constraint direto no banco (transação desfeita) | ✅ todos rejeitados/aceitos como esperado |
| Aplicação real com seed + ViaCEP real | ✅ pedido criado com endereços do provedor |
| `npm run start`, `npm run start:prod` | ✅ sobem e respondem `/health` |
| Log estruturado da aplicação em execução | ✅ uma linha JSON por requisição |

---

## 6. Problemas encontrados durante o desenvolvimento (e corrigidos)

Registrados aqui por transparência e porque cada um ensina algo.

| # | Problema | Como foi encontrado | Correção |
|---|---|---|---|
| 1 | `prisma init` criou arquivos indesejados (`prisma7.config.ts` com nome errado e pastas de "skills") | Inspeção da pasta | Removidos; config criada com o nome correto |
| 2 | `env('DATABASE_URL')` no `prisma.config.ts` faz `prisma generate` e `npm run build` falharem **sem `.env`** (situação de quem clona o projeto) | Teste em clone limpo | Trocado por `process.env[...]` |
| 3 | Hash "falso" usado contra enumeração de contas era uma string inválida (comparação retornaria rápido, anulando a proteção) | Revisão de código antes dos testes | Hash bcrypt real gerado na inicialização |
| 4 | Testes chamavam o ViaCEP real: o `ConfigModule` lê o ambiente **no import** do `AppModule`, antes de o teste definir a URL do mock | Falha de timeout (504) nos testes | URL do mock definida em `test.env` do vitest, com porta fixa |
| 5 | Mensagem de 409 de unicidade saía genérica: o formato do erro `P2002` com driver adapter é `constraint.index`, não `meta.target` | Teste "placa duplicada" | Filtro passou a ler `constraint.index` e derivar o campo |
| 6 | `@IsUrl` aceitava `nao-e-url` como host válido; uma `CEP_API_BASE_URL` sem `http://` passaria na inicialização e quebraria em runtime | Teste unitário de validação de ambiente | `require_protocol: true` com `http`/`https` |
| 7 | Aviso de lint `no-misused-spread`: instâncias de DTO eram espalhadas só para injetar um filtro. Além do aviso, um `?driverId=` na query podia sobrescrever o escopo | Lint | Parâmetro `scope` explícito, combinado por `AND` |
| 8 | Defeitos dos próprios testes: pasta de upload compartilhada entre specs; query desconhecida rejeitada (correto) pelo `forbidNonWhitelisted`; requisições supertest simultâneas sobre o mesmo servidor | Falhas de teste | Testes corrigidos; comportamento da API estava certo |

---

## 7. Limitações e evolução

**Limitações conhecidas**

- Comprovantes ficam em disco local. Com várias instâncias da API, o correto é armazenamento de objetos (S3 ou equivalente).
- Sem *rate limiting* (proteção contra força bruta no login).
- CPF/CNPJ validados por tamanho, sem dígitos verificadores.
- O provedor real de CEP só foi exercitado manualmente; a suíte automatizada usa um mock local para ser determinística.
- Docker e indicadores do domínio (bônus) não foram implementados.
- A página do Swagger (`/docs`) fica acessível sem `X-API-KEY` (limitação de como `SwaggerModule.setup()` registra suas rotas — ver seção 11 abaixo); é decisão consciente, não descuido, mas vale mencionar numa entrega real.

**Próximos passos naturais:** rate limiting no login, refresh token, armazenamento de objetos, `docker-compose` com PostgreSQL, indicadores (entregas por status, tempo médio por rota, taxa de falha por motorista).

---

## 8. Como reproduzir

```bash
npm install
cp .env.example .env          # ajustar DATABASE_URL, JWT_SECRET e API_KEY
npx prisma migrate deploy
npm run seed
npm run build
npm test                      # 85 unitários
npm run test:e2e              # 168 de integração (cria o banco <nome>_test sozinho)
npm run start:prod
# documentação interativa em http://localhost:3000/docs
```

Detalhes completos no `README.md`.

---

## 9. Adendo (22/09/2026): `X-API-KEY` em todas as rotas

Extensão solicitada **além** do enunciado original: toda requisição, **sem exceção** (inclusive `GET /health` e as rotas de autenticação), passou a exigir o cabeçalho `X-API-KEY`, validado por um guard global (`ApiKeyGuard`) aplicado **antes** de qualquer verificação de JWT ou papel.

**O que mudou:**

- Nova variável obrigatória `API_KEY` (mínimo 20 caracteres), validada na inicialização como as demais.
- `src/common/guards/api-key.guard.ts`: compara o cabeçalho recebido com a chave do ambiente usando `crypto.timingSafeEqual` (comparação em tempo constante, para não vazar a chave por diferença de tempo de resposta), e responde `401 "Chave de API ausente ou inválida"` quando falha.
- Registrado como `APP_GUARD` global em `app.module.ts`, então nenhuma rota fica de fora, mesmo as marcadas com `@Public()` para o JWT.
- README, `.env.example` e exemplos de requisição atualizados para refletir o novo requisito.

**Testes:** novo arquivo `api-key.e2e-spec.ts` (8 casos): ausência, chave errada, rota pública sem a chave, controle positivo, e a prova de que a chave de API e o JWT são **camadas independentes** (uma correta não dispensa a outra). Os 150 testes já existentes precisaram de um pequeno ajuste de infraestrutura — não de lógica —, descrito a seguir.

**Impacto na suíte de testes existente:** como a chave passou a ser exigida em toda rota, todas as chamadas de teste precisavam passar a enviá-la. Em vez de editar cabeçalho por cabeçalho, criamos um wrapper (`api()` em `test/helpers/factories.ts`) que substitui `request(ctx.server)` e já anexa a chave de teste automaticamente; os testes que **isolam** intencionalmente a ausência de credenciais (por exemplo, "sem token") continuam usando o `request` bruto do Supertest, para que essa mudança não interferisse na verificação que já existia. Resultado: 85 testes unitários e 158 de integração passando, com o mesmo build limpo e lint sem avisos.

**Observação para uso:** como a chave agora é exigida até em `/health`, qualquer verificação de disponibilidade (load balancer, monitoramento) precisa ser configurada para enviar o cabeçalho.

---

## 10. Adendo (22/09/2026): varredura de bugs

Passo dedicado a procurar defeitos não cobertos pelos 243 testes existentes até então: releitura crítica dos services em busca de regras de negócio incompletas, e experimentos reais (HTTP contra o build de produção, com o banco de desenvolvimento) em cenários não exercitados pelos testes automatizados. Cada suspeita foi primeiro **provada com um teste que falha** antes de qualquer correção — nenhuma mudança de comportamento foi feita "no escuro".

**Bugs confirmados e corrigidos:**

| # | Bug | Como foi achado | Correção |
|---|---|---|---|
| 1 | `PATCH /vehicles/:id` aceitava reduzir `capacityKg` abaixo do peso de um pedido já em entrega ativa naquele veículo | Releitura de `VehiclesService.update` — a checagem de compatibilidade só existia na *atribuição*, nunca na *edição* posterior | Nova checagem: se há entrega ativa, `capacityKg` não pode ficar abaixo do peso do pedido em curso → `409` |
| 2 | `PATCH /vehicles/:id` aceitava trocar `type` para um tipo que a CNH do motorista da entrega ativa não habilita | Mesma releitura, mesmo padrão do bug 1 | Nova checagem simétrica: `type` novo precisa continuar compatível com a CNH do motorista em curso → `409` |
| 3 | `PATCH /drivers/:id` aceitava trocar `licenseCategory` para uma categoria que não habilita o veículo da entrega ativa do motorista | Mesma releitura, lado motorista | Nova checagem: `licenseCategory` novo precisa continuar compatível com o veículo em curso → `409` |
| 4 | Um corpo JSON acima do limite do `body-parser` (100 KB, padrão do Express) retornava **500 Internal Server Error**, não `413`, e ainda registrava como se fosse falha do servidor | Teste manual com `curl` de um payload de 200 KB contra o build real; confirmado com um log de debug temporário que o `PayloadTooLargeError` do Express não é uma `HttpException` do Nest, então caía no branch padrão do filtro | `AllExceptionsFilter` passou a reconhecer esse erro específico (`error.type === 'entity.too.large'`) e traduzir para `413` com mensagem limpa |

Os bugs 1–3 são do mesmo tipo: a regra "motorista/veículo não podem ter atribuições incompatíveis" era aplicada só no momento de atribuir, não quando um cadastro já atribuído era editado depois. O bug 4 é de infraestrutura (tratamento de erro), não de regra de negócio, mas tinha o mesmo efeito prático ruim: uma resposta 500 esconde do cliente da API que o problema é dele (corpo grande demais), e polui os logs como se fosse defeito do servidor.

**Uma suspeita investigada e descartada:** ao revisar `delivery.rules.ts`, pareceu que `DeliveryStatus.ASSIGNED` sobrando em `DRIVER_TARGET_STATUSES` era código morto (nenhuma transição do mapa leva a esse estado). Ao remover, um teste existente quebrou: o motorista que pede `status: "ASSIGNED"` precisa continuar recebendo `409` ("transição inválida"), não `403` ("papel sem permissão") — a distinção correta é que o estado pedido nunca é alcançável por ninguém através desse endpoint, o que é um problema de fluxo, não de permissão. A remoção foi revertida, com um comentário explicando a decisão para o próximo leitor.

**Testes:** os 4 novos cenários (3 de compatibilidade pós-atribuição + 1 de payload grande) foram adicionados a `business-rules.e2e-spec.ts`, incluindo um controle positivo (a mesma mudança é aceita normalmente quando não há entrega ativa). Total após esta varredura: **85 unitários + 163 de integração = 248 testes**, lint sem avisos, build limpo, e as três correções também verificadas manualmente contra o banco de desenvolvimento real (não só o de teste).

---

## 11. Adendo (24/09/2026): Swagger completo

Bônus implementado: documentação interativa OpenAPI 3 em `/docs` (JSON em `/docs-json`), cobrindo os 41 endpoints.

**Como foi montado, para não virar 41 arquivos de decorators manuais:**

- **Plugin `@nestjs/swagger` do Nest CLI** (`nest-cli.json`, opção `classValidatorShim`): lê os tipos TypeScript e os decorators de `class-validator` de cada DTO em tempo de build e gera o schema sozinho (tipo, obrigatório/opcional, `minLength`/`maxLength`/`minimum`/`maximum` a partir das mesmas regras de validação já escritas). Confirmado inspecionando o `dist/` compilado: o plugin gera um método estático `_OPENAPI_METADATA_FACTORY()` por classe, em vez de decorator por campo.
- Só os **enums do Prisma** precisaram de `@ApiProperty({ enum: ... })` explícito, porque o Prisma 7 gera pseudo-enums (objeto `as const`), não um `enum` nativo do TypeScript, e o plugin só detecta automaticamente o segundo caso.
- **DTOs de resposta novos** (um por recurso, ex. `UserResponseDto`, `DeliveryResponseDto`), espelhando exatamente o `select`/`include` que cada service já usa — nenhum campo "inventado".
- **Duas credenciais no schema de segurança** (`DocumentBuilder.addBearerAuth` + `addApiKey`), com um requisito padrão único (`document.security = [{ ApiKey: [], JWT: [] }]`, um só objeto = as duas exigidas ao mesmo tempo) aplicado a toda operação por padrão; as 3 rotas públicas para JWT (`/health`, `POST /auth/register`, `POST /auth/login`) sobrescrevem isso com `@ApiSecurity('ApiKey')` para exigir só a chave.
- Um `@ApiErrorResponses(...)` e um `@ApiPaginatedResponse(...)` reutilizáveis, para não repetir a mesma documentação de erro/paginação em cada um dos 41 endpoints.

**Um bug de documentação achado e corrigido durante o trabalho:** a primeira versão colocou `@ApiBearerAuth('JWT')` na classe de 8 dos 10 controllers, pensando em "deixar claro que a rota pede login". Só que, no OpenAPI, um `security` definido na operação **substitui** o padrão do documento inteiro — não soma. Isso fazia a documentação de quase todas as rotas protegidas mostrar só "requer JWT", escondendo que a `X-API-KEY` também é obrigatória (o comportamento real da API nunca mudou, só a documentação estava incompleta). Comprovado gerando o JSON e inspecionando `paths['/orders'].get.security` antes e depois da correção. A correção foi remover esses decorators redundantes de 8 arquivos, deixando a exigência dupla ser herdada do padrão do documento.

**Decisão deliberada:** `/docs` e `/docs-json` ficam acessíveis **sem** `X-API-KEY`, porque `SwaggerModule.setup()` registra suas rotas direto no adapter Express, por fora do pipeline de guards do Nest — não dá para protegê-las com o `ApiKeyGuard` global sem uma configuração à parte, e como essas rotas não expõem nenhum dado (só a própria descrição da API), optamos por não complicar por uma exceção sem risco real. Documentado no README e testado (`swagger.e2e-spec.ts` confirma que ambas respondem 200 sem o cabeçalho).

**Testes:** novo arquivo `swagger.e2e-spec.ts` (5 casos) confirma que `/docs`/`/docs-json` carregam sem chave, que o padrão de segurança do documento é o esperado, que as 3 rotas públicas sobrescrevem corretamente, e que os 41 endpoints aparecem. Estado final: **85 unitários + 168 de integração = 253 testes**, lint sem avisos, build limpo, e a página verificada manualmente (HTML + todos os assets JS/CSS/ícones carregando) e um fluxo completo de login + listagem conferido campo a campo contra o schema documentado.
