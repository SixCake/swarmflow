// Context Security — task context sanitization, least privilege, watermarking
// Ensures sensitive information is stripped before passing context to agents

export interface SanitizationConfig {
  /** Remove patterns matching email addresses */
  removeEmails?: boolean
  /** Remove patterns matching API keys / tokens */
  removeApiKeys?: boolean
  /** Remove patterns matching IP addresses */
  removeIPs?: boolean
  /** Custom patterns to remove */
  customPatterns?: RegExp[]
}

const DEFAULT_SANITIZATION: SanitizationConfig = {
  removeEmails: true,
  removeApiKeys: true,
  removeIPs: true,
}

// ─── Pattern Definitions ────────────────────────────────────

const PATTERNS = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  apiKey: /\b(?:sk|pk|api[_-]?key|token|secret|password|bearer)[_-]?[A-Za-z0-9_\-]{16,}\b/gi,
  genericSecret: /(?:(?:api|access|secret|private)[_-]?(?:key|token|secret))\s*[:=]\s*['"]?[A-Za-z0-9_\-./+]{8,}['"]?/gi,
  ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
}

// ─── Sanitization ───────────────────────────────────────────

/**
 * Remove personal information from text content.
 */
export function removePersonalInfo(text: string): string {
  return text.replace(PATTERNS.email, '[EMAIL_REDACTED]')
}

/**
 * Remove API keys, tokens, and secrets from text content.
 */
export function removeApiKeys(text: string): string {
  let result = text
  result = result.replace(PATTERNS.apiKey, '[KEY_REDACTED]')
  result = result.replace(PATTERNS.genericSecret, '[SECRET_REDACTED]')
  return result
}

/**
 * Remove IP addresses from text content.
 */
export function removeIPs(text: string): string {
  return text.replace(PATTERNS.ipv4, '[IP_REDACTED]')
}

/**
 * Apply all configured sanitization rules to text content.
 */
export function sanitizeContext(text: string, config: SanitizationConfig = DEFAULT_SANITIZATION): string {
  let result = text
  if (config.removeEmails) result = removePersonalInfo(result)
  if (config.removeApiKeys) result = removeApiKeys(result)
  if (config.removeIPs) result = removeIPs(result)
  if (config.customPatterns) {
    for (const pattern of config.customPatterns) {
      result = result.replace(pattern, '[CUSTOM_REDACTED]')
    }
  }
  return result
}

/**
 * Sanitize a context object by applying sanitization to all string values.
 */
export function sanitizeContextObject(
  context: Record<string, unknown>,
  config: SanitizationConfig = DEFAULT_SANITIZATION
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeContext(value, config)
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeContextObject(value as Record<string, unknown>, config)
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

// ─── Least Privilege ────────────────────────────────────────

/**
 * Strip other terminal/worker IDs from context to enforce least privilege.
 */
export function hideOtherTerminalIds(
  context: Record<string, unknown>,
  currentTerminalId: string
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(context)) {
    if (key === 'terminalId' && value !== currentTerminalId) {
      sanitized[key] = '[HIDDEN]'
    } else if (key === 'workerId' && value !== currentTerminalId) {
      sanitized[key] = '[HIDDEN]'
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

/**
 * Remove raw results from other agents, keeping only aggregated summaries.
 */
export function hideRawResults(context: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...context }
  if ('rawResults' in sanitized) {
    sanitized['rawResults'] = '[REDACTED — use aggregated summary]'
  }
  return sanitized
}

// ─── Unicode Steganography Watermark ────────────────────────

const ZERO_WIDTH_SPACE = '\u200B'
const ZERO_WIDTH_NON_JOINER = '\u200C'
const ZERO_WIDTH_JOINER = '\u200D'

/**
 * Embed a watermark into text using zero-width Unicode characters.
 * Encodes the watermark string as binary using zero-width chars.
 */
export function embedWatermark(text: string, watermark: string): string {
  const binary = Array.from(watermark)
    .map(c => c.charCodeAt(0).toString(2).padStart(8, '0'))
    .join('')

  const encoded = binary
    .split('')
    .map(bit => (bit === '0' ? ZERO_WIDTH_SPACE : ZERO_WIDTH_NON_JOINER))
    .join(ZERO_WIDTH_JOINER)

  // Insert watermark after the first space (or at the beginning)
  const spaceIndex = text.indexOf(' ')
  if (spaceIndex === -1) return text + encoded
  return text.slice(0, spaceIndex) + encoded + text.slice(spaceIndex)
}

/**
 * Extract a watermark from text that was embedded using embedWatermark.
 */
export function extractWatermark(text: string): string | null {
  // Find the zero-width character sequence
  const zwChars = text.replace(/[^\u200B\u200C\u200D]/g, '')
  if (zwChars.length === 0) return null

  const bits = zwChars
    .split(ZERO_WIDTH_JOINER)
    .filter(s => s.length > 0)
    .map(c => (c === ZERO_WIDTH_SPACE ? '0' : '1'))
    .join('')

  // Decode binary to string (8 bits per character)
  const chars: string[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    const byte = bits.slice(i, i + 8)
    chars.push(String.fromCharCode(parseInt(byte, 2)))
  }

  return chars.length > 0 ? chars.join('') : null
}
