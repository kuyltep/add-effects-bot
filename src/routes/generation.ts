import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../utils/prisma';
import { processCompletedVideo } from '../services/replicate';

export default async function (fastify: FastifyInstance, options: FastifyPluginOptions) {
  // Video generation webhook callback
  fastify.post(
    '/video-webhook/:webhookId',
    async (request, reply) => {
      try {
        const { webhookId } = request.params as { webhookId: string };
        const { generationId, chatId, userId, messageId, language, effect, source } = request.query as {
          generationId: string;
          chatId: string;
          userId: string;
          messageId: string;
          language: string;
          effect: string;
          source: string;
        };
        
        // Validate required parameters
        if (!generationId || !chatId || !userId || !messageId) {
          request.log.error('Missing required parameters in video webhook');
          return reply.status(400).send({ error: 'Missing required parameters' });
        }

        // Get prediction data from request body
        const prediction = request.body as any;
        request.log.info(`Received video webhook for generation ${generationId}, effect: ${effect}, status: ${prediction?.status || 'unknown'}`);
        
        // Log prediction for debugging
        if (process.env.NODE_ENV !== 'production') {
          console.log("Prediction data:", JSON.stringify(prediction, null, 2));
        }
        
        let videoUrl: string | null = null;
        
        // Handle different model responses based on effect type
        const falEffects = ['hug', 'kiss', 'jesus', 'microwave'];
        
        if (falEffects.includes(effect)) {
          // FAL AI model response format
          if (prediction?.payload?.video?.url) {
            videoUrl = prediction.payload.video.url;
          }
        } else {
          // Replicate model response format
          if (prediction?.status === 'succeeded' && prediction?.output) {
            videoUrl = prediction.output;
          }
        }

        // Process the video if we have a URL
        if (videoUrl) {
          await processCompletedVideo(
            generationId,
            videoUrl,
            parseInt(chatId, 10),
            parseInt(messageId, 10),
            language || 'en',
            source
          );
          return reply.send({ success: true });
        }
        
        // If prediction failed
        if (prediction?.status?.toLowerCase() === 'failed' || prediction?.status?.toLowerCase() === 'error') {
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
        return reply.send({ success: true, status: prediction?.status || 'processing' });
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
