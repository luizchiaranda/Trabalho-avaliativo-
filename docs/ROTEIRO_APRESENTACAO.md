# Roteiro de Apresentação (15 minutos)

Roteiro cronometrado para apresentar o projeto ao vivo, com demonstração pelo Swagger.
Separado de AULA.md (que é pra estudar/defender de qualquer pergunta) — este arquivo é só o
que falar e clicar, na ordem, com o relógio ao lado.

**Antes de começar:** suba o servidor (`npm run start:dev`), abra `http://localhost:3000/docs`
numa aba já carregada, e tenha o `.env` aberto em outra aba/editor pra copiar a `API_KEY`
rapidamente caso precise reautenticar. Teste a conexão com a internet — a busca de CEP usa a
API pública ViaCEP de verdade.

---

## 0:00 – 1:30 | Abertura (1min30)

Fale, sem tela de código ainda, ou com o README aberto:

> "Este projeto é uma API REST de logística e entregas, feita em NestJS 12, com Prisma 7 como
> ORM e PostgreSQL como banco. Ela cobre o ciclo completo: um cliente cria um pedido, um
> operador atribui motorista e veículo, o motorista avança o status da entrega até
> DELIVERED e envia um comprovante — uma foto ou PDF — que fica disponível pra download."

Mostre rapidamente a estrutura de pastas (`src/`) e diga:

> "São 8 módulos de domínio — auth, users, customers, drivers, vehicles, orders, deliveries,
> occurrences —, cada um com controller, service e DTOs próprios. No total, 44 endpoints, 265
> testes automatizados e documentação OpenAPI completa em `/docs`."

## 1:30 – 4:00 | Modelagem e regras de negócio (2min30)

Abra `prisma/schema.prisma`. Aponte:

- **8 modelos**, com destaque para `DeliveryOrder` → `Delivery` (1 pedido pode gerar várias
  tentativas de entrega, mas só uma **ativa** por vez) e `DeliveryStatusHistory` (log append-only,
  nunca editado).
- A máquina de estados de `Delivery`: `ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED`, com
  `FAILED` e `CANCELLED` como saídas alternativas.

Abra a migration (`prisma/migrations/.../migration.sql`) e mostre **uma** linha de índice
parcial, por exemplo:

```sql
CREATE UNIQUE INDEX deliveries_one_active_per_driver ON deliveries (driver_id)
  WHERE status IN ('ASSIGNED','PICKED_UP','IN_TRANSIT');
```

> "Isso é uma regra de negócio garantida pelo próprio banco: um motorista não pode ter duas
> entregas ativas ao mesmo tempo, e isso vale mesmo sob concorrência — não depende só da
> aplicação verificar antes de gravar."

## 4:00 – 9:30 | Demonstração ao vivo no Swagger (5min30)

Esse é o núcleo da apresentação — pratique antes para não gastar tempo procurando IDs.

**a) Autenticação (1 min)**
1. `/docs` já aberto → tag **Auth** → `POST /auth/login` → Try it out → login com
   `admin@logistica.local` / `Senha@1234` → Execute.
2. Copie o `accessToken` da resposta.
3. Clique **Authorize** (topo) → cole a `API_KEY` do `.env` no cadeado `ApiKey` → cole o token
   no cadeado `JWT` → Authorize → Close.

> "A API exige duas credenciais em toda rota, exceto health e as três rotas públicas de auth:
> a `X-API-KEY`, que identifica que a chamada vem de um cliente autorizado, e o JWT, que
> identifica o usuário e o papel dele."

**b) Criar pedido → atribuir entrega (1min30)**
1. Tag **Pedidos** → `POST /orders` → Try it out → preencha com um CEP real (ex.
   `01310100`/`1000` origem, `20040020`/`10` destino), `weightKg: 10` → Execute → mostre o
   `201` com endereço já resolvido pela ViaCEP.
2. Copie o `id` do pedido.
3. Tag **Entregas** → `POST /deliveries` → Try it out → cole `orderId`, e os IDs de motorista/
   veículo (pegue via `GET /drivers` e `GET /vehicles` antes, ou já deixe copiados) → Execute →
   `201`, status `ASSIGNED`.

**c) Trocar para o motorista e avançar status (1min30)**
1. Repita o login, agora com `motorista@logistica.local` / `Senha@1234`, e reautorize só o
   cadeado `JWT` (a `ApiKey` continua igual).
2. `PATCH /deliveries/{id}/status` → `status: PICKED_UP` → Execute → `200`.
3. Repita para `IN_TRANSIT`.

