import { createServer, type Server } from 'node:http';

const ADDRESSES: Record<string, object> = {
  '01001000': {
    cep: '01001-000',
    logradouro: 'Praça da Sé',
    bairro: 'Sé',
    localidade: 'São Paulo',
    uf: 'SP',
  },
  '20040020': {
    cep: '20040-020',
    logradouro: 'Rua da Assembleia',
    bairro: 'Centro',
    localidade: 'Rio de Janeiro',
    uf: 'RJ',
  },
  '30130010': {
    cep: '30130-010',
    logradouro: 'Avenida Afonso Pena',
    bairro: 'Centro',
    localidade: 'Belo Horizonte',
    uf: 'MG',
  },
};

export const CEP = {
  SAO_PAULO: '01001000',
  RIO: '20040020',
  BH: '30130010',
  NOT_FOUND: '99999999',
  UPSTREAM_ERROR: '50000000',
  SLOW: '60000000',
  MALFORMED: '70000000',
} as const;

export const CEP_MOCK_PORT = 4010;

export interface CepMock {
  url: string;
  requests: string[];
  close: () => Promise<void>;
}

export async function startCepMock(): Promise<CepMock> {
  const requests: string[] = [];

  const server: Server = createServer((req, res) => {
    const match = /^\/(\d{8})\/json\/?$/.exec(req.url ?? '');
    const cep = match?.[1];
    if (!cep) {
      res.writeHead(400).end();
      return;
    }
    requests.push(cep);

    res.setHeader('Content-Type', 'application/json');
    if (cep === CEP.UPSTREAM_ERROR) {
      res.writeHead(500).end(JSON.stringify({ message: 'boom' }));
    } else if (cep === CEP.SLOW) {
      setTimeout(() => res.end(JSON.stringify(ADDRESSES[CEP.SAO_PAULO])), 1500);
    } else if (cep === CEP.MALFORMED) {
      res.end(JSON.stringify({ foo: 'bar' }));
    } else if (ADDRESSES[cep]) {
      res.end(JSON.stringify(ADDRESSES[cep]));
    } else {
      res.end(JSON.stringify({ erro: true }));
    }
  });

  await new Promise<void>((resolve) =>
    server.listen(CEP_MOCK_PORT, '127.0.0.1', resolve),
  );
  return {
    url: `http://127.0.0.1:${CEP_MOCK_PORT}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        if (!server.listening) return resolve();
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
