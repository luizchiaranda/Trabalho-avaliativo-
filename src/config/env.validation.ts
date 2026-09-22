import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: string = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET deve ter pelo menos 32 caracteres' })
  JWT_SECRET: string;

  @IsString()
  @MinLength(20, { message: 'API_KEY deve ter pelo menos 20 caracteres' })
  API_KEY: string;

  @IsString()
  @IsNotEmpty()
  JWT_EXPIRES_IN: string = '1h';

  @IsString()
  @IsNotEmpty()
  UPLOAD_DIR: string = 'uploads';

  @IsInt()
  @Min(1)
  UPLOAD_MAX_SIZE_BYTES: number = 5 * 1024 * 1024;

  @IsUrl({
    require_tld: false,
    require_protocol: true,
    protocols: ['http', 'https'],
  })
  CEP_API_BASE_URL: string;

  @IsInt()
  @Min(100)
  CEP_API_TIMEOUT_MS: number = 5000;
}

/** Falha na inicialização se o ambiente estiver incompleto, em vez de quebrar depois em runtime. */
export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated);
  if (errors.length > 0) {
    const details = errors
      .map(
        (e) =>
          `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${details}`);
  }
  return validated;
}
