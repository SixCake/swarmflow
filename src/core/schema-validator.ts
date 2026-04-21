// Schema validation using Zod
// Validates task results against expected output schemas

import { z } from 'zod'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export class SchemaValidator {
  validate(data: unknown, schema: Record<string, unknown>): ValidationResult {
    try {
      const zodSchema = this.buildZodSchema(schema)
      zodSchema.parse(data)
      return { valid: true, errors: [] }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        }
      }
      return { valid: false, errors: ['Unknown validation error'] }
    }
  }

  private buildZodSchema(_schema: Record<string, unknown>): z.ZodType {
    // Simplified: accept any object for MVP
    // Full implementation will parse JSON Schema → Zod
    return z.record(z.unknown())
  }
}
