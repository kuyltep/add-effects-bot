import { Composer, Context, Markup, Scenes } from 'telegraf';
import { 
  MyContext, 
  GenerateWizardState,
} from '../../types';
import { 
  processGeneration,
  canUserGenerate,
} from '../../services/generation';
import { 
  transitionToScene,
  initializeWizardState
} from '../../services/scene';
import { Logger } from '../../utils/rollbar.logger';

// STEP HANDLER
// Step handlers - each step of the wizard flow
const photoHandler = new Composer<MyContext>();
const creasesHandler = new Composer<MyContext>();

// WIZARD STEP TRANSITIONS

/**
 * Transitions to crease detection question
 */
async function transitionToCreaseQuestion(ctx: MyContext): Promise<void> {
  const cost = +process.env.RESTORATION_COST || 1;
  const cost_hard = +process.env.RESTORATION_COST_HARD || 3;
  
  await ctx.reply(ctx.i18n.t('bot:generate.creases_question', {
    cost,
    cost_hard
  }), {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [
        Markup.button.callback(ctx.i18n.t('bot:generate.yes_button', {
          cost: cost_hard
        }), 'has_creases'),
        Markup.button.callback(ctx.i18n.t('bot:generate.no_button', {
          cost
        }), 'no_creases')
      ],
    ]).reply_markup,
  });
  ctx.wizard.next();
}

/**
 * Proceeds directly to generation after crease detection
 */
async function proceedToGeneration(ctx: MyContext, state: GenerateWizardState): Promise<void> {
  await processGeneration(ctx);
  await ctx.scene.leave();
}

// STEP HANDLERS

// Handler for processing user's photo input
photoHandler.on('photo', async ctx => {
  // Get the largest photo size
  const photoSizes = ctx.message.photo;
  const largestPhoto = photoSizes[photoSizes.length - 1];
  
  // Get file ID for download
  const fileId = largestPhoto.file_id;
  
  // Access stored user data from state
  const state = ctx.wizard.state as GenerateWizardState;
  state.generationData.fileId = fileId;
  state.generationData.hasPhoto = true;
  
  // Proceed to crease detection question
  await transitionToCreaseQuestion(ctx);
});

// Handle document messages (files)
photoHandler.on('document', async ctx => {
  const { document } = ctx.message;
  
  // Check if document is a photo/image
  if (!document.mime_type || !document.mime_type.startsWith('image/')) {
    await ctx.reply(ctx.i18n.t('bot:generate.not_an_image'));
    return; // Stay in this step
  }
  
  // Get file ID for download
  const fileId = document.file_id;
  
  // Access stored user data from state
  const state = ctx.wizard.state as GenerateWizardState;
  state.generationData.fileId = fileId;
  state.generationData.hasPhoto = true;

  await transitionToCreaseQuestion(ctx);
});

// Handle text messages (invalid input)
photoHandler.on('text', async ctx => {
  if (ctx.message.text === '/cancel') {
    // Allow cancel command
    await ctx.reply(ctx.i18n.t('bot:generate.cancelled'));
    return ctx.scene.leave();
  }
  
  // Remind user to send a photo
  await ctx.reply(ctx.i18n.t('bot:generate.no_photo'));
  return; // Stay in this step
});

// Handle all other message types
photoHandler.on('message', async ctx => {
  // Remind user to send a photo
  await ctx.reply(ctx.i18n.t('bot:generate.no_photo'));
  return; // Stay in this step
});

// SCENE DEFINITION AND SETUP

// Define wizard scene with explicit steps and action handlers
export const generateScene = new Scenes.WizardScene<MyContext>(
  'generate',
  // Step 0: Initial setup and prompt for input
  async (ctx) => {
    // Get user ID and initialize state
    const telegramId = ctx.from?.id.toString() || '';

    const initState = await initializeWizardState(ctx, telegramId);
    const canGenerate = await canUserGenerate(ctx, {remainingGenerations: initState.userData.remainingGenerations});
    if (!canGenerate) {
      return ctx.scene.leave();
    }
    
    if (!initState) {
      Logger.warn('Failed to initialize state in generate scene', { 
        telegramId,
        chatId: ctx.chat?.id
      });
      return ctx.scene.leave();
    }
    
    // Immediately prompt for photo
    await ctx.reply(ctx.i18n.t('bot:generate.start'), { 
      parse_mode: 'HTML'
    });
    
    // Move to photo input step
    return ctx.wizard.next();
  },
  
  // Step 1: Get photo
  photoHandler,
  
  // Step 2: Get crease info
  creasesHandler
);

// Setup callback actions for the scene after creation
function setupSceneHandlers(scene: Scenes.BaseScene<MyContext>) {
  // Invite friend button handler
  scene.action('invite_friend', async ctx => {
    await transitionToScene(ctx, 'referral');
  });

  // Has creases button handler
  scene.action('has_creases', async ctx => {
    await ctx.answerCbQuery();
    const state = ctx.wizard.state as GenerateWizardState;
    
    if (!state || !state.generationData) {
      Logger.error('State or generationData is undefined in has_creases handler', {
        chatId: ctx.chat?.id,
        userId: ctx.from?.id
      });
      await ctx.reply(ctx.i18n.t('bot:errors.general'));
      return ctx.scene.leave();
    }
    
    // Set creases flag
    state.generationData.hasCreases = true;
    
    // Process generation immediately
    await proceedToGeneration(ctx, state);
  });

  // No creases button handler
  scene.action('no_creases', async ctx => {
    await ctx.answerCbQuery();
    const state = ctx.wizard.state as GenerateWizardState;
    
    if (!state || !state.generationData) {
      Logger.error('State or generationData is undefined in no_creases handler', {
        chatId: ctx.chat?.id,
        userId: ctx.from?.id
      });
      await ctx.reply(ctx.i18n.t('bot:errors.general'));
      return ctx.scene.leave();
    }
    
    // Set creases flag
    state.generationData.hasCreases = false;

    
    
    // Process generation immediately
    await proceedToGeneration(ctx, state);
  });
  
  // Handle scene cancellation
  scene.command('cancel', async ctx => {
    await ctx.reply(ctx.i18n.t('bot:generate.cancelled'));
    return ctx.scene.leave();
  });

  // Handle interruptions
  scene.use(async (ctx, next) => {
    // Allow specific commands to interrupt the scene
    if (ctx.message && 'text' in ctx.message) {
      const text = ctx.message.text;
      if (text === '/cancel' || text === '/start' || text === '/help') {
        return; // Let the command handlers take care of this
      }
    }
    return next();
  });
}

// Set up scene handlers
setupSceneHandlers(generateScene);