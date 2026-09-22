import { Controller, Get, Param } from '@nestjs/common';
import { CepService } from './cep.service.js';
import { ParseCepPipe } from './parse-cep.pipe.js';

@Controller('cep')
export class CepController {
  constructor(private readonly cep: CepService) {}

  @Get(':cep')
  lookup(@Param('cep', ParseCepPipe) cep: string) {
    return this.cep.lookup(cep);
  }
}
