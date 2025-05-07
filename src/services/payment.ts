import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import { paymentConfig, packagesConfig } from '../config';
import { User } from '@prisma/client';
import { Logger } from '../utils/rollbar.logger';
import { createRedisPublisher } from '../utils/redis';
import fetch from 'node-fetch';

/**
 * Available generation packages
 */
export const GENERATION_PACKAGES = packagesConfig;

/**
 * Package types
 */
export type GenerationPackageType = keyof typeof GENERATION_PACKAGES;

/**
 * Create a Robokassa payment for a generation package
 * @param userId User ID
 * @param packageType Generation package type
 * @returns Payment object with URL
 */
export async function createPackagePayment(
  userId: string,
  packageType: GenerationPackageType
): Promise<{ payment: any; paymentUrl: string }> {
  try {
    // Get package details
    const packageDetails = GENERATION_PACKAGES[packageType];
    if (!packageDetails) {
      throw new Error(`Invalid package type: ${packageType}`);
    }

    // Create payment record in database
    const payment = await prisma.payment.create({
      data: {
        userId,
        amount: packageDetails.price,
        status: 'pending',
        generationsAdded: packageDetails.count,
      },
 
    });

    // Generate Robokassa payment URL
    const paymentUrl = generateRobokassaUrl(payment.transactionId, packageDetails.price, `Generation Package: ${packageDetails.name}`);

    return {
      payment: {
        id: payment.id,
        amount: payment.amount,
        status: payment.status,
      },
      paymentUrl,
    };
  } catch (error) {
    Logger.error(error, {
      context: 'payment-service',
      method: 'createPackagePayment',
      userId,
      packageType
    });
    throw error;
  }
}

/**
 * Generate Robokassa payment URL
 * @param paymentId Payment ID
 * @param amount Payment amount
 * @param description Payment description
 * @returns Robokassa payment URL
 */
function generateRobokassaUrl(paymentId: string | number, amount: number, description: string): string {
  // Get Robokassa credentials
  const { login, password1, testMode } = paymentConfig.robokassa;

  // Format amount to 2 decimal places
  const formattedAmount = amount.toFixed(2);

  // Generate signature (MD5 hash)
  const signature = crypto
    .createHash('md5')
    .update(`${login}:${formattedAmount}:${paymentId}:${password1}`)
    .digest('hex').toLowerCase();

  // Use test or production URL based on config
  const baseUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx';

  // Build and encode payment URL
  return `${baseUrl}?MerchantLogin=${login}&OutSum=${formattedAmount}&InvId=${paymentId}&Description=${encodeURIComponent(description)}&SignatureValue=${signature}&IsTest=${testMode ? 1 : 0}`;
}

/**
 * Process a Robokassa payment notification
 * @param outSum Payment amount
 * @param invId Payment ID
 * @param signatureValue Signature from Robokassa
 * @returns Boolean indicating if payment was successfully processed
 */
export async function processRobokassaPayment(
  outSum: string, 
  invId: string, 
  signatureValue: string
): Promise<boolean> {
  try {
    // Verify the signature
    const isValid = verifyRobokassaSignature(outSum, invId, signatureValue);

    if (!isValid) {
      Logger.error('Invalid Robokassa signature', {
        context: 'payment-service',
        method: 'processRobokassaPayment',
        invId
      });
      return false;
    }

    // Find the payment in our database
    const payment = await prisma.payment.findUnique({
      where: { transactionId: +invId },
      include: { user: true },
    });



    if (!payment) {
      Logger.error(`Payment not found: ${invId}`, {
        context: 'payment-service',
        method: 'processRobokassaPayment'
      });
      return false;
    }

    if (payment.status === 'completed') {
      return true;
    }

    // Update payment status
    await prisma.payment.update({
      where: { transactionId: +invId },
      data: { status: 'completed' },
    });

    // Add generations to user's account
    if (payment.generationsAdded) {
      await addGenerationsToUser(payment.userId, payment.generationsAdded);
      
      // Get user with telegram ID
      const user = await prisma.user.findUnique({
        where: { id: payment.userId }      });
      
      // Send notification via Redis
      await sendPaymentSuccessNotification({
        userId: payment.userId,
        telegramId: user?.telegramId || '',
        generationsAdded: payment.generationsAdded,
        amount: payment.amount
      });
      
      // Send notification to external payment service
      await notifyExternalPaymentService({
        amount: payment.amount,
        generationsAdded: payment.generationsAdded,
        botName: process.env.BOT_USERNAME || '',
        user: user.telegramId,
        username: user.telegramUsername
      });
    }

    return true;
  } catch (error) {
    Logger.error(error, {
      context: 'payment-service',
      method: 'processRobokassaPayment',
      invId
    });
    return false;
  }
}

