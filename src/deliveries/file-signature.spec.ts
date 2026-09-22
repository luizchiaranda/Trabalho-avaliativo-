import { detectFileType } from './file-signature.js';

describe('detectFileType (magic bytes)', () => {
  it('reconhece JPEG', () => {
    expect(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toEqual(
      {
        mime: 'image/jpeg',
        extension: 'jpg',
      },
    );
  });

  it('reconhece PNG', () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2,
    ]);
    expect(detectFileType(png)).toEqual({
      mime: 'image/png',
      extension: 'png',
    });
  });

  it('reconhece PDF', () => {
    expect(detectFileType(Buffer.from('%PDF-1.7\n...'))).toEqual({
      mime: 'application/pdf',
      extension: 'pdf',
    });
  });

  it.each([
    ['texto', Buffer.from('olá mundo')],
    ['HTML disfarçado', Buffer.from('<html><script>alert(1)</script>')],
    ['executável (MZ)', Buffer.from([0x4d, 0x5a, 0x90, 0x00])],
    ['GIF (não permitido)', Buffer.from('GIF89a')],
    ['buffer vazio', Buffer.alloc(0)],
    ['PNG truncado', Buffer.from([0x89, 0x50, 0x4e])],
    ['PDF sem hífen', Buffer.from('%PDF1.4')],
  ])('rejeita %s', (_label, buffer) => {
    expect(detectFileType(buffer)).toBeNull();
  });
});
