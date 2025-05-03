import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { generateImage } from '../services/generation';
import { prisma } from '../utils/prisma';
import config from '../config';
import { processCompletedVideo } from '../services/replicate';

export default async function (fastify: FastifyInstance, options: FastifyPluginOptions) {
  // Create a new image generation
  fastify.post(
    '/',
    {
      preHandler: (fastify as any).authenticate,
    },
    async (request, reply) => {
      try {
        const userId = (request.user as { id: string }).id;
        const {
          prompt,
          negativePrompt,
          seed = -1,
          width = config.defaultGenerationSettings.width,
          height = config.defaultGenerationSettings.height,
          batchSize = config.defaultGenerationSettings.batchSize,
          model = config.reve.defaultModel,
        } = request.body as {
          prompt: string;
          negativePrompt?: string;
          seed?: number;
          width?: number;
          height?: number;
          batchSize?: number;
          model?: string;
        };

        // Validate prompt
        if (!prompt || prompt.length < 3) {
          return reply.status(400).send({ error: 'Prompt is too short' });
        }

        // Generate the image
        const generation = await generateImage({
          userId,
          prompt,
          negativePrompt,
          seed,
          width,
          height,
          batchSize,
          model,
        });

        return reply.send({ generation });
      } catch (error: any) {
        request.log.error(error);

        if (error.message === 'Insufficient remaining generations') {
          return reply.status(402).send({
            error: 'Insufficient remaining generations',
            message:
              'You need to subscribe or invite friends with your referral code to get more generations',
          });
        }

        return reply.status(500).send({ error: 'Generation failed' });
      }
    }
  );

  // Video generation webhook callback
  fastify.post(
    '/video-webhook/:webhookId',
    async (request, reply) => {
      try {
        const { webhookId } = request.params as { webhookId: string };
        const { generationId, chatId, userId, messageId, language, effect } = request.query as {
          generationId: string;
          chatId: string;
          userId: string;
          messageId: string;
          language: string;
          effect: 'animation' | 'hug';
        };
        
        // Validate required parameters
        if (!generationId || !chatId || !userId || !messageId) {
          request.log.error('Missing required parameters in video webhook');
          return reply.status(400).send({ error: 'Missing required parameters' });
        }

        // Get prediction data from request body
        const prediction = request.body as any;

        console.log("PREDICTION");
        console.log(prediction);
        
        let videoUrl: string | null = null;
        if (effect === 'animation') {
        // Validate prediction
        if (!prediction || !prediction.status) {
          request.log.error('Invalid prediction data in webhook', prediction);
          return reply.status(400).send({ error: 'Invalid prediction data' });
        }

        request.log.info(`Received video webhook for generation ${generationId}, status: ${prediction.status}`);
        
        // Check if the prediction is completed
        if (prediction.status === 'succeeded') {
          // Get the video URL from the output
          videoUrl = prediction.output;
          

        }

        }else {
          console.log(prediction);
          videoUrl = prediction.payload.video.url;
        }

        if (!videoUrl) {
          request.log.error('No video URL in completed prediction', prediction);
          return reply.status(400).send({ error: 'No video URL in prediction output' });
        }

        if (videoUrl) {
        await processCompletedVideo(
          generationId,
          videoUrl,
          parseInt(chatId, 10),
          parseInt(messageId, 10),
          language || 'en'
        );
        return reply.send({ success: true });

      }
        
        // If prediction failed
        if (prediction.status.toLowerCase() === 'failed') {
          // Update generation status
          await prisma.generation.update({
            where: { id: generationId },
            data: {
              status: 'FAILED',
              error: prediction.error || 'Video generation failed'
            }
          });
          
          // Refund the user
          await prisma.user.update({
            where: { id: userId },
            data: {
              remainingGenerations: {
                increment: parseInt(process.env.VIDEO_GENERATION_COST || '10', 10) // VIDEO_GENERATION_COST
              }
            }
          });
          
          request.log.error('Video generation failed', prediction);
          return reply.send({ success: false, error: 'Video generation failed' });
        }
        
        // For other statuses, just acknowledge
        return reply.send({ success: true, status: prediction.status });
      } catch (error) {
        request.log.error('Error processing video webhook', error);
        return reply.status(500).send({ error: 'Failed to process webhook' });
      }
    }
  );

  // Get a specific generation
  fastify.get(
    '/:id',
    {
      preHandler: (fastify as any).authenticate,
    },
    async (request, reply) => {
      try {
        const userId = (request.user as { id: string }).id;
        const { id } = request.params as { id: string };

        const generation = await prisma.generation.findUnique({
          where: { id },
        });

        if (!generation) {
          return reply.status(404).send({ error: 'Generation not found' });
        }

        // Ensure the generation belongs to the user
        if (generation.userId !== userId) {
          return reply.status(403).send({ error: 'Access denied' });
        }

        return reply.send({ generation });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to get generation' });
      }
    }
  );

  // Get all generations for the current user
  fastify.get(
    '/',
    {
      preHandler: (fastify as any).authenticate,
    },
    async (request, reply) => {
      try {
        const userId = (request.user as { id: string }).id;
        const { page = '1', limit = '10' } = request.query as {
          page?: string;
          limit?: string;
        };

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const generations = await prisma.generation.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limitNum,
        });

        const totalCount = await prisma.generation.count({
          where: { userId },
        });

        return reply.send({
          generations,
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalCount,
            totalPages: Math.ceil(totalCount / limitNum),
          },
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to get generations' });
      }
    }
  );
}
