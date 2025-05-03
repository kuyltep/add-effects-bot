import jwt from 'jsonwebtoken';

/**
 * Create JWT token for user authentication
 * @param userId User ID to include in token
 * @returns JWT token
 */
export function createToken(userId: string): string {
  const secretKey = process.env.JWT_SECRET || 'default_secret_key_for_development';
  const token = jwt.sign({ id: userId }, secretKey, { expiresIn: '30d' });
  return token;
}
