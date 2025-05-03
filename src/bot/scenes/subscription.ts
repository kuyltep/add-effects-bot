import { Markup, Scenes } from 'telegraf';
import { findUserByTelegramId } from '../../services/user';
import { createPackagePayment, GENERATION_PACKAGES } from '../../services/payment';
import { MyContext } from '../../types/bot';
import {  exitScene, handleSceneError } from '../../services/scene';
import { translateWithPackages } from '../../utils/i18n';

// Create the packages scene (formerly subscription)
export const packagesScene = new Scenes.BaseScene<MyContext>('packages');

/**
 * Display available generation packages
 */
async function displayPackages(ctx: MyContext): Promise<void> {
  try {
    const telegramId = ctx.from?.id.toString() || '';
    const user = await findUserByTelegramId(telegramId);

    if (!user) {
      await ctx.reply(ctx.i18n.t('bot:errors.not_registered'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // Show available packages with dynamic values from config
    await ctx.reply(
      translateWithPackages('bot:packages.intro', {
        remainingGenerations: user.remainingGenerations
      }, ctx.i18n.t),
      {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback(translateWithPackages('bot:packages.package100', {}, ctx.i18n.t), 'package_package100'),
            Markup.button.callback(translateWithPackages('bot:packages.package250', {}, ctx.i18n.t), 'package_package250'),
          ],
          [
            Markup.button.callback(translateWithPackages('bot:packages.package500', {}, ctx.i18n.t), 'package_package500'),
            Markup.button.callback(translateWithPackages('bot:packages.package1000', {}, ctx.i18n.t), 'package_package1000'),
          ],
        ]).reply_markup,
      }
    );
  } catch (error) {
    console.error('Error displaying packages:', error);
    await ctx.reply(ctx.i18n.t('bot:errors.general'));
  }
}

// Scene enter handler
packagesScene.enter(async (ctx) => {
  try {
    await displayPackages(ctx);
  } catch (error) {
    return handleSceneError(ctx, error, 'packages');
  }
});

// Handle package selection
packagesScene.action(/package_(package1000|package500|package250|package100)/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const telegramId = ctx.from?.id.toString() || '';
    const user = await findUserByTelegramId(telegramId);

    if (!user) {
      await ctx.reply(ctx.i18n.t('bot:errors.not_registered'), {
        parse_mode: 'HTML',
      });
      return ctx.scene.leave();
    }

    const packageType = ctx.match[1] as keyof typeof GENERATION_PACKAGES;
    const packageDetails = GENERATION_PACKAGES[packageType];
    
    if (!packageDetails) {
      await ctx.reply(ctx.i18n.t('bot:errors.general'));
      return ctx.scene.leave();
    }

    // Create payment using the payment service
    const { paymentUrl } = await createPackagePayment(user.id, packageType);

    // Prepare parameters specific to the selected package
    const params = {
      package: translateWithPackages(`bot:packages.${packageType}`, {}, ctx.i18n.t),
      price: packageDetails.price,
      count: packageDetails.count
    };

    // Show payment confirmation with dynamic values
    await ctx.reply(
      translateWithPackages('bot:packages.payment_prompt', params, ctx.i18n.t),
      {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.url(ctx.i18n.t('bot:packages.pay_button'), paymentUrl)],
          [Markup.button.callback(ctx.i18n.t('bot:common.cancel'), 'back_to_packages')],
        ]).reply_markup,
      }
    );
  } catch (error) {
    return handleSceneError(ctx, error, 'package selection');
  }
});

// Handle back button to return to packages list
packagesScene.action('back_to_packages', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await displayPackages(ctx);
  } catch (error) {
    return handleSceneError(ctx, error, 'back to packages');
  }
});

// Handle /cancel command
packagesScene.command('cancel', async (ctx) => {
  return exitScene(ctx, 'bot:errors.cancelled');
}); 