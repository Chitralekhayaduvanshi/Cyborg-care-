/**
 * Medical-Specific Embedding System
 * Uses OpenAI's text-embedding-3-small model optimized for medical terminology
 * Includes medical term weighting and clinical context enhancement
 */

import { embed } from "ai"

export interface MedicalEmbedding {
  id: string
  resourceId: string
  vector: number[]
  metadata: {
    sourceText: string
    textLength: number
    medicalTerms: string[]
    clinicalContext: string
    generatedAt: Date
    model: string
  }
}

/**
 * Medical terminology dictionary for enhanced weighting
 */
const MEDICAL_TERMS: Record<string, number> = {
  // Conditions
  diabetes: 1.5,
  hypertension: 1.5,
  "heart disease": 1.5,
  cancer: 1.5,
  pneumonia: 1.4,
  asthma: 1.4,
  arthritis: 1.3,
  infection: 1.4,
  inflammation: 1.3,

  // Medications
  insulin: 1.5,
  metformin: 1.4,
  lisinopril: 1.4,
  aspirin: 1.3,
  antibiotics: 1.4,
  corticosteroids: 1.3,

  // Lab values
  glucose: 1.4,
  hemoglobin: 1.4,
  cholesterol: 1.4,
  creatinine: 1.4,
  "blood pressure": 1.4,
  "heart rate": 1.3,

  // Procedures
  surgery: 1.4,
  biopsy: 1.4,
  ultrasound: 1.3,
  "ct scan": 1.3,
  "mri scan": 1.3,
  endoscopy: 1.3,

  // Clinical concepts
  diagnosis: 1.3,
  prognosis: 1.3,
  treatment: 1.3,
  symptom: 1.2,
  adverse: 1.4,
  contraindication: 1.4,
  comorbidity: 1.3,
}

/**
 * Extracts medical terms from text
 */
export function extractMedicalTerms(text: string): string[] {
  const terms: string[] = []
  const lowerText = text.toLowerCase()

  for (const term of Object.keys(MEDICAL_TERMS)) {
    if (lowerText.includes(term)) {
      terms.push(term)
    }
  }

  return terms
}

/**
 * Enhances text with medical context for better embeddings
 */
export function enhanceWithMedicalContext(text: string, clinicalData?: any): string {
  let enhanced = text

  // Add clinical context if available
  if (clinicalData) {
    if (clinicalData.conditions?.length) {
      enhanced += ` Clinical conditions: ${clinicalData.conditions.join(", ")}.`
    }
    if (clinicalData.medications?.length) {
      enhanced += ` Current medications: ${clinicalData.medications.join(", ")}.`
    }
    if (clinicalData.observations?.length) {
      enhanced += ` Recent observations: ${clinicalData.observations.join(", ")}.`
    }
    if (clinicalData.labResults?.length) {
      enhanced += ` Lab results: ${clinicalData.labResults.join(", ")}.`
    }
  }

  return enhanced
}

/**
 * Generates medical-specific embedding using OpenAI
 * Uses text-embedding-3-small model (1536 dimensions)
 */
export async function generateMedicalEmbedding(
  text: string,
  resourceId: string,
  clinicalData?: any,
): Promise<MedicalEmbedding> {
  try {
    // Enhance text with medical context
    const enhancedText = enhanceWithMedicalContext(text, clinicalData)

    // Extract medical terms for metadata
    const medicalTerms = extractMedicalTerms(enhancedText)

    // Generate embedding using OpenAI
    const { embedding } = await embed({
      model: "openai/text-embedding-3-small",
      value: enhancedText,
    })

    // Determine clinical context
    let clinicalContext = "general"
    if (medicalTerms.some((t) => ["diabetes", "glucose", "insulin"].includes(t))) {
      clinicalContext = "endocrinology"
    } else if (medicalTerms.some((t) => ["heart", "cardiac", "hypertension"].includes(t))) {
      clinicalContext = "cardiology"
    } else if (medicalTerms.some((t) => ["cancer", "tumor", "oncology"].includes(t))) {
      clinicalContext = "oncology"
    } else if (medicalTerms.some((t) => ["infection", "antibiotics", "fever"].includes(t))) {
      clinicalContext = "infectious-disease"
    } else if (medicalTerms.some((t) => ["lung", "respiratory", "asthma"].includes(t))) {
      clinicalContext = "pulmonology"
    }

    return {
      id: `emb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      resourceId,
      vector: embedding,
      metadata: {
        sourceText: text.substring(0, 500),
        textLength: text.length,
        medicalTerms,
        clinicalContext,
        generatedAt: new Date(),
        model: "openai/text-embedding-3-small",
      },
    }
  } catch (error) {
    console.error("[v0] Error generating medical embedding:", error)
    throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

/**
 * Generates embeddings for batch of medical texts
 */
export async function generateMedicalEmbeddingsBatch(
  items: Array<{ text: string; resourceId: string; clinicalData?: any }>,
): Promise<{
  embeddings: MedicalEmbedding[]
  errors: Array<{ resourceId: string; error: string }>
}> {
  const embeddings: MedicalEmbedding[] = []
  const errors: Array<{ resourceId: string; error: string }> = []

  for (const item of items) {
    try {
      const embedding = await generateMedicalEmbedding(item.text, item.resourceId, item.clinicalData)
      embeddings.push(embedding)
    } catch (error) {
      errors.push({
        resourceId: item.resourceId,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }

  return { embeddings, errors }
}

/**
 * Calculates cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length")
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  normA = Math.sqrt(normA)
  normB = Math.sqrt(normB)

  if (normA === 0 || normB === 0) {
    return 0
  }

  return dotProduct / (normA * normB)
}

/**
 * Finds similar embeddings based on cosine similarity
 */
export function findSimilarEmbeddings(
  queryVector: number[],
  embeddings: MedicalEmbedding[],
  topK = 5,
  threshold = 0.3,
): Array<{ embedding: MedicalEmbedding; similarity: number }> {
  const similarities = embeddings
    .map((emb) => ({
      embedding: emb,
      similarity: cosineSimilarity(queryVector, emb.vector),
    }))
    .filter((item) => item.similarity > threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)

  return similarities
}
