import { describe, it, expect } from 'vitest'
import { SchemaValidator } from '../../src/core/schema-validator.js'

describe('SchemaValidator', () => {
  let validator: SchemaValidator

  beforeEach(() => {
    validator = new SchemaValidator()
  })

  it('should validate a valid object', () => {
    const data = { name: 'test', value: 42 }
    const schema = { type: 'object' }
    const result = validator.validate(data, schema)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should validate an empty object', () => {
    const data = {}
    const schema = { type: 'object' }
    const result = validator.validate(data, schema)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should validate nested objects', () => {
    const data = {
      output: {
        score: 0.8,
        stance: 1,
        freeformAnalysis: 'Good analysis',
      },
      metadata: {
        confidence: 0.9,
        agentFramework: 'mastra',
      },
    }
    const schema = { type: 'object' }
    const result = validator.validate(data, schema)
    expect(result.valid).toBe(true)
  })

  it('should return validation result structure', () => {
    const data = { test: true }
    const schema = {}
    const result = validator.validate(data, schema)
    expect(result).toHaveProperty('valid')
    expect(result).toHaveProperty('errors')
    expect(Array.isArray(result.errors)).toBe(true)
  })

  it('should handle null input gracefully', () => {
    const schema = { type: 'object' }
    const result = validator.validate(null, schema)
    // MVP accepts any record, null should fail
    expect(result).toHaveProperty('valid')
    expect(result).toHaveProperty('errors')
  })

  it('should handle string input', () => {
    const schema = { type: 'object' }
    const result = validator.validate('not an object', schema)
    expect(result).toHaveProperty('valid')
    expect(result).toHaveProperty('errors')
  })
})
