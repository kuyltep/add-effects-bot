import { User, Resolution } from '@prisma/client';
import bcrypt from 'bcrypt';
import { generateId } from '../utils/nanoid-wrapper';
import { prisma } from '../utils/prisma';

/**
 * Create a new user with the provided email and password
 * @param email User's email
 * @param password User's password
 * @param telegramId Optional Telegram ID
 * @param telegramUsername Optional Telegram username
 * @param telegramChatId Optional Telegram chat ID
 * @param referralCode Optional referral code used during registration
 * @param language Optional language preference (defaults to 'EN')
 * @returns Newly created user
 */

const DEFAULT_GENERATIONS = +process.env.DEFAULT_GENERATIONS || 3;
export async function createUser(
  email: string,
  password: string,
  telegramId?: string,
  telegramUsername?: string,
  telegramChatId?: string,
  referralCode?: string,
  language: 'EN' | 'RU' = 'EN'
): Promise<User> {
  const hashedPassword = await bcrypt.hash(password, 10);
  // Generate a unique referral code for the new user with 'p_' prefix
  const baseCode = await generateId(10);
  const userReferralCode = `${baseCode}`;

  try {
    // Create the user and settings in a transaction to ensure both are created
    return await prisma.$transaction(async (tx) => {
      // Create the new user
      const newUser = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          referralCode: userReferralCode, // Each user gets their own unique referral code
          telegramId,
          telegramUsername,
          telegramChatId,
          remainingGenerations: DEFAULT_GENERATIONS,
        },
      });

      // Create settings for the user using proper Prisma syntax
      await tx.userSettings.create({
        data: {
          userId: newUser.id,
          useNegativePrompt: false,
          useSeed: false,
          batchSize: 3,
          resolution: 'HORIZONTAL',
          model: 'rev3',
          // Handle language by casting to any to avoid type issues
          // The schema supports this field, but TypeScript definitions may be outdated
          language: language ,
        },
      });

      // Process referral if a referral code is provided
      if (referralCode) {
        const referrer = await tx.user.findUnique({
          where: { referralCode },
        });

        if (referrer) {
          // Create a referral record
          await tx.referral.create({
            data: {
              referrerId: referrer.id,
              invitedUserId: newUser.id,
            },
          });

          // Add 5 generations to the referrer
          await tx.user.update({
            where: { id: referrer.id },
            data: { remainingGenerations: referrer.remainingGenerations + DEFAULT_GENERATIONS },
          });
          
          // Add 5 generations to the new user as well (in addition to default)
          await tx.user.update({
            where: { id: newUser.id },
            data: { remainingGenerations: newUser.remainingGenerations + DEFAULT_GENERATIONS },
          });
        }
      }

      return newUser;
    });
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

/**
 * Find a user by email
 * @param email User's email
 * @returns User or null if not found
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { email },
  });
}

/**
 * Find a user by Telegram ID
 * @param telegramId User's Telegram ID
 * @returns User or null if not found
 */
export async function findUserByTelegramId(telegramId: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { telegramId },
  });
}

/**
 * Update a user's information
 * @param id User's ID
 * @param data Data to update
 * @returns Updated user
 */
export async function updateUser(
  id: string,
  data: Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<User> {
  return prisma.user.update({
    where: { id },
    data,
  });
}

/**
 * Reduce the remaining generations for a user
 * @param id User's ID
 * @param count Number of generations to reduce (default: 1)
 * @returns Updated user
 */
export async function reduceRemainingGenerations(id: string, count = 1): Promise<User> {
  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Check if user has enough generations
  if (user.remainingGenerations < count) {
    throw new Error('Insufficient remaining generations');
  }

  // Reduce the generations count
  return prisma.user.update({
    where: { id },
    data: { remainingGenerations: user.remainingGenerations - count },
  });
}

/**
 * Get user settings by user ID
 * @param userId User ID
 * @returns User settings or null if not found
 */
export async function getUserSettings(userId: string) {
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    return settings;
  } catch (error) {
    console.error('Error getting user settings:', error);
    return null;
  }
}

/**
 * Create user settings or get existing ones
 * @param userId User ID
 * @returns User settings
 */
export async function getOrCreateUserSettings(userId: string) {
  try {
    // Try to find existing settings
    let settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    // If settings don't exist, create them with defaults
    if (!settings) {
      settings = await prisma.userSettings.create({
        data: {
          userId,
          useNegativePrompt: false,
          useSeed: false,
          batchSize: 3,
          resolution: Resolution.HORIZONTAL,
          model: 'rev3',
        },
      });
    }

    return settings;
  } catch (error) {
    console.error('Error getting or creating user settings:', error);
    throw error;
  }
}

/**
 * Update user settings
 * @param userId User ID
 * @param data Settings data to update
 * @returns Updated user settings
 */
export async function updateUserSettings(
  userId: string,
  data: {
    useNegativePrompt?: boolean;
    useSeed?: boolean;
    batchSize?: number;
    resolution?: Resolution;
    model?: string;
  }
) {
  try {
    // Ensure settings exist
    await getOrCreateUserSettings(userId);

    // Update settings
    const settings = await prisma.userSettings.update({
      where: { userId },
      data,
    });

    return settings;
  } catch (error) {
    console.error('Error updating user settings:', error);
    throw error;
  }
}

/**
 * Get resolution dimensions based on resolution enum
 * @param resolution Resolution enum value
 * @returns Width and height as numbers
 */
export function getResolutionDimensions(resolution: Resolution) {
  switch (resolution) {
    case 'SQUARE':
      return { width: 1024, height: 1024 };
    case 'VERTICAL':
      return { width: 768, height: 1024 };
    case 'HORIZONTAL':
    default:
      return { width: 1024, height: 768 };
  }
}
