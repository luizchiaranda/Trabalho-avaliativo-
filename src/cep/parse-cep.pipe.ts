import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class ParseCepPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (!/^\d{8}$/.test(digits)) {
      throw new BadRequestException('CEP deve conter 8 dígitos');
    }
    return digits;
  }
}
