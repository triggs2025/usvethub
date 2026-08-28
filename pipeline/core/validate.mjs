/**
 * Minimal JSON Schema validator.
 *
 * Deliberately hand-rolled with zero dependencies. This code decides what data
 * is allowed to reach the public site, so it is the last place we want a
 * supply-chain surprise. It supports only the keywords our own schemas use.
 */

const FORMATS = {
  url(value) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      return 'is not a valid URL';
    }
    // Only http(s). Blocks javascript:, data:, and file: from ever reaching an
    // href on the published site.
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return `uses disallowed protocol "${parsed.protocol}"`;
    }
    return null;
  },
  date(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'is not an ISO date (YYYY-MM-DD)';
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return 'is not a real calendar date';
    return null;
  },
  'date-time'(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'is not a valid date-time';
    return null;
  },
};

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * @returns {string[]} human-readable errors, empty when the value is valid
 */
export function validate(value, schema, path = '') {
  const errors = [];
  const where = path || 'value';

  if (schema.type) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    const ok = allowed.some((t) => (t === 'integer' ? Number.isInteger(value) : t === actual));
    if (!ok) {
      errors.push(`${where} should be ${allowed.join(' or ')}, got ${actual}`);
      return errors; // further checks would be noise
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${where} should be one of ${schema.enum.join(', ')}, got ${JSON.stringify(value)}`);
  }

  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) {
      errors.push(`${where} is shorter than ${schema.minLength} characters`);
    }
    if (schema.maxLength != null && value.length > schema.maxLength) {
      errors.push(`${where} is longer than ${schema.maxLength} characters`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${where} does not match ${schema.pattern}`);
    }
    if (schema.format && FORMATS[schema.format]) {
      const problem = FORMATS[schema.format](value);
      if (problem) errors.push(`${where} ${problem}`);
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) {
      errors.push(`${where} is below the minimum ${schema.minimum}`);
    }
    if (schema.maximum != null && value > schema.maximum) {
      errors.push(`${where} is above the maximum ${schema.maximum}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) {
      errors.push(`${where} needs at least ${schema.minItems} item(s)`);
    }
    if (schema.maxItems != null && value.length > schema.maxItems) {
      errors.push(`${where} allows at most ${schema.maxItems} item(s)`);
    }
    if (schema.items) {
      value.forEach((item, i) => {
        errors.push(...validate(item, schema.items, `${where}[${i}]`));
      });
    }
  }

  if (value && typeOf(value) === 'object') {
    for (const key of schema.required || []) {
      if (value[key] === undefined || value[key] === null || value[key] === '') {
        errors.push(`${where}.${key} is required`);
      }
    }
    for (const [key, subSchema] of Object.entries(schema.properties || {})) {
      if (value[key] !== undefined) {
        errors.push(...validate(value[key], subSchema, `${where}.${key}`));
      }
    }
    if (schema.additionalProperties === false) {
      const known = Object.keys(schema.properties || {});
      for (const key of Object.keys(value)) {
        if (!known.includes(key)) errors.push(`${where}.${key} is not an allowed field`);
      }
    }
  }

  return errors;
}
