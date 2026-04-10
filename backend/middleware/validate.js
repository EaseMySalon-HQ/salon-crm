/**
 * Zod validation middleware — replaces req.body / req.query / req.params with parsed output.
 * Use .strict() on schemas to reject unknown keys (recommended for new boundaries).
 */

const { logger } = require('../utils/logger');

function getRaw(req, source) {
  if (source === 'body') return req.body;
  if (source === 'query') return req.query;
  return req.params;
}

function assignParsed(req, source, data) {
  if (source === 'body') req.body = data;
  else if (source === 'query') req.query = data;
  else req.params = data;
}

/**
 * @param {import('zod').ZodSchema} schema
 * @param {'body'|'query'|'params'} source
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      const raw = getRaw(req, source);
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten(),
        });
      }
      assignParsed(req, source, parsed.data);
      next();
    } catch (e) {
      logger.error('validate middleware error:', e);
      return res.status(500).json({ success: false, error: 'Validation error' });
    }
  };
}

/**
 * Validate multiple parts in one middleware (e.g. params + body).
 * @param {Array<{ schema: import('zod').ZodSchema, source?: 'body'|'query'|'params' }>} parts
 */
function validateAll(parts) {
  return (req, res, next) => {
    try {
      for (const part of parts) {
        const source = part.source || 'body';
        const raw = getRaw(req, source);
        const parsed = part.schema.safeParse(raw);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: parsed.error.flatten(),
          });
        }
        assignParsed(req, source, parsed.data);
      }
      next();
    } catch (e) {
      logger.error('validateAll middleware error:', e);
      return res.status(500).json({ success: false, error: 'Validation error' });
    }
  };
}

module.exports = { validate, validateAll };
