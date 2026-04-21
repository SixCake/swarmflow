// Schema validation using Zod
// Converts JSON Schema to Zod schemas with caching

import { z } from 'zod'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export class SchemaValidator {
  /** Cache compiled Zod schemas keyed by JSON-stringified schema */
  private cache: Map<string, z.ZodType> = new Map()

  validate(data: unknown, schema: Record<string, unknown>): ValidationResult {
    try {
      const zodSchema = this.getOrBuildSchema(schema)
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

  /**
   * Get a cached Zod schema or build and cache a new one.
   */
  private getOrBuildSchema(schema: Record<string, unknown>): z.ZodType {
    const key = JSON.stringify(schema)
    const cached = this.cache.get(key)
    if (cached) return cached

    const zodSchema = this.jsonSchemaToZod(schema)
    this.cache.set(key, zodSchema)
    return zodSchema
  }

  /**
   * Convert a JSON Schema object to a Zod schema.
   * Supports: string, number, integer, boolean, array, object, enum, nullable, required.
   */
  jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType {
    // Handle empty schema — accept anything
    if (!schema || Object.keys(schema).length === 0) {
      return z.record(z.unknown())
    }

    const type = schema.type as string | undefined

    // Handle enum
    if (schema.enum && Array.isArray(schema.enum)) {
      const values = schema.enum as [string, ...string[]]
      if (values.length === 0) return z.never()
      return z.enum(values)
    }

    // Handle oneOf / anyOf (simplified: union of types)
    if (schema.oneOf && Array.isArray(schema.oneOf)) {
      const schemas = (schema.oneOf as Record<string, unknown>[]).map(s => this.jsonSchemaToZod(s))
      if (schemas.length === 0) return z.never()
      if (schemas.length === 1) return schemas[0]
      return z.union([schemas[0], schemas[1], ...schemas.slice(2)] as [z.ZodType, z.ZodType, ...z.ZodType[]])
    }

    if (schema.anyOf && Array.isArray(schema.anyOf)) {
      const schemas = (schema.anyOf as Record<string, unknown>[]).map(s => this.jsonSchemaToZod(s))
      if (schemas.length === 0) return z.never()
      if (schemas.length === 1) return schemas[0]
      return z.union([schemas[0], schemas[1], ...schemas.slice(2)] as [z.ZodType, z.ZodType, ...z.ZodType[]])
    }

    let result: z.ZodType

    switch (type) {
      case 'string':
        result = this.buildStringSchema(schema)
        break
      case 'number':
      case 'integer':
        result = this.buildNumberSchema(schema, type === 'integer')
        break
      case 'boolean':
        result = z.boolean()
        break
      case 'array':
        result = this.buildArraySchema(schema)
        break
      case 'object':
        result = this.buildObjectSchema(schema)
        break
      case 'null':
        result = z.null()
        break
      default:
        // No type specified — accept any object
        result = z.record(z.unknown())
    }

    // Handle nullable
    if (schema.nullable === true) {
      result = result.nullable()
    }

    return result
  }

  private buildStringSchema(schema: Record<string, unknown>): z.ZodString {
    let s = z.string()
    if (typeof schema.minLength === 'number') s = s.min(schema.minLength)
    if (typeof schema.maxLength === 'number') s = s.max(schema.maxLength)
    if (typeof schema.pattern === 'string') s = s.regex(new RegExp(schema.pattern))

    // Handle format
    if (schema.format === 'email') s = s.email()
    if (schema.format === 'uri' || schema.format === 'url') s = s.url()
    if (schema.format === 'uuid') s = s.uuid()

    return s
  }

  private buildNumberSchema(schema: Record<string, unknown>, isInteger: boolean): z.ZodNumber {
    let n = z.number()
    if (isInteger) n = n.int()
    if (typeof schema.minimum === 'number') n = n.min(schema.minimum)
    if (typeof schema.maximum === 'number') n = n.max(schema.maximum)
    if (typeof schema.exclusiveMinimum === 'number') n = n.gt(schema.exclusiveMinimum)
    if (typeof schema.exclusiveMaximum === 'number') n = n.lt(schema.exclusiveMaximum)
    if (typeof schema.multipleOf === 'number') n = n.multipleOf(schema.multipleOf)
    return n
  }

  private buildArraySchema(schema: Record<string, unknown>): z.ZodType {
    const itemSchema = schema.items
      ? this.jsonSchemaToZod(schema.items as Record<string, unknown>)
      : z.unknown()

    let arr = z.array(itemSchema)
    if (typeof schema.minItems === 'number') arr = arr.min(schema.minItems)
    if (typeof schema.maxItems === 'number') arr = arr.max(schema.maxItems)
    return arr
  }

  private buildObjectSchema(schema: Record<string, unknown>): z.ZodType {
    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined
    const required = new Set((schema.required as string[]) ?? [])

    if (!properties || Object.keys(properties).length === 0) {
      return z.record(z.unknown())
    }

    const shape: Record<string, z.ZodType> = {}
    for (const [key, propSchema] of Object.entries(properties)) {
      let propZod = this.jsonSchemaToZod(propSchema)
      if (!required.has(key)) {
        propZod = propZod.optional()
      }
      shape[key] = propZod
    }

    const obj = z.object(shape)

    // Handle additionalProperties
    if (schema.additionalProperties === false) {
      return obj.strict()
    }

    return obj.passthrough()
  }

  /**
   * Clear the schema cache.
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Get the number of cached schemas.
   */
  getCacheSize(): number {
    return this.cache.size
  }
}
