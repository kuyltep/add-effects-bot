import { ReveAI } from 'reve-sdk';
import { prisma } from '../utils/prisma';
import config from '../config';
import { Logger } from '../utils/rollbar.logger';

/**
 * Get the next available Reve account based on load balancing strategy
 * Prioritize accounts without errors that haven't been used recently
 */
export async function getNextReveAccount(forceHealthyAccount = true) {
  try {
    // Check if we have any accounts in the database
    

    // Current time
    const now = new Date();
    // Error cooldown period (1 hour)
    const cooldownPeriod = 60 * 60 * 1000; // 1 hour in milliseconds
    const cooldownThreshold = new Date(now.getTime() - cooldownPeriod);
    
    // Find account based on priority:
    // 1. Active accounts without errors
    // 2. Active accounts with errors older than cooldown period
    // 3. Any active account if forceHealthyAccount is false
    
    let account;
    
    // First try to find accounts without errors
    if (forceHealthyAccount) {
      account = await prisma.reveAccount.findFirst({
        where: {
          isActive: true,
          OR: [
            { lastErrorAt: null },
            { lastErrorAt: { lt: cooldownThreshold } }
          ]
        },
        orderBy: [
          { lastUsedAt: 'asc' },
          { generationCount: 'asc' }
        ],
        take: 1
      });
    }
    
    // If no healthy account found or not forcing healthy account,
    // get any active account ordered by usage
    if (!account) {
      account = await prisma.reveAccount.findFirst({
        where: {
          isActive: true
        },
        orderBy: [
          { lastUsedAt: 'asc' },
          { generationCount: 'asc' }
        ]
      });
    }
    
    // If still no account, fallback to config
    if (!account) {
      Logger.warn('No active Reve accounts found in DB, using default from config', {
        context: 'reve-account-service'
      });
      return {
        id: 'default',
        authorization: config.reve.auth,
        cookie: config.reve.cookie,
        projectId: config.reve.projectId,
        isActive: true
      };
    }
    
    return account;
  } catch (error) {
    Logger.error(error, { 
      context: 'reve-account-service',
      method: 'getNextReveAccount'
    });
    // Fallback to config if any error occurs
    return {
      id: 'default',
      authorization: config.reve.auth,
      cookie: config.reve.cookie,
      projectId: config.reve.projectId,
      isActive: true
    };
  }
}

/**
 * Mark an account as used and increment its usage counter
 */
export async function markAccountAsUsed(accountId: string) {
  try {
    if (accountId === 'default') return; // Skip for default fallback account
    
    await prisma.reveAccount.update({
      where: { id: accountId },
      data: {
        lastUsedAt: new Date(),
        generationCount: { increment: 1 }
      }
    });
  } catch (error) {
    Logger.error(error, {
      context: 'reve-account-service',
      method: 'markAccountAsUsed',
      accountId
    });
  }
}

/**
 * Mark an account as having an error
 */
export async function markAccountWithError(accountId: string) {
  try {
    if (accountId === 'default') return; // Skip for default fallback account
    
    await prisma.reveAccount.update({
      where: { id: accountId },
      data: {
        lastErrorAt: new Date()
      }
    });
    
    Logger.warn(`Marked Reve account with error status`, {
      context: 'reve-account-service',
      accountId
    });
  } catch (error) {
    Logger.error(error, {
      context: 'reve-account-service',
      method: 'markAccountWithError',
      accountId
    });
  }
}

/**
 * Initialize an SDK instance with account credentials
 */
export function initializeReveSDK(account: any) {
  return new ReveAI({
    auth: {
      authorization: account.authorization,
      cookie: account.cookie,
    },
    projectId: account.projectId,
    timeout: config.reve.timeout,
    pollingInterval: config.reve.pollingInterval,
    maxPollingAttempts: config.reve.maxPollingAttempts,
  });
}

/**
 * Initialize default account from config if none exists
 */

/**
 * Reset error status for accounts after cooldown period (called by cron)
 */
export async function resetErrorStatusAfterCooldown() {
  try {
    const cooldownPeriod = 60 * 60 * 1000; // 1 hour in milliseconds
    const cooldownThreshold = new Date(Date.now() - cooldownPeriod);
    
    const result = await prisma.reveAccount.updateMany({
      where: {
        lastErrorAt: { lt: cooldownThreshold }
      },
      data: {
        lastErrorAt: null
      }
    });
  
    return result.count;
  } catch (error) {
    Logger.error(error, {
      context: 'reve-account-service',
      method: 'resetErrorStatusAfterCooldown'
    });
    return 0;
  }
} 