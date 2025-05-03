import { Markup, Scenes } from 'telegraf';
import { findUserByTelegramId } from '../../services/user';
import { MyContext } from '../../types/bot';
import { getMainKeyboard } from '../core';
import { GenerationPackageType } from '../../services/payment';
import { GENERATION_PACKAGES, createPackagePayment } from '../../services/payment';
import { handleSceneError, exitScene } from '../../services/scene';
import { translateWithPackages } from '../../utils/i18n';

// Create the payment scene
export const paymentScene = new Scenes.BaseScene<MyContext>('payment');

/**
 * Interface for payment scene state
 */
export interface PaymentSceneState {
  packageType: GenerationPackageType;
}

/**
 * Creates payment keyboard with payment URL
 */
function createPaymentKeyboard(ctx: MyContext, paymentUrl: string): any {
  return Markup.inlineKeyboard([
    [Markup.button.url(ctx.i18n.t('bot:packages.pay_button'), paymentUrl)],
    [Markup.button.callback(ctx.i18n.t('bot:common.cancel'), 'cancel_payment')],
  ]).reply_markup;
}

/**
 * Display payment information to user
 */
async function displayPaymentInfo(ctx: MyContext): Promise<void> {
  const telegramId = ctx.from?.id.toString() || '';
  const user = await findUserByTelegramId(telegramId);
  
  if (!user) {
    await ctx.reply(ctx.i18n.t('bot:errors.not_registered'), {
      parse_mode: 'HTML',
    });
    return ctx.scene.leave();
  }
  
  // Get state cast to proper type with default value
  const state = (ctx.scene.state || {}) as PaymentSceneState;
  const packageType = state.packageType || 'package100';
  
  // Get package details
  const packageDetails = GENERATION_PACKAGES[packageType];
  if (!packageDetails) {
    await ctx.reply(ctx.i18n.t('bot:errors.general'));
    return ctx.scene.leave();
  }
  
  try {
    // Create payment using the payment service
    const { paymentUrl } = await createPackagePayment(user.id, packageType);
    
    // Prepare parameters specific to the selected package
    const params = {
      package: translateWithPackages(`bot:packages.${packageType}`, {}, ctx.i18n.t),
      price: packageDetails.price,
      count: packageDetails.count
    };
    
    // Show payment prompt
    await ctx.reply(
      translateWithPackages('bot:packages.payment_confirm', params, ctx.i18n.t), 
      {
        parse_mode: 'HTML',
        reply_markup: createPaymentKeyboard(ctx, paymentUrl),
      }
    );
  } catch (error) {
    console.error('Error creating payment:', error);
    await ctx.reply(ctx.i18n.t('bot:errors.payment_failed'));
    return ctx.scene.leave();
  }
}

// Scene enter handler
paymentScene.enter(async (ctx) => {
  try {
    await displayPaymentInfo(ctx);
  } catch (error) {
    return handleSceneError(ctx, error, 'payment');
  }
});

// Handle cancel payment action
paymentScene.action('cancel_payment', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    return exitScene(ctx, 'bot:errors.cancelled');
  } catch (error) {
    return handleSceneError(ctx, error, 'payment cancel');
  }
});

// Handle /cancel command
paymentScene.command('cancel', async (ctx) => {
  return exitScene(ctx, 'bot:errors.cancelled');
}); 