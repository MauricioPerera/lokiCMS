/**
 * User Service
 * Business logic for user management and authentication
 */

import { nanoid } from 'nanoid';
import * as crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { getUsersCollection } from '../db/index.js';
import type {
  User,
  SafeUser,
  CreateUserInput,
  UpdateUserInput,
  LoginInput,
  CreateApiKeyInput,
  ApiKey,
  JwtPayload,
  SessionInfo,
} from '../models/index.js';
import {
  CreateUserSchema,
  UpdateUserSchema,
  LoginSchema,
  CreateApiKeySchema,
  sanitizeUser,
  getUserPermissions,
} from '../models/index.js';
import type { Doc } from '../lib/lokijs/index.js';

// Configuration
const JWT_SECRET = process.env['JWT_SECRET'] || 'change-this-secret-in-production';
const JWT_EXPIRES_IN = process.env['JWT_EXPIRES_IN'] || '7d';
const API_KEY_PREFIX = process.env['API_KEY_PREFIX'] || 'lkcms_';

// Convert JWT_EXPIRES_IN to seconds
function parseExpiresIn(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60; // Default 7 days

  const value = parseInt(match[1]!, 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 24 * 60 * 60;
    default: return 7 * 24 * 60 * 60;
  }
}

export class UserService {
  private jwtSecret: Uint8Array;

  constructor() {
    this.jwtSecret = new TextEncoder().encode(JWT_SECRET);
  }

