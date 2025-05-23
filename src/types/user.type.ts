/**
 * User information from Telegram
 */
export interface TelegramUserInfo {
  telegramId: string;
  username?: string;
  chatId: string;
  firstName?: string;
  language?: string;
}

/**
 * Referral processing result
 */
export interface ReferralProcessResult {
  success: boolean;
  referrerId?: string;
  invitedUserId?: string;
  error?: string;
}
