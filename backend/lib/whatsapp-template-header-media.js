'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { resolvePublicBackendBaseUrl } = require('./public-backend-url');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads', 'whatsapp-template-media');

const FORMAT_CONFIG = {
  IMAGE: {
    maxBytes: 5 * 1024 * 1024,
    mimes: {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    },
    dataUrlPattern: /^data:(image\/(?:jpeg|jpg|png|webp));base64,([a-z0-9+/=\s]+)$/i,
    label: 'image',
  },
  VIDEO: {
    maxBytes: 16 * 1024 * 1024,
    mimes: {
      'video/mp4': 'mp4',
      'video/3gpp': '3gp',
    },
    dataUrlPattern: /^data:(video\/(?:mp4|3gpp));base64,([a-z0-9+/=\s]+)$/i,
    label: 'video',
  },
  DOCUMENT: {
    maxBytes: 15 * 1024 * 1024,
    mimes: {
      'application/pdf': 'pdf',
    },
    dataUrlPattern: /^data:(application\/pdf);base64,([a-z0-9+/=\s]+)$/i,
    label: 'document',
  },
};

/**
 * @param {string} input
 * @param {{ format: 'IMAGE'|'VIDEO'|'DOCUMENT', contentType?: string }} opts
 */
function parseHeaderMediaUploadInput(input, { format, contentType }) {
  const cfg = FORMAT_CONFIG[format];
  if (!cfg) {
    return { error: 'Invalid media format' };
  }

  const raw = String(input || '').trim();
  if (!raw) {
    return { error: `${cfg.label} data is required` };
  }

  let mime = '';
  let base64 = '';

  const dataUrlMatch = cfg.dataUrlPattern.exec(raw);
  if (dataUrlMatch) {
    mime = dataUrlMatch[1].toLowerCase();
    base64 = dataUrlMatch[2].replace(/\s/g, '');
  } else {
    mime = String(contentType || '').trim().toLowerCase();
    if (!cfg.mimes[mime]) {
      return { error: unsupportedTypeMessage(format) };
    }
    base64 = raw.replace(/\s/g, '');
  }

  if (!cfg.mimes[mime]) {
    return { error: unsupportedTypeMessage(format) };
  }

  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    return { error: 'Invalid file encoding' };
  }

  if (!buffer.length) {
    return { error: `Empty ${cfg.label} file` };
  }
  if (buffer.length > cfg.maxBytes) {
    return { error: `${capitalize(cfg.label)} must be under ${cfg.maxBytes / (1024 * 1024)} MB` };
  }

  const ext = cfg.mimes[mime];
  if (!looksLikeMedia(buffer, format, ext)) {
    return { error: 'File content does not match the selected type' };
  }

  return { buffer, mime, ext };
}

function unsupportedTypeMessage(format) {
  switch (format) {
    case 'VIDEO':
      return 'Unsupported video type. Use MP4 or 3GP.';
    case 'DOCUMENT':
      return 'Unsupported document type. Use PDF.';
    default:
      return 'Unsupported image type. Use JPEG, PNG, or WebP.';
  }
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function looksLikeMedia(buffer, format, ext) {
  if (format === 'IMAGE') {
    return looksLikeImage(buffer, ext);
  }
  if (format === 'VIDEO') {
    if (ext === 'mp4' || ext === '3gp') {
      // ISO BMFF / MP4 family: "ftyp" at offset 4
      return (
        buffer.length >= 12 &&
        buffer.slice(4, 8).toString('ascii') === 'ftyp'
      );
    }
    return false;
  }
  if (format === 'DOCUMENT') {
    return buffer.length >= 5 && buffer.slice(0, 5).toString('ascii') === '%PDF-';
  }
  return false;
}

function looksLikeImage(buffer, ext) {
  if (ext === 'jpg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8;
  }
  if (ext === 'png') {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }
  if (ext === 'webp') {
    return (
      buffer.length >= 12 &&
      buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
      buffer.slice(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

/**
 * Persist a header sample file and return a public HTTPS/HTTP URL Meta can fetch.
 * @param {{ businessId: string, buffer: Buffer, ext: string }} opts
 */
function saveWhatsappTemplateHeaderMedia({ businessId, buffer, ext }) {
  const safeBusinessId = String(businessId || '').replace(/[^a-f0-9]/gi, '');
  if (!safeBusinessId) {
    return { error: 'Invalid business id' };
  }

  const fileName = `${crypto.randomUUID()}.${ext}`;
  const dir = path.join(UPLOAD_ROOT, safeBusinessId);
  fs.mkdirSync(dir, { recursive: true });

  const absolutePath = path.join(dir, fileName);
  fs.writeFileSync(absolutePath, buffer);

  const relativePath = `whatsapp-template-media/${safeBusinessId}/${fileName}`;
  const base = resolvePublicBackendBaseUrl();
  const url = `${base}/uploads/${relativePath}`;

  return { url, relativePath };
}

/** @deprecated use parseHeaderMediaUploadInput */
function parseImageUploadInput(input, contentType) {
  return parseHeaderMediaUploadInput(input, { format: 'IMAGE', contentType });
}

module.exports = {
  FORMAT_CONFIG,
  parseHeaderMediaUploadInput,
  parseImageUploadInput,
  saveWhatsappTemplateHeaderMedia,
};