> "Note que o papel de quem chama é lido do banco a cada requisição — não fica gravado
> só no token — e que só o motorista responsável por essa entrega específica consegue
> avançar o status dela; outro motorista recebe 403."

**d) Upload do comprovante (1min30 — o ponto alto)**
1. `POST /deliveries/{id}/proof` → Try it out → clique no campo de arquivo → selecione uma
   imagem local (jpg/png) → Execute.
2. Mostre a resposta `201` com `proof.mimeType` e `proof.size`.

> "O arquivo é validado pelo conteúdo real — os primeiros bytes do arquivo —, não pela
> extensão ou pelo Content-Type que o cliente declarou. Testei isso deliberadamente: um
> arquivo de texto renomeado para `.png` é rejeitado com 400, e mandar uma imagem real com
> Content-Type errado também. Isso evita um comprovante falso passar disfarçado."

3. `GET /deliveries/{id}/proof` → Execute → mostre que baixa o arquivo de volta, com o
   Content-Type real.

**e) Fechar a entrega (30s)**
`PATCH /deliveries/{id}/status` → `DELIVERED` → `200`. Diga que `DELIVERED` só é aceito se
já existir um comprovante enviado — testei essa regra também.

## 9:30 – 12:00 | Segurança, regras e testes (2min30)

Sem precisar mais da tela do Swagger — pode voltar pro código ou pro terminal.

- **RBAC + ownership**: "papel sem permissão dá 403; tentar acessar recurso de outra pessoa
  dá 404, não 403 — pra não revelar que aquele recurso existe."
- **X-API-KEY**: "global em toda rota, comparada com `timingSafeEqual` pra não vazar a chave
  por tempo de resposta."
- **Testes**: rode ao vivo (ou mostre já rodado) `npm run test:all`:

```
Test Files  5 passed (5)
     Tests  85 passed (85)     <- unitários

Test Files  9 passed (9)
     Tests  168 passed (168)   <- integração (e2e, banco real de teste)
```

> "265 testes no total. Na semana passada fiz uma varredura de bugs deliberada: escrevi um
> teste que reproduzia o comportamento suspeito antes de mexer em qualquer código — encontrei
> e corrigi 3 bugs reais assim, documentados na seção 10 do relatório."

## 12:00 – 13:30 | Bônus implementados (1min30)

Liste rápido, sem entrar em detalhe (quem quiser detalhe, pergunta):
paginação, filtros e ordenação em todas as listagens · seed com dados de exemplo ·
suíte de testes automatizados · **Swagger/OpenAPI completo em `/docs`**.

> "O Swagger não foi feito escrevendo schema à mão — o plugin do Nest CLI lê os tipos
> TypeScript e os decorators de validação que já existiam nos DTOs e gera o schema sozinho.
> Só precisei decorar manualmente os enums do Prisma."

## 13:30 – 14:30 | Perguntas de defesa antecipadas (1 min de buffer)

Se sobrar tempo, ofereça responder uma destas (estão todas detalhadas em `docs/AULA.md`,
seção "Perguntas de defesa oral"):
- Por que 404 em vez de 403 para recurso de outra pessoa?
- Por que os índices únicos parciais em vez de só validar na aplicação?
- Como a validação de arquivo evita um upload malicioso disfarçado?

## 14:30 – 15:00 | Encerramento (30s)

> "Resumindo: API completa, com autenticação em duas camadas, máquina de estados de entrega
> garantida até no banco, upload de comprovante validado pelo conteúdo real, 265 testes
> automatizados e documentação interativa completa. Fico à disposição para perguntas."

---

## Checklist de ensaio

- [ ] Cronometrar em voz alta pelo menos uma vez inteira antes do dia da apresentação.
- [ ] Ter os IDs de motorista/veículo/cliente do seed já copiados num bloco de notas, pra não
      perder tempo procurando ao vivo (`GET /drivers`, `GET /vehicles`, `GET /customers`).
- [ ] Ter uma imagem pequena (jpg/png) salva no desktop, pronta pra selecionar no upload.
- [ ] Testar a internet antes (a busca de CEP depende da ViaCEP real).
- [ ] Plano B se o tempo apertar: pule a parte (c) trocando de usuário e já mostre uma entrega
      que já esteja em `IN_TRANSIT` — deixe uma pronta de antemão como fallback.
- [ ] Plano B se o Swagger travar: tenha `docs/RELATORIO.md` aberto com prints/trechos de
      resposta já capturados.
