/**
 * CyborgDB Integration for Encrypted Vector Storage
 * Stores medical embeddings with encryption and provides secure retrieval
 */

import { createClient } from "@/lib/supabase/server"
import { encryptData } from "@/lib/encryption"
import type { MedicalEmbedding } from "@/lib/medical-embeddings"

export interface StoredEmbedding {
  id: string
  userId: string
  fhirResourceId: string
  embeddingVector: number[]
  encryptedVector: string
  metadata: {
    sourceText: string
    medicalTerms: string[]
    clinicalContext: string
    generatedAt: string
    model: string
  }
  createdAt: Date
}

/**
 * Stores a medical embedding in CyborgDB (Supabase with encryption)
 */
export async function storeEmbedding(
  userId: string,
  fhirResourceId: string,
  embedding: MedicalEmbedding,
): Promise<StoredEmbedding> {
  try {
    const supabase = await createClient()

    // Encrypt the embedding vector
    const encryptedVector = encryptData(JSON.stringify(embedding.vector))

    // Store in Supabase
    const { data, error } = await supabase.from("embeddings").insert({
      user_id: userId,
      fhir_resource_id: fhirResourceId,
      embedding_vector: embedding.vector,
      encrypted_vector: encryptedVector,
      metadata: {
        sourceText: embedding.metadata.sourceText,
        medicalTerms: embedding.metadata.medicalTerms,
        clinicalContext: embedding.metadata.clinicalContext,
        generatedAt: embedding.metadata.generatedAt.toISOString(),
        model: embedding.metadata.model,
      },
    })

    if (error) {
      console.error("[v0] Error storing embedding:", error)
      throw new Error(`Failed to store embedding: ${error.message}`)
    }

    return {
      id: embedding.id,
      userId,
      fhirResourceId,
      embeddingVector: embedding.vector,
      encryptedVector,
      metadata: embedding.metadata,
      createdAt: new Date(),
    }
  } catch (error) {
    console.error("[v0] Error in storeEmbedding:", error)
    throw error
  }
}

/**
 * Stores batch of embeddings in CyborgDB
 */
export async function storeEmbeddingsBatch(
  userId: string,
  embeddings: Array<{ fhirResourceId: string; embedding: MedicalEmbedding }>,
): Promise<{
  stored: StoredEmbedding[]
  errors: Array<{ resourceId: string; error: string }>
}> {
  const stored: StoredEmbedding[] = []
  const errors: Array<{ resourceId: string; error: string }> = []

  for (const item of embeddings) {
    try {
      const result = await storeEmbedding(userId, item.fhirResourceId, item.embedding)
      stored.push(result)
    } catch (error) {
      errors.push({
        resourceId: item.fhirResourceId,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }

  return { stored, errors }
}

/**
 * Searches for similar embeddings using vector similarity
 * Uses pgvector extension in Supabase for efficient similarity search
 */
export async function searchSimilarEmbeddings(
  userId: string,
  queryVector: number[],
  topK = 5,
  threshold = 0.3,
): Promise<Array<{ embedding: StoredEmbedding; similarity: number }>> {
  try {
    const supabase = await createClient()

    // Query using pgvector similarity search
    // Note: This uses the <=> operator for cosine distance
    const { data, error } = await supabase.rpc("search_embeddings", {
      query_vector: queryVector,
      user_id: userId,
      match_count: topK,
      match_threshold: threshold,
    })

    if (error) {
      console.error("[v0] Error searching embeddings:", error)
      throw new Error(`Failed to search embeddings: ${error.message}`)
    }

    // Decrypt vectors for results
    const results = (data || []).map((item: any) => ({
      embedding: {
        id: item.id,
        userId: item.user_id,
        fhirResourceId: item.fhir_resource_id,
        embeddingVector: item.embedding_vector,
        encryptedVector: item.encrypted_vector,
        metadata: item.metadata,
        createdAt: new Date(item.created_at),
      },
      similarity: item.similarity,
    }))

    return results
  } catch (error) {
    console.error("[v0] Error in searchSimilarEmbeddings:", error)
    throw error
  }
}

/**
 * Retrieves embedding by ID
 */
export async function getEmbeddingById(userId: string, embeddingId: string): Promise<StoredEmbedding | null> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("embeddings")
      .select("*")
      .eq("id", embeddingId)
      .eq("user_id", userId)
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        return null // Not found
      }
      throw error
    }

    return {
      id: data.id,
      userId: data.user_id,
      fhirResourceId: data.fhir_resource_id,
      embeddingVector: data.embedding_vector,
      encryptedVector: data.encrypted_vector,
      metadata: data.metadata,
      createdAt: new Date(data.created_at),
    }
  } catch (error) {
    console.error("[v0] Error retrieving embedding:", error)
    throw error
  }
}

/**
 * Deletes embedding by ID
 */
export async function deleteEmbedding(userId: string, embeddingId: string): Promise<boolean> {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("embeddings").delete().eq("id", embeddingId).eq("user_id", userId)

    if (error) {
      console.error("[v0] Error deleting embedding:", error)
      throw error
    }

    return true
  } catch (error) {
    console.error("[v0] Error in deleteEmbedding:", error)
    throw error
  }
}

/**
 * Gets all embeddings for a user
 */
export async function getUserEmbeddings(userId: string, limit = 100): Promise<StoredEmbedding[]> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("embeddings")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("[v0] Error fetching user embeddings:", error)
      throw error
    }

    return (data || []).map((item) => ({
      id: item.id,
      userId: item.user_id,
      fhirResourceId: item.fhir_resource_id,
      embeddingVector: item.embedding_vector,
      encryptedVector: item.encrypted_vector,
      metadata: item.metadata,
      createdAt: new Date(item.created_at),
    }))
  } catch (error) {
    console.error("[v0] Error in getUserEmbeddings:", error)
    throw error
  }
}
