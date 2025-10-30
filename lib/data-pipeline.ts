/**
 * Data Pipeline for Medical Records
 * Handles collection, cleaning, and preparation of medical data
 */

import { anonymizeRecord, containsPHI } from "./phi-masking"

export interface RawMedicalRecord {
  id: string
  patientId: string
  name: string
  dob: string
  mrn: string
  diagnosis: string
  medications: string
  notes: string
  timestamp: Date
}

export interface ProcessedMedicalRecord {
  id: string
  anonymizedContent: string
  originalHash: string
  processedAt: Date
  phiDetected: boolean
  phiRemoved: string[]
}

/**
 * Validates medical record format
 */
export function validateRecord(record: unknown): record is RawMedicalRecord {
  if (typeof record !== "object" || record === null) return false

  const r = record as Record<string, unknown>
  return (
    typeof r.id === "string" &&
    typeof r.patientId === "string" &&
    typeof r.name === "string" &&
    typeof r.dob === "string" &&
    typeof r.mrn === "string" &&
    typeof r.diagnosis === "string" &&
    typeof r.medications === "string" &&
    typeof r.notes === "string"
  )
}

/**
 * Processes a single medical record
 * Removes PHI and prepares for embedding generation
 */
export function processRecord(record: RawMedicalRecord): ProcessedMedicalRecord {
  // Check for PHI in all fields
  const phiDetected =
    containsPHI(record.name) ||
    containsPHI(record.dob) ||
    containsPHI(record.mrn) ||
    containsPHI(record.diagnosis) ||
    containsPHI(record.medications) ||
    containsPHI(record.notes)

  // Anonymize the record
  const { anonymizedRecord, phiRemoved } = anonymizeRecord({
    diagnosis: record.diagnosis,
    medications: record.medications,
    notes: record.notes,
  })

  // Create hash of original for audit trail
  const originalHash = hashRecord(record)

  return {
    id: record.id,
    anonymizedContent: anonymizedRecord,
    originalHash,
    processedAt: new Date(),
    phiDetected,
    phiRemoved,
  }
}

/**
 * Processes batch of medical records
 */
export function processBatch(records: RawMedicalRecord[]): {
  processed: ProcessedMedicalRecord[]
  errors: Array<{ recordId: string; error: string }>
} {
  const processed: ProcessedMedicalRecord[] = []
  const errors: Array<{ recordId: string; error: string }> = []

  for (const record of records) {
    try {
      if (!validateRecord(record)) {
        errors.push({
          recordId: record?.id || "unknown",
          error: "Invalid record format",
        })
        continue
      }

      const processedRecord = processRecord(record)
      processed.push(processedRecord)
    } catch (error) {
      errors.push({
        recordId: record?.id || "unknown",
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }

  return { processed, errors }
}

/**
 * Creates a hash of the record for audit trail
 * (In production, use a proper cryptographic hash)
 */
function hashRecord(record: RawMedicalRecord): string {
  const content = JSON.stringify(record)
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16)
}

/**
 * Validates that processed record is safe for embedding
 */
export function validateProcessedRecord(record: ProcessedMedicalRecord): boolean {
  // Ensure no obvious PHI remains
  const content = record.anonymizedContent.toLowerCase()

  // Check for common PHI patterns in processed content
  const phiPatterns = [
    /\d{3}-\d{2}-\d{4}/, // SSN
    /\d{3}-\d{3}-\d{4}/, // Phone
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, // Email
  ]

  return !phiPatterns.some((pattern) => pattern.test(content))
}
