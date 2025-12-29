/**
 * User Model
 * Represents users with roles and API keys
 */

import { z } from 'zod';

// User roles
export const UserRoleSchema = z.enum(['admin', 'editor', 'author', 'viewer']);
export type UserRole = z.infer<typeof UserRoleSchema>;

// Role permissions
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: [
    'users:read', 'users:write', 'users:delete',
    'content-types:read', 'content-types:write', 'content-types:delete',
    'entries:read', 'entries:write', 'entries:delete', 'entries:publish',
    'taxonomies:read', 'taxonomies:write', 'taxonomies:delete',
    'terms:read', 'terms:write', 'terms:delete',
    'api-keys:read', 'api-keys:write', 'api-keys:delete',
    'settings:read', 'settings:write',
  ],
  editor: [
    'content-types:read',
    'entries:read', 'entries:write', 'entries:delete', 'entries:publish',
    'taxonomies:read', 'taxonomies:write',
    'terms:read', 'terms:write', 'terms:delete',
  ],
  author: [
    'content-types:read',
    'entries:read', 'entries:write:own', 'entries:delete:own',
    'taxonomies:read',
    'terms:read',
  ],
  viewer: [
    'content-types:read',
    'entries:read',
    'taxonomies:read',
    'terms:read',
  ],
};

// API Key schema
export const ApiKeySchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(64),
  keyHash: z.string(),
  keyPrefix: z.string(),
  permissions: z.array(z.string()).default([]),
  expiresAt: z.number().optional(),
  lastUsedAt: z.number().optional(),
  createdAt: z.number(),
});

export type ApiKey = z.infer<typeof ApiKeySchema>;

// User schema
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email().max(256),
  passwordHash: z.string(),
  name: z.string().min(1).max(128),
  role: UserRoleSchema.default('viewer'),
  avatar: z.string().url().optional(),
  bio: z.string().max(512).optional(),
  apiKeys: z.array(ApiKeySchema).default([]),
  isActive: z.boolean().default(true),
  emailVerified: z.boolean().default(false),
  createdAt: z.number(),
  updatedAt: z.number(),
  lastLoginAt: z.number().optional(),
});

export type User = z.infer<typeof UserSchema>;

// User without sensitive data
export const SafeUserSchema = UserSchema.omit({
  passwordHash: true,
  apiKeys: true,
});

export type SafeUser = z.infer<typeof SafeUserSchema>;

// Create user input
export const CreateUserSchema = z.object({
  email: z.string().email().max(256),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(128),
  role: UserRoleSchema.default('viewer'),
  avatar: z.string().url().optional(),
  bio: z.string().max(512).optional(),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

// Update user input
export const UpdateUserSchema = z.object({
  email: z.string().email().max(256).optional(),
  password: z.string().min(8).max(128).optional(),
  name: z.string().min(1).max(128).optional(),
  role: UserRoleSchema.optional(),
  avatar: z.string().url().nullable().optional(),
  bio: z.string().max(512).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

// Login input
export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type LoginInput = z.infer<typeof LoginSchema>;

// Create API key input
export const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(64),
  permissions: z.array(z.string()).default([]),
  expiresInDays: z.number().min(1).max(365).optional(),
});

export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;

// JWT payload
export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

// Session info
export interface SessionInfo {
  user: SafeUser;
  permissions: string[];
}

// Check if user has permission
export function hasPermission(user: User | SafeUser, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[user.role] || [];

  // Check exact match
  if (permissions.includes(permission)) {
    return true;
  }

  // Check wildcard permissions (e.g., entries:write matches entries:write:own)
  const basePerm = permission.split(':').slice(0, 2).join(':');
  if (permissions.includes(basePerm)) {
    return true;
  }

  return false;
}

// Check if user can access resource
export function canAccessResource(
  user: User | SafeUser,
  permission: string,
  resourceOwnerId?: string
): boolean {
  // Check full permission first
  if (hasPermission(user, permission)) {
    return true;
  }

  // Check :own permission
  const ownPermission = `${permission}:own`;
  if (hasPermission(user, ownPermission) && resourceOwnerId === user.id) {
    return true;
  }

  return false;
}

// Sanitize user object (remove sensitive fields)
export function sanitizeUser(user: User): SafeUser {
  const { passwordHash, apiKeys, ...safeUser } = user;
  return safeUser;
}

// Get permissions for user
export function getUserPermissions(user: User | SafeUser): string[] {
  return ROLE_PERMISSIONS[user.role] || [];
}
