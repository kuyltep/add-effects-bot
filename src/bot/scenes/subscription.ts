import { Markup, Scenes } from 'telegraf';
import { findUserByTelegramId } from '../../services/user';
import { MyContext } from '../../types/bot';
import { exitScene, handleSceneError } from '../../services/scene';
import {
  getProductsFromMS,
  updatePaymentOnMS,
  MSProduct,
} from '../../services/paymentMicroservice';

export const packagesScene = new Scenes.WizardScene<MyContext>('packages', async ctx => {
  try {
    await displayPackages(ctx);
    return ctx.wizard.next();
  } catch (error) {
    return handleSceneError(ctx, error, 'packages initial step');
  }
});

interface PackagesWizardState {
  products?: MSProduct[];
}

async function displayPackages(ctx: MyContext): Promise<void> {
  // Properly access wizard state
  const wizardState = ctx.wizard.state as PackagesWizardState;
  try {
    const telegramId = ctx.from?.id.toString() || '';
    const user = await findUserByTelegramId(telegramId);

    if (!user) {
      await ctx.reply(ctx.i18n.t('bot:errors.not_registered'), {
        parse_mode: 'HTML',
      });
      return;
    }

    const botName = process.env.BOT_USERNAME;
    if (!botName) {
      console.error('BOT_USERNAME not configured in .env');
      await ctx.reply(ctx.i18n.t('bot:errors.general'));
      return;
    }

    let fetchedProducts: MSProduct[] = [];
    try {
      fetchedProducts = await getProductsFromMS(botName);
      wizardState.products = fetchedProducts; // Store products in wizard state
    } catch (apiError) {
      console.error('Error fetching products from payment service:', apiError);
      await ctx.reply(
        ctx.i18n.t('bot:packages.unavailable_error', {
          default: 'Sorry, packages are currently unavailable. Please try again later.',
        })
      );
      return;
    }

    if (fetchedProducts.length === 0) {
      await ctx.reply(
        ctx.i18n.t('bot:packages.no_packages_available', {
          default: 'No packages are currently available.',
        }),
        {
          parse_mode: 'HTML',
        }
      );
      return;
    }

    const introText = ctx.i18n.t('bot:packages.intro', {
      remainingGenerations: user.remainingGenerations,
    });

    console.log(fetchedProducts.length);

    const packageButtons = fetchedProducts.map(product => {
      const buttonText = `${product.generations} - ${product.price} ${product.currency || 'RUB'}`;
      return Markup.button.callback(buttonText, `pay_package_${product.id}`);
    });

    const keyboardRows = [];
    for (let i = 0; i < packageButtons.length; i += 2) {
      const row = [packageButtons[i]];
      if (i + 1 < packageButtons.length) {
        row.push(packageButtons[i + 1]);
      }
      keyboardRows.push(row);
    }

    if (ctx.callbackQuery) {
      await ctx.editMessageText(introText, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard(keyboardRows).reply_markup,
      });
    } else {
      await ctx.reply(introText, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard(keyboardRows).reply_markup,
      });
    }
  } catch (error) {
    console.error('Error displaying packages:', error);
    await ctx.reply(ctx.i18n.t('bot:errors.general'));
  }
}

// Register action handlers directly on the wizard scene
packagesScene.action(/pay_package_(.+)/, async ctx => {
  // Properly access wizard state
  const wizardState = ctx.wizard.state as PackagesWizardState;
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from?.id.toString() || '';
    const user = await findUserByTelegramId(telegramId);

    if (!user) {
      await ctx.reply(ctx.i18n.t('bot:errors.not_registered'), { parse_mode: 'HTML' });
      return ctx.scene.leave();
    }

    console.log(wizardState.products);
    const productId = ctx.match[1]; // This is the Product ID
    const products = wizardState.products;

    if (!products || products.length === 0) {
      console.error('Products not found in wizard state during payment initiation.');
      await ctx.reply(ctx.i18n.t('bot:errors.general'));
      return ctx.scene.leave();
    }

    const selectedProduct = products.find(p => p.id === productId);

    if (!selectedProduct || !selectedProduct.paymentId || !selectedProduct.paymentLink) {
      console.error(
        `Selected product (ID: ${productId}) or its paymentId/paymentLink not found in state.`
      );
      await ctx.reply(ctx.i18n.t('bot:errors.general'));
      return ctx.scene.leave();
    }

    try {
      await updatePaymentOnMS(selectedProduct.paymentId, {
        userId: user.id,
        username: user.telegramUsername,
        amount: selectedProduct.price,
        generationsAdded: selectedProduct.generations,
        productId: selectedProduct.id,
      });
    } catch (patchError) {
      console.error('Error updating payment status:', patchError);
      await ctx.reply(ctx.i18n.t('bot:errors.payment_failed'));
      return ctx.scene.leave();
    }

    // Show the payment link to the user
    const paymentPromptText = ctx.i18n.t('bot:packages.payment_redirect_prompt');

    await ctx.editMessageText(paymentPromptText, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.url(ctx.i18n.t('bot:packages.pay_button'), selectedProduct.paymentLink)],
        [Markup.button.callback(ctx.i18n.t('bot:common.cancel'), 'back_to_packages')],
      ]).reply_markup,
    });
  } catch (error) {
    return handleSceneError(ctx, error, 'package selection');
  }
});

// Handle back button to return to packages list
packagesScene.action('back_to_packages', async ctx => {
  try {
    await ctx.answerCbQuery();
    await displayPackages(ctx);
  } catch (error) {
    return handleSceneError(ctx, error, 'back to packages');
  }
});

// Handle /cancel command
packagesScene.command('cancel', async ctx => {
  return exitScene(ctx, 'bot:errors.cancelled');
});
