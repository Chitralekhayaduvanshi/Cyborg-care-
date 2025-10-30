/**
 * Server-only authentication functions
 * These functions use next/headers and must only be called on the server
 */

import { createClient } from "@/lib/supabase/server"

export type UserRole = "clinician" | "admin" | "auditor" | "viewer"

export interface User {
  id: string
  email: string
  fullName?: string
  role: UserRole
  department?: string
  licenseNumber?: string
  specialization?: string
  createdAt: Date
  isActive: boolean
}

// Role-based permissions
const rolePermissions: Record<UserRole, string[]> = {
  clinician: ["query:medical", "view:results", "access:records", "upload:fhir"],
  admin: ["query:medical", "view:results", "access:records", "manage:users", "view:audit", "upload:fhir"],
  auditor: ["view:audit", "view:results", "access:records"],
  viewer: ["view:results"],
}

/**
 * Gets authenticated user from Supabase (server-only)
 */
export async function getAuthenticatedUser(): Promise<User | null> {
  try {
    const supabase = await createClient()

    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !authUser) {
      return null
    }

    // Fetch user profile from database
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", authUser.id)
      .single()

    if (profileError) {
      console.error("[v0] Error fetching user profile:", profileError)
      return null
    }

    return {
      id: authUser.id,
      email: authUser.email || "",
      fullName: profile?.full_name,
      role: profile?.role || "clinician",
      department: profile?.department,
      licenseNumber: profile?.license_number,
      specialization: profile?.specialization,
      createdAt: new Date(authUser.created_at),
      isActive: true,
    }
  } catch (error) {
    console.error("[v0] Error getting authenticated user:", error)
    return null
  }
}

/**
 * Creates user profile after signup (server-only)
 */
export async function createUserProfile(
  userId: string,
  email: string,
  fullName: string,
  role: UserRole = "clinician",
  department?: string,
  licenseNumber?: string,
  specialization?: string,
): Promise<boolean> {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("user_profiles").insert({
      id: userId,
      email,
      full_name: fullName,
      role,
      department,
      license_number: licenseNumber,
      specialization,
    })

    if (error) {
      console.error("[v0] Error creating user profile:", error)
      return false
    }

    return true
  } catch (error) {
    console.error("[v0] Error in createUserProfile:", error)
    return false
  }
}

/**
 * Updates user profile (server-only)
 */
export async function updateUserProfile(
  userId: string,
  updates: Partial<Omit<User, "id" | "email" | "createdAt">>,
): Promise<boolean> {
  try {
    const supabase = await createClient()

    const profileUpdates: Record<string, any> = {}
    if (updates.fullName) profileUpdates.full_name = updates.fullName
    if (updates.role) profileUpdates.role = updates.role
    if (updates.department) profileUpdates.department = updates.department
    if (updates.licenseNumber) profileUpdates.license_number = updates.licenseNumber
    if (updates.specialization) profileUpdates.specialization = updates.specialization

    const { error } = await supabase.from("user_profiles").update(profileUpdates).eq("id", userId)

    if (error) {
      console.error("[v0] Error updating user profile:", error)
      return false
    }

    return true
  } catch (error) {
    console.error("[v0] Error in updateUserProfile:", error)
    return false
  }
}