/**
 * Verify Robokassa signature
 * @param outSum Payment amount
 * @param invId Payment ID
 * @param signatureValue Signature from Robokassa
 * @returns Boolean indicating if signature is valid
 */
function verifyRobokassaSignature(outSum: string, invId: string, signatureValue: string): boolean {
  try {
    // Get Robokassa credentials
    const { password2 } = paymentConfig.robokassa;

    // Generate expected signature
    const expectedSignature = crypto
      .createHash('md5')
      .update(`${outSum}:${invId}:${password2}`)
      .digest('hex').toLowerCase();

    // Compare signatures
    return signatureValue.toLowerCase() === expectedSignature;
  } catch (error) {
    Logger.error(error, {
      context: 'payment-service',
      method: 'verifyRobokassaSignature',
      invId
    });
    return false;
  }
}

/**
 * Add generations to a user's account
 * @param userId User ID
 * @param count Number of generations to add
 * @returns Updated user
 */
export async function addGenerationsToUser(userId: string, count: number): Promise<User> {
  try {
    // Update user's generation count
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        remainingGenerations: {
          increment: count
        }
      },
    });

    // Logger.info(`Added ${count} generations to user ${userId}`, {
    //   context: 'payment-service',
    //   method: 'addGenerationsToUser'
    // });
    return user;
  } catch (error) {
    Logger.error(error, {
      context: 'payment-service', 
      method: 'addGenerationsToUser',
      userId
    });
    throw error;
  }
}

/**
 * Clean up pending payments older than the specified time
 * @param olderThanMs Time in milliseconds (default: 1 hour)
 * @returns Number of removed payments
 */
export async function cleanupPendingPayments(olderThanMs = 3600000): Promise<number> {
  try {
    // Validate input
    if (olderThanMs <= 0) {
      Logger.warn('Invalid cleanup time specified, using default 1 hour', {
        context: 'payment-service',
        method: 'cleanupPendingPayments'
      });
      olderThanMs = 3600000;
    }
    
    // Calculate the cutoff date
    const cutoffDate = new Date(Date.now() - olderThanMs);
    
    // First count how many will be affected (for logging)

    // Delete pending payments older than the cutoff date
    const result = await prisma.payment.deleteMany({
      where: {
        status: 'pending',
        createdAt: {
          lt: cutoffDate
        }
      }
    });
    
    // Log with additional details for monitoring
    return result.count;
  } catch (error) {
    // Enhanced error logging with more details
    Logger.error(error, {
      context: 'payment-service',
      method: 'cleanupPendingPayments',
      timestamp: new Date().toISOString()
    });
    return 0;
  }
}

/**
 * Send payment success notification via Redis
 * @param data Payment success notification data
 */
async function sendPaymentSuccessNotification(data: {
  userId: string;
  telegramId: string;
  generationsAdded: number;
  amount: number;
}): Promise<void> {
  try {
    const redisPublisher = createRedisPublisher();
    
    await redisPublisher.publish(
      'bot:payment_success',
      JSON.stringify(data)
    );
    
    await redisPublisher.quit();
    
  } catch (error) {
    Logger.error(error, {
      context: 'payment-service',
      method: 'sendPaymentSuccessNotification',
      userId: data.userId
    });
  }
}

/**
 * Notify external payment service about successful payment
 * @param data Payment notification data
 */
async function notifyExternalPaymentService(data: {
  amount: number;
  generationsAdded: number;
  botName: string;
  user: string;
  username: string
}): Promise<void> {
  try {
    const paymentNotifyServiceUrl = process.env.PAYMENT_NOTIFY_SERVICE_URL;
    
    if (!paymentNotifyServiceUrl) {
      Logger.error('Payment notify service URL not defined in environment variables', {
        context: 'payment-service',
        method: 'notifyExternalPaymentService'
      });
      return;
    }
    
    const notifyUrl = `${paymentNotifyServiceUrl}/notify`;
    
    const response = await fetch(notifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      Logger.error('Payment notify service doesn\'t work. Check the service', {
        context: 'payment-service',
        method: 'notifyExternalPaymentService',
        data
      });
    }
  
  } catch (error) {
    Logger.error(error, {
      context: 'payment-service',
      method: 'notifyExternalPaymentService',
      data
    });
  }
} 