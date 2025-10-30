/**
 * Vector Storage Management
 * Handles storage and retrieval of encrypted embeddings
 * Simulates CyborgDB functionality for demonstration
 */

import type { StoredEmbedding, EmbeddingVector } from "./embeddings"
import { encryptData, decryptData, generateEncryptionKey } from "./encryption"

export interface VectorStore {
  id: string
  embeddings: Map<string, StoredEmbedding>
  encryptionKey: CryptoKey
  createdAt: Date
  lastUpdated: Date
}

// In-memory store for demonstration
// In production, use CyborgDB or similar encrypted vector database
let vectorStore: VectorStore | null = null

/**
 * Initializes the vector store with encryption
 */
export async function initializeVectorStore(): Promise<VectorStore> {
  const encryptionKey = await generateEncryptionKey()

  vectorStore = {
    id: `store_${Date.now()}`,
    embeddings: new Map(),
    encryptionKey,
    createdAt: new Date(),
    lastUpdated: new Date(),
  }

  return vectorStore
}

/**
 * Gets the current vector store
 */
export function getVectorStore(): VectorStore {
  if (!vectorStore) {
    throw new Error("Vector store not initialized. Call initializeVectorStore first.")
  }
  return vectorStore
}

/**
 * Stores an embedding with encryption
 */
export async function storeEmbedding(embedding: EmbeddingVector): Promise<StoredEmbedding> {
  const store = getVectorStore()

  // Encrypt the vector
  const vectorJson = JSON.stringify(embedding.vector)
  const encryptedVector = await encryptData(vectorJson, store.encryptionKey)

  // Encrypt metadata
  const metadataJson = JSON.stringify(embedding.metadata)
  const encryptedMetadata = await encryptData(metadataJson, store.encryptionKey)

  const storedEmbedding: StoredEmbedding = {
    ...embedding,
    encryptedVector,
    encryptedMetadata,
  }

  store.embeddings.set(embedding.id, storedEmbedding)
  store.lastUpdated = new Date()

  return storedEmbedding
}

/**
 * Stores multiple embeddings
 */
export async function storeBatchEmbeddings(embeddings: EmbeddingVector[]): Promise<{
  stored: StoredEmbedding[]
  errors: Array<{ embeddingId: string; error: string }>
}> {
  const stored: StoredEmbedding[] = []
  const errors: Array<{ embeddingId: string; error: string }> = []

  for (const embedding of embeddings) {
    try {
      const storedEmbedding = await storeEmbedding(embedding)
      stored.push(storedEmbedding)
    } catch (error) {
      errors.push({
        embeddingId: embedding.id,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }

  return { stored, errors }
}

/**
 * Retrieves and decrypts an embedding
 */
export async function retrieveEmbedding(embeddingId: string): Promise<EmbeddingVector | null> {
  const store = getVectorStore()
  const storedEmbedding = store.embeddings.get(embeddingId)

  if (!storedEmbedding) {
    return null
  }

  try {
    // Decrypt vector
    const vectorJson = await decryptData(storedEmbedding.encryptedVector, store.encryptionKey)
    const vector = JSON.parse(vectorJson)

    // Decrypt metadata
    const metadataJson = await decryptData(storedEmbedding.encryptedMetadata, store.encryptionKey)
    const metadata = JSON.parse(metadataJson)

    return {
      id: storedEmbedding.id,
      recordId: storedEmbedding.recordId,
      vector,
      metadata,
    }
  } catch (error) {
    console.error("Error decrypting embedding:", error)
    throw new Error(`Failed to decrypt embedding: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

/**
 * Retrieves all embeddings for a record
 */
export async function retrieveRecordEmbeddings(recordId: string): Promise<EmbeddingVector[]> {
  const store = getVectorStore()
  const embeddings: EmbeddingVector[] = []

  for (const storedEmbedding of store.embeddings.values()) {
    if (storedEmbedding.recordId === recordId) {
      const embedding = await retrieveEmbedding(storedEmbedding.id)
      if (embedding) {
        embeddings.push(embedding)
      }
    }
  }

  return embeddings
}

/**
 * Searches for similar embeddings
 */
export async function searchSimilarEmbeddings(
  queryVector: number[],
  topK = 5,
): Promise<Array<EmbeddingVector & { similarity: number }>> {
  const store = getVectorStore()
  const results: Array<EmbeddingVector & { similarity: number }> = []

  for (const storedEmbedding of store.embeddings.values()) {
    try {
      const embedding = await retrieveEmbedding(storedEmbedding.id)
      if (embedding) {
        const similarity = cosineSimilarity(queryVector, embedding.vector)
        results.push({
          ...embedding,
          similarity,
        })
      }
    } catch (error) {
      console.error(`Error processing embedding ${storedEmbedding.id}:`, error)
    }
  }

  return results.sort((a, b) => b.similarity - a.similarity).slice(0, topK)
}

/**
 * Deletes an embedding
 */
export function deleteEmbedding(embeddingId: string): boolean {
  const store = getVectorStore()
  const deleted = store.embeddings.delete(embeddingId)
  if (deleted) {
    store.lastUpdated = new Date()
  }
  return deleted
}

/**
 * Gets store statistics
 */
export function getStoreStats(): {
  totalEmbeddings: number
  createdAt: Date
  lastUpdated: Date
  storeId: string
} {
  const store = getVectorStore()
  return {
    totalEmbeddings: store.embeddings.size,
    createdAt: store.createdAt,
    lastUpdated: store.lastUpdated,
    storeId: store.id,
  }
}

/**
 * Cosine similarity calculation
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
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
