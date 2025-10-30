/**
 * Client-safe authentication utilities
 * Use auth-server.ts for server-only functions
 */

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

export interface AuthContext {
  user: User | null
  isAuthenticated: boolean
  permissions: string[]
}

// Role-based permissions
const rolePermissions: Record<UserRole, string[]> = {
  clinician: ["query:medical", "view:results", "access:records", "upload:fhir"],
  admin: ["query:medical", "view:results", "access:records", "manage:users", "view:audit", "upload:fhir"],
  auditor: ["view:audit", "view:results", "access:records"],
  viewer: ["view:results"],
}

/**
 * Checks if user has permission
 */
export function hasPermission(user: User, permission: string): boolean {
  const permissions = rolePermissions[user.role] || []
  return permissions.includes(permission)
}

/**
 * Gets all permissions for a user
 */
export function getUserPermissions(user: User): string[] {
  return rolePermissions[user.role] || []
}

/**
 * Validates user access to a resource
 */
export function validateAccess(user: User | null, requiredPermission: string): boolean {
  if (!user || !user.isActive) {
    return false
  }
  return hasPermission(user, requiredPermission)
}
