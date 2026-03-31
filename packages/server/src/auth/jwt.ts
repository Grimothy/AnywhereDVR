// packages/server/src/auth/jwt.ts
// JWT helpers — sign, verify, and extract from request

import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { logger } from '../logger.js';

export interface JwtPayload {
  sub: string;       // user id
  username: string;
  role: 'ADMIN' | 'USER';
  iat?: number;
  exp?: number;
}

const SECRET = config.jwtSecret;
const EXPIRES_IN = '7d';

export function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, SECRET) as JwtPayload;
  } catch (err) {
    logger.debug({ err }, 'JWT verification failed');
    return null;
  }
}

export const COOKIE_NAME = 'advrToken';
export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.nodeEnv === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: '/',
};
