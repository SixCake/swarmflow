import { describe, it, expect, beforeEach } from 'vitest'
import { SchemaValidator } from '../../src/core/schema-validator.js'

describe('SchemaValidator', () => {
  let validator: SchemaValidator

  beforeEach(() => {
    validator = new SchemaValidator()
  })

  it('should validate a valid object', () => {
    const result = validator.validate({ name: 'test', value: 42 }, { type: 'object' })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should validate an empty object', () => {
    expect(validator.validate({}, { type: 'object' }).valid).toBe(true)
  })

  it('should validate nested objects', () => {
    const data = {
      output: { score: 0.8, stance: 1, freeformAnalysis: 'Good' },
      metadata: { confidence: 0.9 },
    }
    expect(validator.validate(data, { type: 'object' }).valid).toBe(true)
  })

  it('should return validation result structure', () => {
    const result = validator.validate({ test: true }, {})
    expect(result).toHaveProperty('valid')
    expect(result).toHaveProperty('errors')
    expect(Array.isArray(result.errors)).toBe(true)
  })

  it('should handle null input', () => {
    const result = validator.validate(null, { type: 'object' })
    expect(result).toHaveProperty('valid')
  })

  it('should handle string input against object schema', () => {
    const result = validator.validate('not an object', { type: 'object' })
    expect(result).toHaveProperty('valid')
  })

  it('should validate string type', () => {
    expect(validator.validate('hello', { type: 'string' }).valid).toBe(true)
    expect(validator.validate(42, { type: 'string' }).valid).toBe(false)
  })

  it('should validate string minLength/maxLength', () => {
    const schema = { type: 'string', minLength: 3, maxLength: 10 }
    expect(validator.validate('ab', schema).valid).toBe(false)
    expect(validator.validate('abc', schema).valid).toBe(true)
    expect(validator.validate('12345678901', schema).valid).toBe(false)
  })

  it('should validate string pattern', () => {
    const schema = { type: 'string', pattern: '^[a-z]+$' }
    expect(validator.validate('hello', schema).valid).toBe(true)
    expect(validator.validate('Hello123', schema).valid).toBe(false)
  })

  it('should validate string format email', () => {
    const schema = { type: 'string', format: 'email' }
    expect(validator.validate('user@example.com', schema).valid).toBe(true)
    expect(validator.validate('not-an-email', schema).valid).toBe(false)
  })

  it('should validate number type', () => {
    expect(validator.validate(42, { type: 'number' }).valid).toBe(true)
    expect(validator.validate('42', { type: 'number' }).valid).toBe(false)
  })

  it('should validate integer type', () => {
    expect(validator.validate(42, { type: 'integer' }).valid).toBe(true)
    expect(validator.validate(42.5, { type: 'integer' }).valid).toBe(false)
  })

  it('should validate number minimum/maximum', () => {
    const schema = { type: 'number', minimum: 0, maximum: 100 }
    expect(validator.validate(50, schema).valid).toBe(true)
    expect(validator.validate(-1, schema).valid).toBe(false)
    expect(validator.validate(101, schema).valid).toBe(false)
  })

  it('should validate boolean type', () => {
    expect(validator.validate(true, { type: 'boolean' }).valid).toBe(true)
    expect(validator.validate('true', { type: 'boolean' }).valid).toBe(false)
  })

  it('should validate array type', () => {
    const items = { type: 'number' }
    expect(validator.validate([1, 2, 3], { type: 'array', items }).valid).toBe(true)
    expect(validator.validate([1, 'two'], { type: 'array', items }).valid).toBe(false)
  })

  it('should validate array minItems/maxItems', () => {
    const schema = { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 4 }
    expect(validator.validate([1], schema).valid).toBe(false)
    expect(validator.validate([1, 2], schema).valid).toBe(true)
    expect(validator.validate([1, 2, 3, 4, 5], schema).valid).toBe(false)
  })

  it('should validate object with required properties', () => {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'integer' } },
      required: ['name'],
    }
    expect(validator.validate({ name: 'Alice', age: 30 }, schema).valid).toBe(true)
    expect(validator.validate({ name: 'Alice' }, schema).valid).toBe(true)
    expect(validator.validate({ age: 30 }, schema).valid).toBe(false)
  })

  it('should validate strict additionalProperties', () => {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    }
    expect(validator.validate({ name: 'Alice' }, schema).valid).toBe(true)
    expect(validator.validate({ name: 'Alice', extra: true }, schema).valid).toBe(false)
  })

  it('should validate enum values', () => {
    const schema = { enum: ['red', 'green', 'blue'] }
    expect(validator.validate('red', schema).valid).toBe(true)
    expect(validator.validate('yellow', schema).valid).toBe(false)
  })

  it('should validate nullable types', () => {
    const schema = { type: 'string', nullable: true }
    expect(validator.validate('hello', schema).valid).toBe(true)
    expect(validator.validate(null, schema).valid).toBe(true)
  })

  it('should cache compiled schemas', () => {
    const schema = { type: 'string' }
    validator.validate('a', schema)
    validator.validate('b', schema)
    expect(validator.getCacheSize()).toBe(1)
  })

  it('should clear cache', () => {
    validator.validate('a', { type: 'string' })
    validator.validate(1, { type: 'number' })
    expect(validator.getCacheSize()).toBe(2)
    validator.clearCache()
    expect(validator.getCacheSize()).toBe(0)
  })

  it('should validate TaskResult-like schema', () => {
    const schema = {
      type: 'object',
      properties: {
        output: {
          type: 'object',
          properties: {
            freeformAnalysis: { type: 'string' },
            score: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['freeformAnalysis', 'score'],
        },
        metadata: {
          type: 'object',
          properties: {
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['confidence'],
        },
      },
      required: ['output', 'metadata'],
    }

    const valid = {
      output: { freeformAnalysis: 'Good', score: 0.8 },
      metadata: { confidence: 0.9 },
    }
    expect(validator.validate(valid, schema).valid).toBe(true)

    const invalid = {
      output: { score: 0.8 },
      metadata: { confidence: 0.9 },
    }
    expect(validator.validate(invalid, schema).valid).toBe(false)
  })
})
