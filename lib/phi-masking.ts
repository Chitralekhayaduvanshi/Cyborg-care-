/**
 * PHI (Protected Health Information) Masking Utilities
 * Removes or masks sensitive patient identifiers before processing
 */

// Common PHI patterns to detect and mask
const PHI_PATTERNS = {
  // Social Security Numbers (XXX-XX-XXXX)
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  // Medical Record Numbers (various formats)
  mrn: /\b(MRN|MR#|Medical Record)[\s:]*([A-Z0-9]{6,})\b/gi,
  // Patient names (common patterns)
  patientName: /\b(Patient|Pt|Name)[\s:]*([A-Z][a-z]+ [A-Z][a-z]+)\b/gi,
  // Dates of birth
  dob: /\b(DOB|Date of Birth)[\s:]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/gi,
  // Phone numbers
  phone: /\b(\d{3}[-.]?\d{3}[-.]?\d{4})\b/g,
  // Email addresses
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  // Account/Insurance numbers
  accountNumber: /\b(Account|Policy|Insurance)[\s:]*([A-Z0-9]{8,})\b/gi,
  // Hospital/Facility names with patient context
  facilityWithPatient: /\b(at|from|admitted to)[\s]+([A-Z][a-z\s]+Hospital|Medical Center|Clinic)\b/gi,
}

interface MaskingResult {
  maskedText: string
  detectedPHI: Array<{
    type: string
    value: string
    position: number
  }>
}

/**
 * Masks all detected PHI in the provided text
 * @param text - The text to mask
 * @returns Masked text and list of detected PHI
 */
export function maskPHI(text: string): MaskingResult {
  let maskedText = text
  const detectedPHI: MaskingResult["detectedPHI"] = []

  // Process each PHI pattern
  Object.entries(PHI_PATTERNS).forEach(([type, pattern]) => {
    let match
    const regex = new RegExp(pattern)

    // Reset regex for global patterns
    if (pattern.global) {
      while ((match = pattern.exec(text)) !== null) {
        detectedPHI.push({
          type,
          value: match[0],
          position: match.index,
        })
        // Replace with masked version
        maskedText = maskedText.replace(match[0], `[${type.toUpperCase()}_MASKED]`)
      }
    }
  })

  return {
    maskedText,
    detectedPHI,
  }
}

/**
 * Validates if text contains PHI
 * @param text - The text to validate
 * @returns true if PHI is detected
 */
export function containsPHI(text: string): boolean {
  return Object.values(PHI_PATTERNS).some((pattern) => {
    const regex = new RegExp(pattern)
    return regex.test(text)
  })
}

/**
 * Removes all detected PHI from text (more aggressive than masking)
 * @param text - The text to clean
 * @returns Cleaned text without PHI
 */
export function removePHI(text: string): string {
  let cleanedText = text

  Object.values(PHI_PATTERNS).forEach((pattern) => {
    cleanedText = cleanedText.replace(pattern, "")
  })

  return cleanedText.replace(/\s+/g, " ").trim()
}

/**
 * Extracts and anonymizes medical records
 * Converts patient-specific data to generic clinical information
 * @param record - Raw medical record
 * @returns Anonymized record safe for processing
 */
export function anonymizeRecord(record: {
  patientId?: string
  name?: string
  dob?: string
  mrn?: string
  diagnosis?: string
  medications?: string
  notes?: string
}): {
  anonymizedRecord: string
  phiRemoved: string[]
} {
  const phiRemoved: string[] = []
  let anonymizedRecord = ""

  // Process diagnosis (keep clinical content)
  if (record.diagnosis) {
    const { maskedText, detectedPHI } = maskPHI(record.diagnosis)
    anonymizedRecord += `Diagnosis: ${maskedText}\n`
    phiRemoved.push(...detectedPHI.map((p) => p.value))
  }

  // Process medications (keep clinical content)
  if (record.medications) {
    const { maskedText, detectedPHI } = maskPHI(record.medications)
    anonymizedRecord += `Medications: ${maskedText}\n`
    phiRemoved.push(...detectedPHI.map((p) => p.value))
  }

  // Process clinical notes
  if (record.notes) {
    const { maskedText, detectedPHI } = maskPHI(record.notes)
    anonymizedRecord += `Clinical Notes: ${maskedText}\n`
    phiRemoved.push(...detectedPHI.map((p) => p.value))
  }

  return {
    anonymizedRecord: anonymizedRecord.trim(),
    phiRemoved,
  }
}
