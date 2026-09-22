import 'reflect-metadata';
import { validateEnv } from './env.validation.js';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
  API_KEY: 'y'.repeat(20),
  CEP_API_BASE_URL: 'https://viacep.com.br/ws',
};

describe('validateEnv', () => {
  it('aceita o mínimo obrigatório e aplica os padrões', () => {
    const env = validateEnv(valid);
    expect(env.PORT).toBe(3000);
    expect(env.JWT_EXPIRES_IN).toBe('1h');
    expect(env.UPLOAD_DIR).toBe('uploads');
    expect(env.UPLOAD_MAX_SIZE_BYTES).toBe(5 * 1024 * 1024);
    expect(env.CEP_API_TIMEOUT_MS).toBe(5000);
  });

  it('converte strings numéricas do .env para número', () => {
    const env = validateEnv({
      ...valid,
      PORT: '8080',
      CEP_API_TIMEOUT_MS: '2500',
    });
    expect(env.PORT).toBe(8080);
    expect(env.CEP_API_TIMEOUT_MS).toBe(2500);
  });

  it('recusa subir sem DATABASE_URL', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('recusa JWT_SECRET curto', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'curto' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('recusa API_KEY curta', () => {
    expect(() => validateEnv({ ...valid, API_KEY: 'curta' })).toThrow(
      /API_KEY/,
    );
  });

  it('recusa URL de CEP inválida e porta fora do intervalo', () => {
    expect(() =>
      validateEnv({ ...valid, CEP_API_BASE_URL: 'nao-e-url' }),
    ).toThrow(/CEP_API_BASE_URL/);
    expect(() => validateEnv({ ...valid, PORT: '70000' })).toThrow(/PORT/);
  });

  it('lista todos os problemas de uma vez', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL[\s\S]*JWT_SECRET/);
  });
});
