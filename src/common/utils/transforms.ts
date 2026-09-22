import type { TransformFnParams } from 'class-transformer';

export const trimString = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export const normalizeEmail = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export const onlyDigits = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.replace(/\D/g, '') : value;

export const normalizePlate = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string'
    ? value.toUpperCase().replace(/[^A-Z0-9]/g, '')
    : value;

export const toBoolean = ({ value }: TransformFnParams): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};
