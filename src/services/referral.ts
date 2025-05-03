import { prisma } from '../utils/prisma';
import { ReferralProcessResult } from '../types/user.type';

/**
 * Process a referral code and reward both users
 */
export async function processReferralCode(
  referralCode: string, 
  userId: string
): Promise<ReferralProcessResult> {
  try {
    // Find the referrer
    const referrer = await prisma.user.findUnique({
      where: { referralCode },
    });

    if (!referrer || referrer.id === userId) {
      return { 
        success: false, 
        error: !referrer ? 'Invalid referral code' : 'Self-referral not allowed' 
      };
    }

    // Check if this user has already been referred
    const existingReferral = await prisma.referral.findUnique({
      where: { invitedUserId: userId },
    });

    if (existingReferral) {
      return { 
        success: false, 
        error: 'User already referred' 
      };
    }

    // Create referral record
    await prisma.referral.create({
      data: {
        referrerId: referrer.id,
        invitedUserId: userId,
      },
    });

    // Add 5 generations to both users
    await prisma.user.update({
      where: { id: referrer.id },
      data: { remainingGenerations: { increment: parseInt(process.env.DEFAULT_GENERATIONS || '3', 10) } },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { remainingGenerations: { increment: parseInt(process.env.DEFAULT_GENERATIONS || '3', 10) } },
    });
    
    return {
      success: true,
      referrerId: referrer.id,
      invitedUserId: userId
    };
  } catch (error) {
    console.error('Error processing referral:', error);
    return {
      success: false,
      error: 'Database error processing referral'
    };
  }
}

/**
 * Get count of referrals for a user
 */
export async function getReferralCount(userId: string): Promise<number> {
  try {
    return await prisma.referral.count({
      where: { referrerId: userId }
    });
  } catch (error) {
    console.error('Error counting referrals:', error);
    return 0;
  }
} 