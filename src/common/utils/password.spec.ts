import { PASSWORD_RULE, hashPassword, verifyPassword } from './password.js';

describe('senha', () => {
  it('gera hash bcrypt diferente a cada chamada e nunca igual ao texto original', async () => {
    const a = await hashPassword('Senha@1234');
    const b = await hashPassword('Senha@1234');
    expect(a).not.toBe(b);
    expect(a).not.toContain('Senha@1234');
    expect(a).toMatch(/^\$2[aby]\$10\$/);
  });

  it('verifica corretamente senha certa e errada', async () => {
    const hash = await hashPassword('Senha@1234');
    await expect(verifyPassword('Senha@1234', hash)).resolves.toBe(true);
    await expect(verifyPassword('senha@1234', hash)).resolves.toBe(false);
  });

  it.each([
    ['abc12345', true],
    ['SóLetras', false],
    ['12345678', false],
    ['Senha@1234', true],
  ])('regra de complexidade: %s → %s', (password, valid) => {
    expect(PASSWORD_RULE.test(password)).toBe(valid);
  });
});
