/**
 * FHIR (Fast Healthcare Interoperability Resources) Type Definitions
 * Supports common clinical resources: Patient, Condition, Medication, Observation, etc.
 */

export interface FHIRResource {
  resourceType: string
  id: string
  meta?: {
    versionId?: string
    lastUpdated?: string
    profile?: string[]
  }
}

export interface FHIRPatient extends FHIRResource {
  resourceType: "Patient"
  identifier?: Array<{
    system?: string
    value?: string
  }>
  name?: Array<{
    use?: string
    family?: string
    given?: string[]
  }>
  birthDate?: string
  gender?: "male" | "female" | "other" | "unknown"
  address?: Array<{
    use?: string
    line?: string[]
    city?: string
    state?: string
    postalCode?: string
  }>
}

export interface FHIRCondition extends FHIRResource {
  resourceType: "Condition"
  subject: {
    reference: string
  }
  code: {
    coding: Array<{
      system: string
      code: string
      display: string
    }>
    text?: string
  }
  onsetDateTime?: string
  abatementDateTime?: string
  recordedDate?: string
  clinicalStatus?: {
    coding: Array<{
      system: string
      code: string
    }>
  }
}

export interface FHIRMedication extends FHIRResource {
  resourceType: "Medication"
  code: {
    coding: Array<{
      system: string
      code: string
      display: string
    }>
    text?: string
  }
  form?: {
    coding: Array<{
      system: string
      code: string
      display: string
    }>
  }
}

export interface FHIRMedicationStatement extends FHIRResource {
  resourceType: "MedicationStatement"
  subject: {
    reference: string
  }
  medicationReference?: {
    reference: string
  }
  medicationCodeableConcept?: {
    coding: Array<{
      system: string
      code: string
      display: string
    }>
  }
  effectiveDateTime?: string
  dosage?: Array<{
    text?: string
    timing?: {
      repeat?: {
        frequency?: number
        period?: number
        periodUnit?: string
      }
    }
    route?: {
      coding: Array<{
        system: string
        code: string
        display: string
      }>
    }
    doseAndRate?: Array<{
      doseQuantity?: {
        value: number
        unit: string
      }
    }>
  }>
}

export interface FHIRObservation extends FHIRResource {
  resourceType: "Observation"
  subject: {
    reference: string
  }
  code: {
    coding: Array<{
      system: string
      code: string
      display: string
    }>
    text?: string
  }
  effectiveDateTime?: string
  valueQuantity?: {
    value: number
    unit: string
    system?: string
    code?: string
  }
  valueCodeableConcept?: {
    coding: Array<{
      system: string
      code: string
      display: string
    }>
    text?: string
  }
  valueString?: string
  interpretation?: Array<{
    coding: Array<{
      system: string
      code: string
      display: string
    }>
  }>
  referenceRange?: Array<{
    low?: {
      value: number
      unit: string
    }
    high?: {
      value: number
      unit: string
    }
  }>
}

export interface FHIRDiagnosticReport extends FHIRResource {
  resourceType: "DiagnosticReport"
  subject: {
    reference: string
  }
  code: {
    coding: Array<{
      system: string
      code: string
      display: string
    }>
    text?: string
  }
  effectiveDateTime?: string
  issued?: string
  result?: Array<{
    reference: string
  }>
  conclusion?: string
}

export type FHIRResourceType =
  | FHIRPatient
  | FHIRCondition
  | FHIRMedication
  | FHIRMedicationStatement
  | FHIRObservation
  | FHIRDiagnosticReport

export interface ProcessedFHIRRecord {
  id: string
  resourceType: string
  anonymizedContent: string
  extractedClinicalData: {
    conditions?: string[]
    medications?: string[]
    observations?: string[]
    labResults?: string[]
    clinicalNotes?: string
  }
  originalHash: string
  processedAt: Date
  phiDetected: boolean
  phiRemoved: string[]
}
