"use server"

/**
 * Server actions for authentication
 * These can be called from client components safely
 */

import { createUserProfile as createUserProfileServer } from "@/lib/auth-server"

export async function createUserProfileAction(userId: string, email: string, fullName: string, licenseNumber?: string) {
  return await createUserProfileServer(userId, email, fullName, "clinician", undefined, licenseNumber)
}
