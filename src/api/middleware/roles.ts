/**
 * Role-based Access Control Middleware
 * Permission checking for protected routes
 */

import { createMiddleware } from 'hono/factory';
import type { Context, Next } from 'hono';
import type { UserRole } from '../../models/index.js';

// Require specific role
export const requireRole = (...roles: UserRole[]) => {
  return createMiddleware(async (c: Context, next: Next) => {
    const session = c.get('session');

    if (!session) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    if (!roles.includes(session.user.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    return next();
  });
};

// Require specific permission
export const requirePermission = (...permissions: string[]) => {
  return createMiddleware(async (c: Context, next: Next) => {
    const session = c.get('session');

    if (!session) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const hasPermission = permissions.every(perm =>
      session.permissions.includes(perm) ||
      session.permissions.includes(perm.split(':').slice(0, 2).join(':'))
    );

    if (!hasPermission) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    return next();
  });
};

// Require any of the specified permissions
export const requireAnyPermission = (...permissions: string[]) => {
  return createMiddleware(async (c: Context, next: Next) => {
    const session = c.get('session');

    if (!session) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const hasAnyPermission = permissions.some(perm =>
      session.permissions.includes(perm) ||
      session.permissions.includes(perm.split(':').slice(0, 2).join(':'))
    );

    if (!hasAnyPermission) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    return next();
  });
};

// Check if user has permission (helper function)
export function hasPermission(c: Context, permission: string): boolean {
  const session = c.get('session');
  if (!session) return false;

  return (
    session.permissions.includes(permission) ||
    session.permissions.includes(permission.split(':').slice(0, 2).join(':'))
  );
}

// Check if user owns the resource or has full permission
export function canAccessOwned(
  c: Context,
  permission: string,
  resourceOwnerId: string
): boolean {
  const session = c.get('session');
  if (!session) return false;

  // Check full permission
  if (hasPermission(c, permission)) {
    return true;
  }

  // Check :own permission
  if (
    hasPermission(c, `${permission}:own`) &&
    session.user.id === resourceOwnerId
  ) {
    return true;
  }

  return false;
}

// Admin only middleware
export const adminOnly = requireRole('admin');

// Editor or higher middleware
export const editorOrHigher = requireRole('admin', 'editor');

// Author or higher middleware
export const authorOrHigher = requireRole('admin', 'editor', 'author');
