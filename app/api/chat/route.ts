/**
 * Chat API Route with Supabase Auth and FHIR Support
 * Handles authenticated chat requests with medical context retrieval
 */

import { type NextRequest, NextResponse } from "next/server"
import { processQuery } from "@/lib/retrieval"
import { validateResponse, formatResponseForDisplay } from "@/lib/retrieval"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.log("[v0] Unauthorized chat attempt - no authenticated user")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { message } = await request.json()

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Invalid message format" }, { status: 400 })
    }

    console.log("[v0] Processing chat request for user:", user.id)

    const clinicalResponse = await processQuery(user.id, message)

    // Validate response for safety
    const validation = validateResponse(clinicalResponse)
    if (!validation.isValid) {
      console.warn("[v0] Response validation issues:", validation.issues)
    }

    // Format response for display
    const formattedResponse = formatResponseForDisplay(clinicalResponse)

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "CHAT_QUERY",
      details: {
        query: message,
        confidence: clinicalResponse.confidence,
        contextRecords: clinicalResponse.context.relevantRecords.length,
      },
      severity: "info",
    })

    return NextResponse.json({
      response: formattedResponse,
      confidence: clinicalResponse.confidence,
      contextRecords: clinicalResponse.context.relevantRecords.length,
      resourceTypes: clinicalResponse.context.relevantRecords.map((r) => r.resourceType),
    })
  } catch (error) {
    console.error("[v0] Chat API error:", error)

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "CHAT_ERROR",
        details: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
        severity: "high",
      })
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
