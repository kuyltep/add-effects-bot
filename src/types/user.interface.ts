/**
 * Interface for application user
 */
export interface User {
  /** Unique ID of the user */
  id: string;
  /** User email address */
  email: string;
  /** User password hash */
  passwordHash?: string;
  /** Telegram ID of the user */
  telegramId?: string;
  /** Telegram username */
  telegramUsername?: string;
  /** Creation date of the user account */
  createdAt: Date;
  /** Last update date of the user account */
  updatedAt: Date;
  /** Number of generations remaining */
  remainingGenerations: number;
  /** Whether the user is banned */
  isBanned?: boolean;
  /** Whether the subscription is active */
  subscriptionActive?: boolean;
  /** Subscription end date */
  subscriptionEndDate?: Date | null;
  /** Referral code */
  referralCode: string;
  /** ID of user who referred this user */
  referredById?: string | null;
  /** Referral count */
  referralCount?: number;
}

/**
 * Interface for user creation data
 */
export interface CreateUserData {
  /** User email address */
  email: string;
  /** User password (unhashed) */
  password?: string;
  /** Telegram ID of the user */
  telegramId?: string;
  /** Telegram username */
  telegramUsername?: string;
  /** ID of user who referred this user */
  referredById?: string;
}

/**
 * Interface for user update data
 */
export interface UpdateUserData {
  /** User email address */
  email?: string;
  /** User password (unhashed) */
  password?: string;
  /** Telegram ID of the user */
  telegramId?: string;
  /** Telegram username */
  telegramUsername?: string;
  /** Number of generations remaining */
  remainingGenerations?: number;
  /** Whether the user is banned */
  isBanned?: boolean;
  /** Whether the subscription is active */
  subscriptionActive?: boolean;
  /** Subscription end date */
  subscriptionEndDate?: Date | null;
} 