export function testDatabaseUrl(baseUrl: string | undefined): string {
  if (!baseUrl) {
    throw new Error(
      'DATABASE_URL não definida. Copie .env.example para .env antes de rodar os testes.',
    );
  }
  const url = new URL(baseUrl);
  const name = url.pathname.slice(1).replace(/_test$/, '');
  url.pathname = `/${name}_test`;
  return url.toString();
}

export function maintenanceDatabaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = '/postgres';
  url.search = '';
  return url.toString();
}

export function databaseName(url: string): string {
  return new URL(url).pathname.slice(1);
}
