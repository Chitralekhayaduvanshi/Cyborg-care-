/**
 * HIPAA Audit Logging
 * Tracks all access and modifications for compliance
 */

import type { User } from "./auth"

export type AuditEventType =
  | "AUTH_LOGIN"
  | "AUTH_LOGOUT"
  | "QUERY_SUBMITTED"
  | "RECORD_ACCESSED"
  | "RECORD_RETRIEVED"
  | "RESPONSE_GENERATED"
  | "DATA_EXPORTED"
  | "USER_CREATED"
  | "USER_MODIFIED"
  | "USER_DELETED"
  | "SECURITY_EVENT"

export interface AuditLog {
  id: string
  timestamp: Date
  eventType: AuditEventType
  userId: string
  userEmail: string
  userRole: string
  action: string
  resourceId?: string
  resourceType?: string
  details: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
  status: "success" | "failure"
  errorMessage?: string
}

// In-memory audit log store (in production, use immutable database)
const auditLogs: AuditLog[] = []

/**
 * Logs an audit event
 */
export function logAuditEvent(
  eventType: AuditEventType,
  user: User,
  action: string,
  details: Record<string, unknown> = {},
  status: "success" | "failure" = "success",
  errorMessage?: string,
): AuditLog {
  const auditLog: AuditLog = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(),
    eventType,
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action,
    details,
    status,
    errorMessage,
  }

  auditLogs.push(auditLog)

  // In production, also write to immutable log storage
  console.log("[AUDIT]", JSON.stringify(auditLog))

  return auditLog
}

/**
 * Logs a query submission
 */
export function logQuerySubmission(user: User, query: string, recordsRetrieved: number): AuditLog {
  return logAuditEvent(
    "QUERY_SUBMITTED",
    user,
    "User submitted medical query",
    {
      queryLength: query.length,
      recordsRetrieved,
      timestamp: new Date().toISOString(),
    },
    "success",
  )
}

/**
 * Logs record access
 */
export function logRecordAccess(user: User, recordId: string, accessType: string): AuditLog {
  return logAuditEvent(
    "RECORD_ACCESSED",
    user,
    `User accessed medical record`,
    {
      recordId,
      accessType,
      timestamp: new Date().toISOString(),
    },
    "success",
  )
}

/**
 * Logs response generation
 */
export function logResponseGeneration(user: User, queryId: string, confidence: number, recordsUsed: number): AuditLog {
  return logAuditEvent(
    "RESPONSE_GENERATED",
    user,
    "Clinical response generated",
    {
      queryId,
      confidence,
      recordsUsed,
      timestamp: new Date().toISOString(),
    },
    "success",
  )
}

/**
 * Logs security events
 */
export function logSecurityEvent(user: User | null, eventDescription: string, severity: "low" | "medium" | "high") {
  return logAuditEvent(
    "SECURITY_EVENT",
    user || {
      id: "system",
      email: "system@medical-chatbot.local",
      name: "System",
      role: "admin",
      createdAt: new Date(),
      isActive: true,
    },
    eventDescription,
    {
      severity,
      timestamp: new Date().toISOString(),
    },
    "success",
  )
}

/**
 * Retrieves audit logs with filtering
 */
export function getAuditLogs(filters?: {
  userId?: string
  eventType?: AuditEventType
  startDate?: Date
  endDate?: Date
  limit?: number
}): AuditLog[] {
  let filtered = [...auditLogs]

  if (filters?.userId) {
    filtered = filtered.filter((log) => log.userId === filters.userId)
  }

  if (filters?.eventType) {
    filtered = filtered.filter((log) => log.eventType === filters.eventType)
  }

  if (filters?.startDate) {
    filtered = filtered.filter((log) => log.timestamp >= filters.startDate!)
  }

  if (filters?.endDate) {
    filtered = filtered.filter((log) => log.timestamp <= filters.endDate!)
  }

  // Sort by timestamp descending
  filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

  if (filters?.limit) {
    filtered = filtered.slice(0, filters.limit)
  }

  return filtered
}

/**
 * Generates audit report
 */
export function generateAuditReport(
  startDate: Date,
  endDate: Date,
): {
  totalEvents: number
  eventsByType: Record<AuditEventType, number>
  eventsByUser: Record<string, number>
  failureCount: number
  securityEvents: AuditLog[]
} {
  const logs = getAuditLogs({ startDate, endDate })

  const eventsByType: Record<string, number> = {}
  const eventsByUser: Record<string, number> = {}
  let failureCount = 0
  const securityEvents: AuditLog[] = []

  for (const log of logs) {
    // Count by type
    eventsByType[log.eventType] = (eventsByType[log.eventType] || 0) + 1

    // Count by user
    eventsByUser[log.userEmail] = (eventsByUser[log.userEmail] || 0) + 1

    // Count failures
    if (log.status === "failure") {
      failureCount++
    }

    // Track security events
    if (log.eventType === "SECURITY_EVENT") {
      securityEvents.push(log)
    }
  }

  return {
    totalEvents: logs.length,
    eventsByType: eventsByType as Record<AuditEventType, number>,
    eventsByUser,
    failureCount,
    securityEvents,
  }
}

/**
 * Exports audit logs (for compliance reporting)
 */
export function exportAuditLogs(format: "json" | "csv" = "json"): string {
  if (format === "json") {
    return JSON.stringify(auditLogs, null, 2)
  }

  // CSV format
  const headers = ["ID", "Timestamp", "Event Type", "User Email", "User Role", "Action", "Status", "Details"]
  const rows = auditLogs.map((log) => [
    log.id,
    log.timestamp.toISOString(),
    log.eventType,
    log.userEmail,
    log.userRole,
    log.action,
    log.status,
    JSON.stringify(log.details),
  ])

  const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n")

  return csv
}
