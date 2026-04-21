// Audit — full audit logging, event sourcing, alerting
// Provides complete traceability for all system actions

// ─── Types ──────────────────────────────────────────────────

export type AuditEventCategory =
  | 'mission'
  | 'task'
  | 'auth'
  | 'security'
  | 'system'

export type AuditSeverity = 'info' | 'warning' | 'critical'

export interface AuditEvent {
  id: string
  timestamp: Date
  category: AuditEventCategory
  action: string
  severity: AuditSeverity
  actor?: string
  resourceId?: string
  resourceType?: string
  details: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export type AlertHandler = (event: AuditEvent) => void

export interface AuditConfig {
  /** Maximum number of events to keep in memory (default: 10000) */
  maxEvents?: number
  /** Alert handlers for critical events */
  alertHandlers?: AlertHandler[]
  /** Severity threshold for alerts (default: 'warning') */
  alertThreshold?: AuditSeverity
}

const DEFAULT_CONFIG: Required<AuditConfig> = {
  maxEvents: 10000,
  alertHandlers: [],
  alertThreshold: 'warning',
}

const SEVERITY_LEVELS: Record<AuditSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
}

// ─── Audit Logger ───────────────────────────────────────────

export class AuditLogger {
  private events: AuditEvent[] = []
  private config: Required<AuditConfig>
  private eventCounter = 0

  constructor(config: AuditConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Log an audit event.
   */
  log(event: Omit<AuditEvent, 'id' | 'timestamp'>): AuditEvent {
    const fullEvent: AuditEvent = {
      ...event,
      id: `audit-${++this.eventCounter}`,
      timestamp: new Date(),
    }

    this.events.push(fullEvent)

    // Trim if over max
    if (this.events.length > this.config.maxEvents) {
      this.events = this.events.slice(-this.config.maxEvents)
    }

    // Trigger alerts if severity meets threshold
    if (SEVERITY_LEVELS[fullEvent.severity] >= SEVERITY_LEVELS[this.config.alertThreshold]) {
      this.triggerAlerts(fullEvent)
    }

    return fullEvent
  }

  /**
   * Log a mission-related event.
   */
  logMission(action: string, missionId: string, details: Record<string, unknown> = {}, severity: AuditSeverity = 'info'): AuditEvent {
    return this.log({
      category: 'mission',
      action,
      severity,
      resourceId: missionId,
      resourceType: 'mission',
      details,
    })
  }

  /**
   * Log a task-related event.
   */
  logTask(action: string, taskId: string, details: Record<string, unknown> = {}, severity: AuditSeverity = 'info'): AuditEvent {
    return this.log({
      category: 'task',
      action,
      severity,
      resourceId: taskId,
      resourceType: 'task',
      details,
    })
  }

  /**
   * Log an authentication event.
   */
  logAuth(action: string, actor: string, details: Record<string, unknown> = {}, severity: AuditSeverity = 'info'): AuditEvent {
    return this.log({
      category: 'auth',
      action,
      severity,
      actor,
      details,
    })
  }

  /**
   * Log a security event.
   */
  logSecurity(action: string, details: Record<string, unknown> = {}, severity: AuditSeverity = 'warning'): AuditEvent {
    return this.log({
      category: 'security',
      action,
      severity,
      details,
    })
  }

  // ─── Queries ────────────────────────────────────────────

  /**
   * Get all events.
   */
  getEvents(): AuditEvent[] {
    return [...this.events]
  }

  /**
   * Query events by category.
   */
  getEventsByCategory(category: AuditEventCategory): AuditEvent[] {
    return this.events.filter(e => e.category === category)
  }

  /**
   * Query events by resource.
   */
  getEventsByResource(resourceId: string): AuditEvent[] {
    return this.events.filter(e => e.resourceId === resourceId)
  }

  /**
   * Query events by severity.
   */
  getEventsBySeverity(severity: AuditSeverity): AuditEvent[] {
    const level = SEVERITY_LEVELS[severity]
    return this.events.filter(e => SEVERITY_LEVELS[e.severity] >= level)
  }

  /**
   * Query events within a time range.
   */
  getEventsByTimeRange(start: Date, end: Date): AuditEvent[] {
    return this.events.filter(
      e => e.timestamp >= start && e.timestamp <= end
    )
  }

  /**
   * Get event count.
   */
  getEventCount(): number {
    return this.events.length
  }

  /**
   * Clear all events.
   */
  clear(): void {
    this.events = []
    this.eventCounter = 0
  }

  // ─── Event Sourcing ─────────────────────────────────────

  /**
   * Reconstruct the state timeline for a specific resource.
   */
  getResourceTimeline(resourceId: string): AuditEvent[] {
    return this.events
      .filter(e => e.resourceId === resourceId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  }

  /**
   * Export events as JSON for persistence.
   */
  exportEvents(): string {
    return JSON.stringify(this.events, null, 2)
  }

  /**
   * Import events from JSON.
   */
  importEvents(json: string): void {
    const imported = JSON.parse(json) as AuditEvent[]
    for (const event of imported) {
      event.timestamp = new Date(event.timestamp)
      this.events.push(event)
    }
    // Trim if over max
    if (this.events.length > this.config.maxEvents) {
      this.events = this.events.slice(-this.config.maxEvents)
    }
  }

  // ─── Alerting ───────────────────────────────────────────

  /**
   * Add an alert handler.
   */
  addAlertHandler(handler: AlertHandler): void {
    this.config.alertHandlers.push(handler)
  }

  /**
   * Remove an alert handler.
   */
  removeAlertHandler(handler: AlertHandler): void {
    this.config.alertHandlers = this.config.alertHandlers.filter(h => h !== handler)
  }

  private triggerAlerts(event: AuditEvent): void {
    for (const handler of this.config.alertHandlers) {
      try {
        handler(event)
      } catch {
        // Swallow handler errors
      }
    }
  }
}
