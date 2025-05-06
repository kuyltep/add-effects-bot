import { Markup, Scenes } from 'telegraf';
import { MyContext } from '../../types/bot';
import { handleSceneError, exitScene } from '../../services/scene';
import { VideoSceneState } from '../../types/bot/scene.type';
import { 
  validateUser, 
  resolveImagePath, 
  processVideoGeneration,
  VIDEO_GENERATION_COST
} from '../../services/videoSceneUtils';

// Create the video effect scene
export const videoEffectScene = new Scenes.BaseScene<MyContext>('videoEffect');

// Effect options with paired indication
const effectOptions = [
  { id: 'kiss', i18nKey: 'bot:effects.kiss', paired: true },
  { id: 'jesus', i18nKey: 'bot:effects.jesus', paired: false },
  { id: 'hug', i18nKey: 'bot:effects.hug', paired: true },
  { id: 'microwave', i18nKey: 'bot:effects.microwave', paired: false },
];

// Effect prompts mapping
const EFFECT_PROMPTS: Record<string, string> = {
  'claymation': 'The characters move in a stop-motion claymation style, with slightly exaggerated movements and clay-like texture. Camera fixed.',
  'ghibli': 'The characters move in a smooth, Ghibli animation style with gentle movements and expressions. Light breeze effect. Camera fixed.',
  'pixar': 'The characters move in a Pixar-style 3D animation with smooth, expressive movements and bright, colorful appearance. Camera fixed.',
  'plushify': 'The characters move like soft plush toys with slight bouncy movements and fabric-like texture. Camera fixed.',
  'ghiblify': 'The characters move in a hand-drawn anime style with fluid movements and emotional expressions. Gentle ambient lighting. Camera fixed.',
  'cartoonify': 'The characters move in a classic cartoon style with exaggerated, bouncy movements and simplified features. Camera fixed.',
  'kiss': 'The characters move slightly and kiss each other with naturalistic movements. Camera fixed.',
  'jesus': 'The character is embraced by a Jesus-like figure with divine light and gentle movements. Camera fixed.',
  'hug': 'The characters hug each other with warm, natural movements. Camera fixed.',
  'microwave': 'The character spins around slowly like in a microwave with smooth rotation. Camera fixed.'
};

// Scene enter handler
videoEffectScene.enter(async (ctx) => {
  try {
    // Validate user
    const user = await validateUser(ctx);
    if (!user) {
      return await exitScene(ctx);
    }

    // Validate and resolve image path
    const state = ctx.scene.state as VideoSceneState;
    const imagePath = await resolveImagePath(ctx, state);
    if (!imagePath) {
      return await exitScene(ctx);
    }

    // Create effect selection buttons - 2 per row
    const effectButtons = [];
    for (let i = 0; i < effectOptions.length; i += 2) {
      const row = [];
      
      // Add first button in row
      const firstOption = effectOptions[i];
      const firstLabel = `${ctx.i18n.t(firstOption.i18nKey)}${firstOption.paired ? ' 👥' : ''}`;
      row.push(Markup.button.callback(firstLabel, `effect:${firstOption.id}`));
      
      // Add second button if exists
      if (i + 1 < effectOptions.length) {
        const secondOption = effectOptions[i + 1];
        const secondLabel = `${ctx.i18n.t(secondOption.i18nKey)}${secondOption.paired ? ' 👥' : ''}`;
        row.push(Markup.button.callback(secondLabel, `effect:${secondOption.id}`));
      }
      
      effectButtons.push(row);
    }
    
    // Add back button in its own row
    effectButtons.push([Markup.button.callback(ctx.i18n.t('bot:video.back_button'), 'back')]);

    // Show image and prompt for effect selection
    const sentMessage = await ctx.replyWithPhoto(
      imagePath.startsWith('http') ? imagePath : { source: imagePath },
      {
        caption: ctx.i18n.t('bot:effects.select_effect', { 
          cost: VIDEO_GENERATION_COST
        }) + '\n\n' + ctx.i18n.t('bot:effects.paired_note'),
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(effectButtons)
      }
    );
    
    // Store message ID for later deletion if needed
    state.messageId = sentMessage.message_id;
  } catch (error) {
    await handleSceneError(ctx, error, 'videoEffect');
  }
});

// Handle all effect type selections
videoEffectScene.action(/^effect:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  
  // Extract the selected effect from the callback data
  const effectMatch = ctx.match[0].match(/^effect:(.+)$/);
  if (!effectMatch) return;
  
  const selectedEffect = effectMatch[1];
  const prompt = EFFECT_PROMPTS[selectedEffect] || '';
  
  await processVideoGeneration(ctx, selectedEffect, prompt);
});

// Handle back button - just delete the message and exit scene
videoEffectScene.action('back', async (ctx) => {
  await ctx.answerCbQuery();
  
  // Get the message ID from state or callback query
  const state = ctx.scene.state as VideoSceneState;
  const messageId = state.messageId || ctx.callbackQuery?.message?.message_id;
  
  // Delete the message if we have its ID
  if (messageId) {
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  }
  
  return await exitScene(ctx);
}); 