/**
 * Encrypted Vector Retrieval System with FHIR Support
 * Retrieves relevant medical context and generates safe clinical responses
 */

import { generateText } from "ai"
import { generateMedicalEmbedding } from "./medical-embeddings"
import { searchSimilarEmbeddings } from "./cyborg-db"
import { maskPHI } from "./phi-masking"
import { createClient } from "./supabase/server"

export interface RetrievalContext {
  query: string
  relevantRecords: Array<{
    resourceId: string
    resourceType: string
    content: string
    similarity: number
    clinicalContext: string
  }>
  retrievedAt: Date
}

export interface ClinicalResponse {
  response: string
  context: RetrievalContext
  confidence: number
  disclaimer: string
  generatedAt: Date
}

/**
 * Retrieves relevant medical context for a clinical question using FHIR resources
 */
export async function retrieveContext(userId: string, query: string, topK = 5): Promise<RetrievalContext> {
  try {
    console.log("[v0] Retrieving context for query:", query)

    // Generate medical embedding for the query
    const queryEmbedding = await generateMedicalEmbedding(query, "query")
    console.log("[v0] Generated query embedding with", queryEmbedding.vector.length, "dimensions")

    // Search for similar embeddings in CyborgDB
    const similarEmbeddings = await searchSimilarEmbeddings(userId, queryEmbedding.vector, topK, 0.3)
    console.log("[v0] Found", similarEmbeddings.length, "similar embeddings")

    // Fetch FHIR resources for context
    const supabase = await createClient()
    const relevantRecords = []

    for (const item of similarEmbeddings) {
      try {
        const { data: fhirResource } = await supabase
          .from("fhir_resources")
          .select("*")
          .eq("id", item.embedding.fhirResourceId)
          .eq("user_id", userId)
          .single()

        if (fhirResource) {
          relevantRecords.push({
            resourceId: fhirResource.id,
            resourceType: fhirResource.resource_type,
            content: item.embedding.metadata.sourceText,
            similarity: item.similarity,
            clinicalContext: item.embedding.metadata.clinicalContext,
          })
        }
      } catch (error) {
        console.error("[v0] Error fetching FHIR resource:", error)
      }
    }

    return {
      query,
      relevantRecords,
      retrievedAt: new Date(),
    }
  } catch (error) {
    console.error("[v0] Error retrieving context:", error)
    return {
      query,
      relevantRecords: [],
      retrievedAt: new Date(),
    }
  }
}

/**
 * Generates a safe clinical response based on retrieved FHIR context
 */
export async function generateClinicalResponse(query: string, context: RetrievalContext): Promise<ClinicalResponse> {
  try {
    // Build context string from retrieved FHIR records
    const contextString = context.relevantRecords
      .map(
        (record, idx) =>
          `Record ${idx + 1} (${record.resourceType}, ${record.clinicalContext}, Relevance: ${(record.similarity * 100).toFixed(1)}%):\n${record.content}`,
      )
      .join("\n\n")

    // Create a safe prompt that emphasizes clinical responsibility
    const systemPrompt = `You are a HIPAA-compliant medical knowledge assistant. Your role is to provide clinical information based on anonymized FHIR medical records. 

IMPORTANT GUIDELINES:
1. Never include any patient identifiers or PHI in your response
2. Provide evidence-based clinical information only
3. Always include appropriate disclaimers about consulting healthcare providers
4. Be clear about the limitations of AI-generated medical information
5. Suggest consulting with qualified healthcare professionals for diagnosis and treatment decisions
6. Do not provide specific medical advice for individual patients
7. Reference the clinical context (conditions, medications, observations) when relevant

Retrieved FHIR Context:
${contextString || "No relevant medical records found for this query."}

User Query: ${query}`

    // Generate response using AI SDK
    const { text } = await generateText({
      model: "openai/gpt-4-mini",
      system: systemPrompt,
      prompt: `Based on the retrieved FHIR medical context above, provide a comprehensive clinical response to the user's question. Remember to include appropriate disclaimers and emphasize the need for professional medical consultation.`,
      temperature: 0.7,
      maxTokens: 1000,
    })

    // Calculate confidence based on context relevance
    const confidence =
      context.relevantRecords.length > 0
        ? context.relevantRecords.reduce((sum, r) => sum + r.similarity, 0) / context.relevantRecords.length
        : 0

    const disclaimer =
      "This response is generated from anonymized FHIR medical records and should not be used as a substitute for professional medical advice. Always consult with qualified healthcare providers for diagnosis and treatment decisions."

    return {
      response: text,
      context,
      confidence: Math.min(confidence, 1),
      disclaimer,
      generatedAt: new Date(),
    }
  } catch (error) {
    console.error("[v0] Error generating clinical response:", error)

    return {
      response:
        "I encountered an error processing your request. Please try again or consult with a healthcare professional.",
      context,
      confidence: 0,
      disclaimer:
        "This response is generated from anonymized FHIR medical records and should not be used as a substitute for professional medical advice.",
      generatedAt: new Date(),
    }
  }
}

/**
 * Full retrieval and response pipeline with FHIR support
 */
export async function processQuery(userId: string, query: string): Promise<ClinicalResponse> {
  // Check for PHI in query
  const { maskedText, detectedPHI } = maskPHI(query)

  if (detectedPHI.length > 0) {
    console.warn("[v0] PHI detected in query:", detectedPHI)
    // Log for audit trail
    const supabase = await createClient()
    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "PHI_DETECTED_IN_QUERY",
      details: { detectedPHI },
      severity: "medium",
    })
  }

  // Use masked query for retrieval
  const context = await retrieveContext(userId, maskedText)

  // Generate response
  const response = await generateClinicalResponse(maskedText, context)

  return response
}

/**
 * Validates response for safety
 */
export function validateResponse(response: ClinicalResponse): {
  isValid: boolean
  issues: string[]
} {
  const issues: string[] = []

  // Check for PHI in response
  const { detectedPHI } = maskPHI(response.response)
  if (detectedPHI.length > 0) {
    issues.push("Response contains potential PHI")
  }

  // Check confidence level
  if (response.confidence < 0.3) {
    issues.push("Low confidence in response - limited relevant context found")
  }

  // Ensure disclaimer is present
  if (!response.response.toLowerCase().includes("consult") && !response.response.toLowerCase().includes("healthcare")) {
    issues.push("Response may lack appropriate medical disclaimers")
  }

  return {
    isValid: issues.length === 0,
    issues,
  }
}

/**
 * Formats response for display
 */
export function formatResponseForDisplay(response: ClinicalResponse): string {
  const sections: string[] = []

  sections.push("## Clinical Response\n")
  sections.push(response.response)
  sections.push("\n")

  if (response.context.relevantRecords.length > 0) {
    sections.push("### Supporting Evidence\n")
    sections.push(`Found ${response.context.relevantRecords.length} relevant FHIR medical records`)
    sections.push(`Average relevance score: ${(response.confidence * 100).toFixed(1)}%\n`)
  }

  sections.push("### Important Disclaimer\n")
  sections.push(response.disclaimer)

  return sections.join("\n")
}
