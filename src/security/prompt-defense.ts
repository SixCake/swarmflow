// Prompt Defense — injection detection, instruction isolation, output safety
// Protects against prompt injection attacks and credential leakage

// ─── Injection Detection ────────────────────────────────────

/** Known prompt injection patterns */
const INJECTION_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /ignore\s+(all\s+)?previous\s+instructions/i, description: 'Instruction override attempt' },
  { pattern: /ignore\s+(all\s+)?above/i, description: 'Instruction override attempt' },
  { pattern: /disregard\s+(all\s+)?previous/i, description: 'Instruction override attempt' },
  { pattern: /forget\s+(all\s+)?previous/i, description: 'Instruction override attempt' },
  { pattern: /you\s+are\s+now\s+a/i, description: 'Role hijacking attempt' },
  { pattern: /act\s+as\s+(if\s+you\s+are\s+)?a/i, description: 'Role hijacking attempt' },
  { pattern: /pretend\s+(you\s+are|to\s+be)/i, description: 'Role hijacking attempt' },
  { pattern: /system\s*:\s*/i, description: 'System prompt injection' },
  { pattern: /\[INST\]/i, description: 'Instruction tag injection' },
  { pattern: /<<SYS>>/i, description: 'System tag injection' },
  { pattern: /\bDAN\b.*\bjailbreak/i, description: 'Jailbreak attempt' },
  { pattern: /reveal\s+(your\s+)?(system\s+)?prompt/i, description: 'Prompt extraction attempt' },
  { pattern: /show\s+(me\s+)?(your\s+)?instructions/i, description: 'Prompt extraction attempt' },
  { pattern: /what\s+(are|is)\s+(your\s+)?(system\s+)?prompt/i, description: 'Prompt extraction attempt' },
]

export interface InjectionDetectionResult {
  isInjection: boolean
  detectedPatterns: Array<{ pattern: string; description: string }>
  riskScore: number // 0-1
}

/**
 * Detect potential prompt injection in input text.
 */
export function detectPromptInjection(text: string): InjectionDetectionResult {
  const detectedPatterns: Array<{ pattern: string; description: string }> = []

  for (const { pattern, description } of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      detectedPatterns.push({ pattern: pattern.source, description })
    }
  }

  const riskScore = Math.min(detectedPatterns.length / 3, 1)

  return {
    isInjection: detectedPatterns.length > 0,
    detectedPatterns,
    riskScore,
  }
}

// ─── Instruction Isolation ──────────────────────────────────

const SYSTEM_PREFIX = '<<<SYSTEM_INSTRUCTION>>>'
const SYSTEM_SUFFIX = '<<<END_SYSTEM_INSTRUCTION>>>'
const CONTEXT_PREFIX = '<<<CONTEXT_DATA>>>'
const CONTEXT_SUFFIX = '<<<END_CONTEXT_DATA>>>'
const USER_PREFIX = '<<<USER_INPUT>>>'
const USER_SUFFIX = '<<<END_USER_INPUT>>>'

/**
 * Wrap system instructions with isolation delimiters.
 */
export function isolateSystemPrompt(systemPrompt: string): string {
  return `${SYSTEM_PREFIX}\n${systemPrompt}\n${SYSTEM_SUFFIX}`
}

/**
 * Wrap context data with isolation delimiters.
 */
export function isolateContext(context: string): string {
  return `${CONTEXT_PREFIX}\n${context}\n${CONTEXT_SUFFIX}`
}

/**
 * Wrap user input with isolation delimiters.
 */
export function isolateUserInput(userInput: string): string {
  return `${USER_PREFIX}\n${userInput}\n${USER_SUFFIX}`
}

/**
 * Build a fully isolated prompt with clear boundaries.
 */
export function buildIsolatedPrompt(
  systemPrompt: string,
  context: string,
  userInput: string
): string {
  return [
    isolateSystemPrompt(systemPrompt),
    '',
    isolateContext(context),
    '',
    isolateUserInput(userInput),
  ].join('\n')
}

// ─── Output Safety ──────────────────────────────────────────

/** Patterns that indicate credential/secret leakage in output */
const OUTPUT_DANGER_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /\b(?:sk|pk)[-_][A-Za-z0-9]{20,}\b/g, description: 'API key detected in output' },
  { pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g, description: 'GitHub token detected' },
  { pattern: /\bAKIA[A-Z0-9]{16}\b/g, description: 'AWS access key detected' },
  { pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g, description: 'Private key detected' },
  { pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, description: 'JWT token detected' },
  { pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/gi, description: 'Password detected in output' },
]

export interface OutputSafetyResult {
  isSafe: boolean
  detectedIssues: Array<{ description: string; match: string }>
}

/**
 * Check agent output for credential/secret leakage.
 */
export function checkOutputSafety(output: string): OutputSafetyResult {
  const detectedIssues: Array<{ description: string; match: string }> = []

  for (const { pattern, description } of OUTPUT_DANGER_PATTERNS) {
    // Reset regex state for global patterns
    pattern.lastIndex = 0
    const matches = output.match(pattern)
    if (matches) {
      for (const match of matches) {
        detectedIssues.push({
          description,
          match: match.slice(0, 10) + '...[REDACTED]',
        })
      }
    }
  }

  return {
    isSafe: detectedIssues.length === 0,
    detectedIssues,
  }
}

/**
 * Redact detected secrets from output text.
 */
export function redactOutput(output: string): string {
  let result = output
  for (const { pattern } of OUTPUT_DANGER_PATTERNS) {
    pattern.lastIndex = 0
    result = result.replace(pattern, '[CREDENTIAL_REDACTED]')
  }
  return result
}
