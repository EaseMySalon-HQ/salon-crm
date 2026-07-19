'use strict';

const fs = require('fs');
const path = require('path');

const {
  parseHeaderMediaUploadInput,
  parseImageUploadInput,
  saveWhatsappTemplateHeaderMedia,
} = require('../../lib/whatsapp-template-header-media');

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

// Minimal ftyp box (not a playable video, but passes magic-byte check)
const MP4_BUFFER = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftyp', 'ascii'),
  Buffer.from('isom', 'ascii'),
  Buffer.alloc(8),
]);
const MP4_DATA_URL = `data:video/mp4;base64,${MP4_BUFFER.toString('base64')}`;

const PDF_BUFFER = Buffer.from('%PDF-1.4\n');
const PDF_DATA_URL = `data:application/pdf;base64,${PDF_BUFFER.toString('base64')}`;

describe('whatsapp-template-header-media', () => {
  test('parseHeaderMediaUploadInput accepts image data URLs', () => {
    const parsed = parseHeaderMediaUploadInput(PNG_DATA_URL, { format: 'IMAGE' });
    expect(parsed.error).toBeUndefined();
    expect(parsed.ext).toBe('png');
    expect(parsed.buffer.length).toBeGreaterThan(0);
  });

  test('parseImageUploadInput remains backward compatible', () => {
    const parsed = parseImageUploadInput(PNG_DATA_URL);
    expect(parsed.error).toBeUndefined();
    expect(parsed.ext).toBe('png');
  });

  test('parseHeaderMediaUploadInput rejects unsupported image mime', () => {
    const parsed = parseHeaderMediaUploadInput('data:image/gif;base64,AAAA', { format: 'IMAGE' });
    expect(parsed.error).toMatch(/Unsupported/);
  });

  test('parseHeaderMediaUploadInput accepts mp4 video', () => {
    const parsed = parseHeaderMediaUploadInput(MP4_DATA_URL, { format: 'VIDEO' });
    expect(parsed.error).toBeUndefined();
    expect(parsed.ext).toBe('mp4');
  });

  test('parseHeaderMediaUploadInput accepts pdf document', () => {
    const parsed = parseHeaderMediaUploadInput(PDF_DATA_URL, { format: 'DOCUMENT' });
    expect(parsed.error).toBeUndefined();
    expect(parsed.ext).toBe('pdf');
  });

  test('parseHeaderMediaUploadInput rejects pdf uploaded as video', () => {
    const parsed = parseHeaderMediaUploadInput(PDF_DATA_URL, { format: 'VIDEO' });
    expect(parsed.error).toMatch(/Unsupported|does not match/);
  });

  test('saveWhatsappTemplateHeaderMedia writes file and returns url', () => {
    const parsed = parseHeaderMediaUploadInput(PNG_DATA_URL, { format: 'IMAGE' });
    const prevBase = process.env.BACKEND_PUBLIC_URL;
    process.env.BACKEND_PUBLIC_URL = 'https://api.example.com';

    const saved = saveWhatsappTemplateHeaderMedia({
      businessId: 'abc123def456',
      buffer: parsed.buffer,
      ext: parsed.ext,
    });

    process.env.BACKEND_PUBLIC_URL = prevBase;

    expect(saved.error).toBeUndefined();
    expect(saved.url).toMatch(/^https:\/\/api\.example\.com\/uploads\/whatsapp-template-media\//);

    const absolutePath = path.join(__dirname, '..', '..', 'uploads', saved.relativePath);
    expect(fs.existsSync(absolutePath)).toBe(true);
    fs.unlinkSync(absolutePath);

    const dir = path.dirname(absolutePath);
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  });
});
