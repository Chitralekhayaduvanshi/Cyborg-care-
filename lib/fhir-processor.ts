/**
 * FHIR Data Pipeline
 * Processes FHIR resources, extracts clinical data, and removes PHI
 */

import { anonymizeRecord, containsPHI } from "./phi-masking"
import type { FHIRResourceType, ProcessedFHIRRecord } from "./fhir-types"

/**
 * Extracts clinical text from FHIR resources
 */
export function extractClinicalText(resource: FHIRResourceType): string {
  let text = ""

  switch (resource.resourceType) {
    case "Condition":
      const condition = resource as any
      text = `Condition: ${condition.code?.text || condition.code?.coding?.[0]?.display || "Unknown"}`
      if (condition.onsetDateTime) text += ` (Onset: ${condition.onsetDateTime})`
      break

    case "MedicationStatement":
      const medStatement = resource as any
      const medName =
        medStatement.medicationCodeableConcept?.coding?.[0]?.display ||
        medStatement.medicationReference?.reference ||
        "Unknown medication"
      text = `Medication: ${medName}`
      if (medStatement.dosage?.[0]?.doseAndRate?.[0]?.doseQuantity) {
        const dose = medStatement.dosage[0].doseAndRate[0].doseQuantity
        text += ` (${dose.value} ${dose.unit})`
      }
      if (medStatement.dosage?.[0]?.timing?.repeat?.frequency) {
        text += ` (${medStatement.dosage[0].timing.repeat.frequency}x daily)`
      }
      break

    case "Observation":
      const obs = resource as any
      text = `Observation: ${obs.code?.text || obs.code?.coding?.[0]?.display || "Unknown"}`
      if (obs.valueQuantity) {
        text += ` = ${obs.valueQuantity.value} ${obs.valueQuantity.unit}`
      } else if (obs.valueCodeableConcept) {
        text += ` = ${obs.valueCodeableConcept.coding?.[0]?.display || "Unknown"}`
      } else if (obs.valueString) {
        text += ` = ${obs.valueString}`
      }
      break

    case "DiagnosticReport":
      const report = resource as any
      text = `Diagnostic Report: ${report.code?.text || report.code?.coding?.[0]?.display || "Unknown"}`
      if (report.conclusion) text += ` - ${report.conclusion}`
      break

    default:
      text = JSON.stringify(resource).substring(0, 500)
  }

  return text
}

/**
 * Extracts structured clinical data from FHIR resources
 */
export function extractClinicalData(resource: FHIRResourceType): {
  conditions?: string[]
  medications?: string[]
  observations?: string[]
  labResults?: string[]
  clinicalNotes?: string
} {
  const data: any = {}

  switch (resource.resourceType) {
    case "Condition":
      const condition = resource as any
      data.conditions = [condition.code?.text || condition.code?.coding?.[0]?.display || "Unknown condition"]
      break

    case "MedicationStatement":
      const medStatement = resource as any
      data.medications = [
        medStatement.medicationCodeableConcept?.coding?.[0]?.display ||
          medStatement.medicationReference?.reference ||
          "Unknown medication",
      ]
      break

    case "Observation":
      const obs = resource as any
      const obsName = obs.code?.text || obs.code?.coding?.[0]?.display || "Unknown observation"
      const obsValue = obs.valueQuantity
        ? `${obs.valueQuantity.value} ${obs.valueQuantity.unit}`
        : obs.valueCodeableConcept?.coding?.[0]?.display || obs.valueString || "Unknown"
      data.observations = [`${obsName}: ${obsValue}`]
      break

    case "DiagnosticReport":
      const report = resource as any
      data.labResults = [report.code?.text || report.code?.coding?.[0]?.display || "Unknown report"]
      if (report.conclusion) data.clinicalNotes = report.conclusion
      break
  }

  return data
}

/**
 * Processes a single FHIR resource
 */
export function processFHIRResource(resource: FHIRResourceType): ProcessedFHIRRecord {
  const clinicalText = extractClinicalText(resource)
  const clinicalData = extractClinicalData(resource)

  // Check for PHI
  const phiDetected = containsPHI(clinicalText)

  // Anonymize
  const { anonymizedRecord, phiRemoved } = anonymizeRecord({
    diagnosis: clinicalData.conditions?.join(", ") || "",
    medications: clinicalData.medications?.join(", ") || "",
    notes: clinicalText,
  })

  // Create hash for audit trail
  const originalHash = hashResource(resource)

  return {
    id: resource.id,
    resourceType: resource.resourceType,
    anonymizedContent: anonymizedRecord,
    extractedClinicalData: clinicalData,
    originalHash,
    processedAt: new Date(),
    phiDetected,
    phiRemoved,
  }
}

/**
 * Processes batch of FHIR resources
 */
export function processFHIRBatch(resources: FHIRResourceType[]): {
  processed: ProcessedFHIRRecord[]
  errors: Array<{ resourceId: string; error: string }>
} {
  const processed: ProcessedFHIRRecord[] = []
  const errors: Array<{ resourceId: string; error: string }> = []

  for (const resource of resources) {
    try {
      if (!resource.id || !resource.resourceType) {
        errors.push({
          resourceId: resource?.id || "unknown",
          error: "Invalid FHIR resource format",
        })
        continue
      }

      const processedRecord = processFHIRResource(resource)
      processed.push(processedRecord)
    } catch (error) {
      errors.push({
        resourceId: resource?.id || "unknown",
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }

  return { processed, errors }
}

/**
 * Creates a hash of the FHIR resource for audit trail
 */
function hashResource(resource: FHIRResourceType): string {
  const content = JSON.stringify(resource)
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16)
}

/**
 * Validates that processed FHIR record is safe for embedding
 */
export function validateProcessedFHIRRecord(record: ProcessedFHIRRecord): boolean {
  const content = record.anonymizedContent.toLowerCase()

  // Check for common PHI patterns
  const phiPatterns = [
    /\d{3}-\d{2}-\d{4}/, // SSN
    /\d{3}-\d{3}-\d{4}/, // Phone
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, // Email
    /\b[A-Z][a-z]+ [A-Z][a-z]+\b/, // Full names
  ]

  return !phiPatterns.some((pattern) => pattern.test(content))
}
