/**
 * FHIR Resource Upload API
 * Allows authenticated users to upload FHIR resources for medical context
 */

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { processFHIRResource } from "@/lib/fhir-processor"
import { generateMedicalEmbedding } from "@/lib/medical-embeddings"
import { storeEmbedding } from "@/lib/cyborg-db"
import type { FHIRResourceType } from "@/lib/fhir-types"

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { fhirResource } = await request.json()

    if (!fhirResource || !fhirResource.resourceType || !fhirResource.id) {
      return NextResponse.json({ error: "Invalid FHIR resource format" }, { status: 400 })
    }

    console.log("[v0] Processing FHIR resource:", fhirResource.resourceType, fhirResource.id)

    // Process FHIR resource (anonymize, extract clinical data)
    const processedRecord = processFHIRResource(fhirResource as FHIRResourceType)

    // Store FHIR resource in database
    const { data: storedResource, error: storeError } = await supabase.from("fhir_resources").insert({
      user_id: user.id,
      resource_type: fhirResource.resourceType,
      resource_id: fhirResource.id,
      resource_data: fhirResource,
    })

    if (storeError) {
      console.error("[v0] Error storing FHIR resource:", storeError)
      return NextResponse.json({ error: "Failed to store FHIR resource" }, { status: 500 })
    }

    // Generate medical embedding
    const embedding = await generateMedicalEmbedding(
      processedRecord.anonymizedContent,
      fhirResource.id,
      processedRecord.extractedClinicalData,
    )

    // Store embedding in CyborgDB
    const resourceId = storedResource?.[0]?.id || fhirResource.id
    await storeEmbedding(user.id, resourceId, embedding)

    // Log for audit trail
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "FHIR_RESOURCE_UPLOADED",
      resource_type: fhirResource.resourceType,
      resource_id: fhirResource.id,
      details: {
        phiDetected: processedRecord.phiDetected,
        phiRemoved: processedRecord.phiRemoved,
        clinicalContext: embedding.metadata.clinicalContext,
      },
      severity: "info",
    })

    return NextResponse.json({
      success: true,
      resourceId: fhirResource.id,
      resourceType: fhirResource.resourceType,
      phiDetected: processedRecord.phiDetected,
      clinicalContext: embedding.metadata.clinicalContext,
    })
  } catch (error) {
    console.error("[v0] FHIR upload error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
