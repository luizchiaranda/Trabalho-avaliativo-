import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Documentação interativa em /docs (JSON em /docs-json). Fica sempre
 * disponível, inclusive em produção: é um trabalho de avaliação e a
 * documentação faz parte do que é entregue. Em um deploy real, o ideal
 * seria restringir isso por ambiente ou atrás de autenticação própria.
 *
 * IMPORTANTE: SwaggerModule.setup() registra suas rotas direto no adapter
 * HTTP (Express), por fora do pipeline de guards do Nest — por isso /docs
 * e /docs-json continuam acessíveis mesmo sem X-API-KEY, ainda que todas as
 * rotas de negócio exijam. É a exceção deliberada de "toda rota exige
 * X-API-KEY": aqui não há dado nenhum, só a descrição da API.
 */
export function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('API de Logística e Entregas')
    .setDescription(
      [
        'API REST para gestão de pedidos, motoristas, veículos, entregas e ocorrências.',
        '',
        '**Autenticação (duas camadas, as duas exigidas em toda rota de negócio):**',
        '1. `X-API-KEY`: chave fixa do cliente/integração (variável `API_KEY` do `.env`).',
        '2. `Authorization: Bearer <token>`: identifica o usuário logado, obtido em `POST /auth/login`.',
        '',
        '`GET /health`, `POST /auth/register` e `POST /auth/login` só exigem a `X-API-KEY` (não o Bearer).',
        '',
        'Use o botão **Authorize** para informar as duas credenciais uma única vez.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token obtido em POST /auth/login',
      },
      'JWT',
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-KEY',
        description: 'Variável API_KEY do .env',
      },
      'ApiKey',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Exigência padrão de toda rota: X-API-KEY E (quando aplicável) o Bearer.
  // Um único objeto com as duas chaves = AND (as duas são necessárias).
  // Cada rota pública sobrescreve isso com @ApiSecurity('ApiKey') sozinho.
  document.security = [{ ApiKey: [], JWT: [] }];

  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'API de Logística e Entregas — Docs',
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });
}
