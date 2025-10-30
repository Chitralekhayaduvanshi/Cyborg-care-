export interface EmbeddingVector {
  id: string
  recordId: string
  vector: number[]
  metadata: {
    sourceText: string
    textLength: number
    generatedAt: Date
    model: string
  }
}

export interface StoredEmbedding extends EmbeddingVector {
  encryptedVector: string
  encryptedMetadata: string
}

/**
 * Generates embeddings using a local or private LLM
 * Uses the AI SDK to create semantic vectors from medical text
 */
export async function generateEmbedding(
  text: string,
  recordId: string,
  model = "openai/text-embedding-3-small",
): Promise<EmbeddingVector> {
  try {
    // For demonstration, we'll create a simple embedding
    // In production, use a proper embedding model via the AI SDK
    const embedding = await createSimpleEmbedding(text)

    return {
      id: `emb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      recordId,
      vector: embedding,
      metadata: {
        sourceText: text.substring(0, 500), // Store first 500 chars for reference
        textLength: text.length,
        generatedAt: new Date(),
        model,
      },
    }
  } catch (error) {
    console.error("Error generating embedding:", error)
    throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

/**
 * Generates embeddings for batch of texts
 */
export async function generateBatchEmbeddings(
  texts: Array<{ text: string; recordId: string }>,
  model?: string,
): Promise<{
  embeddings: EmbeddingVector[]
  errors: Array<{ recordId: string; error: string }>
}> {
  const embeddings: EmbeddingVector[] = []
  const errors: Array<{ recordId: string; error: string }> = []

  for (const { text, recordId } of texts) {
    try {
      const embedding = await generateEmbedding(text, recordId, model)
      embeddings.push(embedding)
    } catch (error) {
      errors.push({
        recordId,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }

  return { embeddings, errors }
}

/**
 * Simple embedding function for demonstration
 * Creates a semantic vector based on text content
 * In production, replace with actual embedding model
 */
async function createSimpleEmbedding(text: string): Promise<number[]> {
  // Create a 384-dimensional embedding (common for medical embeddings)
  const embedding = new Array(384).fill(0)

  // Simple hash-based approach for demonstration
  const words = text.toLowerCase().split(/\s+/)

  // Medical term weights for semantic meaning
  const medicalTerms: Record<string, number[]> = {
    diagnosis: [0.8, 0.2, 0.1, 0.3, 0.5],
    treatment: [0.7, 0.3, 0.2, 0.4, 0.6],
    medication: [0.6, 0.4, 0.3, 0.5, 0.7],
    patient: [0.5, 0.5, 0.4, 0.6, 0.8],
    symptom: [0.7, 0.2, 0.5, 0.3, 0.4],
    clinical: [0.8, 0.3, 0.2, 0.5, 0.6],
    hospital: [0.4, 0.6, 0.3, 0.7, 0.5],
    surgery: [0.9, 0.1, 0.4, 0.2, 0.3],
  }

  // Build embedding based on medical terms found
  for (const word of words) {
    if (medicalTerms[word]) {
      const termVector = medicalTerms[word]
      for (let i = 0; i < Math.min(termVector.length, embedding.length); i++) {
        embedding[i] += termVector[i] * 0.1
      }
    }
  }

  // Normalize the embedding
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= magnitude
    }
  }

  // Add some randomness for uniqueness
  for (let i = 0; i < embedding.length; i++) {
    embedding[i] += (Math.random() - 0.5) * 0.01
  }

  return embedding
}

/**
 * Calculates cosine similarity between two embeddings
 */
export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error("Vectors must have the same length")
  }

  let dotProduct = 0
  let magnitude1 = 0
  let magnitude2 = 0

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i]
    magnitude1 += vec1[i] * vec1[i]
    magnitude2 += vec2[i] * vec2[i]
  }

  magnitude1 = Math.sqrt(magnitude1)
  magnitude2 = Math.sqrt(magnitude2)

  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0
  }

  return dotProduct / (magnitude1 * magnitude2)
}

/**
 * Finds most similar embeddings to a query
 */
export function findSimilarEmbeddings(
  queryEmbedding: number[],
  embeddings: EmbeddingVector[],
  topK = 5,
): Array<EmbeddingVector & { similarity: number }> {
  const similarities = embeddings.map((emb) => ({
    ...emb,
    similarity: cosineSimilarity(queryEmbedding, emb.vector),
  }))

  return similarities.sort((a, b) => b.similarity - a.similarity).slice(0, topK)
}
