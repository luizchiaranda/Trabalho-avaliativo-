import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  GatewayTimeoutException,
  NotFoundException,
} from '@nestjs/common';
import { AxiosError, type AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { CepService } from './cep.service.js';

function serviceWith(get: ReturnType<typeof vi.fn>) {
  return new CepService({ get } as unknown as HttpService);
}

const ok = (data: unknown) => of({ data, status: 200 } as AxiosResponse);

describe('CepService', () => {
  it('normaliza a resposta do provedor', async () => {
    const service = serviceWith(
      vi.fn().mockReturnValue(
        ok({
          cep: '01001-000',
          logradouro: 'Praça da Sé',
          bairro: 'Sé',
          localidade: 'São Paulo',
          uf: 'sp',
        }),
      ),
    );
    await expect(service.lookup('01001000')).resolves.toEqual({
      cep: '01001000',
      street: 'Praça da Sé',
      neighborhood: 'Sé',
      city: 'São Paulo',
      state: 'SP',
    });
  });

  it('consulta a rota /{cep}/json/', async () => {
    const get = vi.fn().mockReturnValue(ok({ localidade: 'X', uf: 'SP' }));
    await serviceWith(get).lookup('01001000');
    expect(get).toHaveBeenCalledWith('/01001000/json/');
  });

  it('aceita CEP genérico de cidade pequena (sem rua nem bairro)', async () => {
    const service = serviceWith(
      vi.fn().mockReturnValue(
        ok({
          localidade: 'Cidadezinha',
          uf: 'MG',
          logradouro: '',
          bairro: '',
        }),
      ),
    );
    await expect(service.lookup('35000000')).resolves.toMatchObject({
      street: '',
      city: 'Cidadezinha',
    });
  });

  it.each([{ erro: true }, { erro: 'true' }])(
    '404 quando o provedor responde %j',
    async (body) => {
      const service = serviceWith(vi.fn().mockReturnValue(ok(body)));
      await expect(service.lookup('99999999')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    },
  );

  it('502 quando a resposta não tem cidade/UF', async () => {
    const service = serviceWith(vi.fn().mockReturnValue(ok({ foo: 'bar' })));
    await expect(service.lookup('01001000')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it.each(['ECONNABORTED', 'ETIMEDOUT', 'ERR_CANCELED'])(
    '504 quando o axios sinaliza timeout (%s)',
    async (code) => {
      const service = serviceWith(
        vi
          .fn()
          .mockReturnValue(throwError(() => new AxiosError('timeout', code))),
      );
      await expect(service.lookup('01001000')).rejects.toBeInstanceOf(
        GatewayTimeoutException,
      );
    },
  );

  it.each([500, 503])(
    '502 quando o provedor responde HTTP %i',
    async (status) => {
      const error = new AxiosError(
        'fail',
        'ERR_BAD_RESPONSE',
        undefined,
        undefined,
        {
          status,
        } as AxiosResponse,
      );
      const service = serviceWith(
        vi.fn().mockReturnValue(throwError(() => error)),
      );
      await expect(service.lookup('01001000')).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    },
  );

  it('502 quando não há conexão (ECONNREFUSED)', async () => {
    const service = serviceWith(
      vi
        .fn()
        .mockReturnValue(
          throwError(() => new AxiosError('refused', 'ECONNREFUSED')),
        ),
    );
    await expect(service.lookup('01001000')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('404 quando o provedor responde HTTP 404 ou 400', async () => {
    for (const status of [400, 404]) {
      const error = new AxiosError(
        'x',
        'ERR_BAD_REQUEST',
        undefined,
        undefined,
        {
          status,
        } as AxiosResponse,
      );
      const service = serviceWith(
        vi.fn().mockReturnValue(throwError(() => error)),
      );
      await expect(service.lookup('01001000')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    }
  });

  it('erro desconhecido vira 502 sem vazar a mensagem original', async () => {
    const service = serviceWith(
      vi.fn().mockReturnValue(throwError(() => new Error('segredo interno'))),
    );
    const error = await service
      .lookup('01001000')
      .catch((e: BadGatewayException) => e);
    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as BadGatewayException).message).not.toContain(
      'segredo interno',
    );
  });
});
