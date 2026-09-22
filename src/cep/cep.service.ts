import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

export interface Address {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

interface ViaCepResponse {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean | string;
}

const TIMEOUT_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT', 'ERR_CANCELED']);

@Injectable()
export class CepService {
  private readonly logger = new Logger(CepService.name);

  constructor(private readonly http: HttpService) {}

  async lookup(cep: string): Promise<Address> {
    let data: ViaCepResponse;
    try {
      const response = await firstValueFrom(
        this.http.get<ViaCepResponse>(`/${cep}/json/`),
      );
      data = response.data;
    } catch (error) {
      throw this.translate(error, cep);
    }

    if (!data || data.erro === true || data.erro === 'true') {
      throw new NotFoundException(`CEP ${cep} não encontrado`);
    }
    if (!data.localidade || !data.uf) {
      this.logger.error(`Resposta inesperada do provedor de CEP para ${cep}`);
      throw new BadGatewayException('Resposta inválida do provedor de CEP');
    }

    return {
      cep,
      street: data.logradouro ?? '',
      neighborhood: data.bairro ?? '',
      city: data.localidade,
      state: data.uf.slice(0, 2).toUpperCase(),
    };
  }

  private translate(error: unknown, cep: string) {
    if (isAxiosError(error)) {
      if (error.code && TIMEOUT_CODES.has(error.code)) {
        this.logger.warn(`Timeout consultando CEP ${cep}`);
        return new GatewayTimeoutException(
          'Tempo esgotado ao consultar o serviço de CEP',
        );
      }
      if (error.response?.status === 404 || error.response?.status === 400) {
        return new NotFoundException(`CEP ${cep} não encontrado`);
      }
      this.logger.warn(
        `Falha consultando CEP ${cep}: ${error.code ?? error.response?.status ?? 'sem resposta'}`,
      );
    } else {
      this.logger.error(`Erro inesperado consultando CEP ${cep}`);
    }
    return new BadGatewayException('Serviço de CEP indisponível no momento');
  }
}