  // Hash password using scrypt
  private async hashPassword(password: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(16).toString('hex');
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) reject(err);
        resolve(`${salt}:${derivedKey.toString('hex')}`);
      });
    });
  }

  // Verify password
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const [salt, key] = hash.split(':');
      if (!salt || !key) {
        resolve(false);
        return;
      }
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) reject(err);
        resolve(crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey));
      });
    });
  }

  // Generate API key
  private generateApiKey(): { key: string; hash: string; prefix: string } {
    const key = `${API_KEY_PREFIX}${crypto.randomBytes(32).toString('hex')}`;
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    const prefix = key.substring(0, API_KEY_PREFIX.length + 8);
    return { key, hash, prefix };
  }

  // Create a new user
  async create(input: CreateUserInput): Promise<SafeUser> {
    const validated = CreateUserSchema.parse(input);
    const collection = getUsersCollection();

    // Check if email already exists
    const existing = collection.findOne({ email: validated.email.toLowerCase() });
    if (existing) {
      throw new Error('Email already registered');
    }

    const now = Date.now();
    const passwordHash = await this.hashPassword(validated.password);

    const user: User = {
      id: nanoid(),
      email: validated.email.toLowerCase(),
      passwordHash,
      name: validated.name,
      role: validated.role ?? 'viewer',
      avatar: validated.avatar,
      bio: validated.bio,
      apiKeys: [],
      isActive: true,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    };

    const doc = collection.insert(user) as Doc<User>;
    return sanitizeUser(this.toUser(doc));
  }

  // Login user
  async login(input: LoginInput): Promise<{ user: SafeUser; accessToken: string; refreshToken: string }> {
    const validated = LoginSchema.parse(input);
    const collection = getUsersCollection();

    const doc = collection.findOne({ email: validated.email.toLowerCase() });
    if (!doc) {
      throw new Error('Invalid email or password');
    }

    if (!doc.isActive) {
      throw new Error('Account is disabled');
    }

    const validPassword = await this.verifyPassword(validated.password, doc.passwordHash);
    if (!validPassword) {
      throw new Error('Invalid email or password');
    }

    // Update last login
    doc.lastLoginAt = Date.now();
    collection.update(doc);

    const user = this.toUser(doc);
    const accessToken = await this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user);

    return {
      user: sanitizeUser(user),
      accessToken,
      refreshToken,
    };
  }

  // Generate access token
  private async generateAccessToken(user: User): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = parseExpiresIn(JWT_EXPIRES_IN);

    return new SignJWT({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      type: 'access',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + expiresIn)
      .sign(this.jwtSecret);
  }

  // Generate refresh token
  private async generateRefreshToken(user: User): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 30 * 24 * 60 * 60; // 30 days

    return new SignJWT({
      sub: user.id,
      type: 'refresh',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + expiresIn)
      .sign(this.jwtSecret);
  }

  // Verify JWT token
  async verifyToken(token: string): Promise<JwtPayload> {
    try {
      const { payload } = await jwtVerify(token, this.jwtSecret);
      return payload as unknown as JwtPayload;
    } catch {
      throw new Error('Invalid or expired token');
    }
  }

  // Refresh access token
  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    const payload = await this.verifyToken(refreshToken);

    if (payload.type !== 'refresh') {
      throw new Error('Invalid refresh token');
    }

    const user = await this.findById(payload.sub);
    if (!user) {
      throw new Error('User not found');
    }

    const collection = getUsersCollection();
    const doc = collection.findOne({ id: payload.sub });
    if (!doc) {
      throw new Error('User not found');
    }

    const accessToken = await this.generateAccessToken(this.toUser(doc));
    return { accessToken };
  }

  // Verify API key
  async verifyApiKey(key: string): Promise<SessionInfo | null> {
    if (!key.startsWith(API_KEY_PREFIX)) {
      return null;
    }

    const hash = crypto.createHash('sha256').update(key).digest('hex');
    const collection = getUsersCollection();

    // Find user with this API key
    const docs = collection.find();
    for (const doc of docs) {
      const apiKey = doc.apiKeys.find(k => k.keyHash === hash);
      if (apiKey) {
        // Check expiration
        if (apiKey.expiresAt && apiKey.expiresAt < Date.now()) {
          return null;
        }

        // Update last used
        apiKey.lastUsedAt = Date.now();
        collection.update(doc);

        const user = sanitizeUser(this.toUser(doc));
        return {
          user,
          permissions: apiKey.permissions.length > 0 ? apiKey.permissions : getUserPermissions(user),
        };
      }
    }

    return null;
  }

  // Get all users
  async findAll(): Promise<SafeUser[]> {
    const collection = getUsersCollection();
    const docs = collection.find();
    return docs.map(doc => sanitizeUser(this.toUser(doc)));
  }

  // Get user by ID
  async findById(id: string): Promise<SafeUser | null> {
    const collection = getUsersCollection();
    const doc = collection.findOne({ id });
    return doc ? sanitizeUser(this.toUser(doc)) : null;
  }

  // Get user by email
  async findByEmail(email: string): Promise<SafeUser | null> {
    const collection = getUsersCollection();
    const doc = collection.findOne({ email: email.toLowerCase() });
    return doc ? sanitizeUser(this.toUser(doc)) : null;
  }

  // Update user
  async update(id: string, input: UpdateUserInput): Promise<SafeUser> {
    const validated = UpdateUserSchema.parse(input);
    const collection = getUsersCollection();

    const doc = collection.findOne({ id });
    if (!doc) {
      throw new Error(`User with id '${id}' not found`);
    }

    // Check email uniqueness if changing
    if (validated.email && validated.email.toLowerCase() !== doc.email) {
      const existing = collection.findOne({ email: validated.email.toLowerCase() });
      if (existing && existing.id !== id) {
        throw new Error('Email already in use');
      }
    }

    const updates: Partial<User> = {
      ...validated,
      email: validated.email?.toLowerCase(),
      updatedAt: Date.now(),
    };

    // Hash new password if provided
    if (validated.password) {
      updates.passwordHash = await this.hashPassword(validated.password);
    }
    delete (updates as { password?: string }).password;

    const updated: Doc<User> = {
      ...doc,
      ...updates,
    };

    collection.update(updated);
    return sanitizeUser(this.toUser(updated));
  }

  // Delete user
  async delete(id: string): Promise<void> {
    const collection = getUsersCollection();

    const doc = collection.findOne({ id });
    if (!doc) {
      throw new Error(`User with id '${id}' not found`);
    }

    collection.remove(doc);
  }

  // Create API key for user
  async createApiKey(userId: string, input: CreateApiKeyInput): Promise<{ apiKey: ApiKey; key: string }> {
    const validated = CreateApiKeySchema.parse(input);
    const collection = getUsersCollection();

    const doc = collection.findOne({ id: userId });
    if (!doc) {
      throw new Error(`User with id '${userId}' not found`);
    }

    const { key, hash, prefix } = this.generateApiKey();
    const now = Date.now();

    const apiKey: ApiKey = {
      id: nanoid(),
      name: validated.name,
      keyHash: hash,
      keyPrefix: prefix,
      permissions: validated.permissions ?? [],
      expiresAt: validated.expiresInDays
        ? now + validated.expiresInDays * 24 * 60 * 60 * 1000
        : undefined,
      createdAt: now,
    };

    doc.apiKeys.push(apiKey);
    doc.updatedAt = now;
    collection.update(doc);

    return { apiKey, key };
  }

  // List API keys for user
  async listApiKeys(userId: string): Promise<Omit<ApiKey, 'keyHash'>[]> {
    const collection = getUsersCollection();

    const doc = collection.findOne({ id: userId });
    if (!doc) {
      throw new Error(`User with id '${userId}' not found`);
    }

    return doc.apiKeys.map(({ keyHash, ...rest }) => rest);
  }

  // Revoke API key
  async revokeApiKey(userId: string, apiKeyId: string): Promise<void> {
    const collection = getUsersCollection();

    const doc = collection.findOne({ id: userId });
    if (!doc) {
      throw new Error(`User with id '${userId}' not found`);
    }

    const keyIndex = doc.apiKeys.findIndex(k => k.id === apiKeyId);
    if (keyIndex === -1) {
      throw new Error('API key not found');
    }

    doc.apiKeys.splice(keyIndex, 1);
    doc.updatedAt = Date.now();
    collection.update(doc);
  }

  // Change password
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const collection = getUsersCollection();

    const doc = collection.findOne({ id: userId });
    if (!doc) {
      throw new Error(`User with id '${userId}' not found`);
    }

    const validPassword = await this.verifyPassword(currentPassword, doc.passwordHash);
    if (!validPassword) {
      throw new Error('Current password is incorrect');
    }

    doc.passwordHash = await this.hashPassword(newPassword);
    doc.updatedAt = Date.now();
    collection.update(doc);
  }

  // Get session info from JWT payload
  async getSessionFromPayload(payload: JwtPayload): Promise<SessionInfo> {
    const user = await this.findById(payload.sub);
    if (!user) {
      throw new Error('User not found');
    }

    return {
      user,
      permissions: getUserPermissions(user),
    };
  }

  // Convert Doc to User
  private toUser(doc: Doc<User>): User {
    const { $loki, meta, ...user } = doc;
    return user;
  }
}

// Singleton instance
export const userService = new UserService();
