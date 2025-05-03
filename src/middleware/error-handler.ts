import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Logger } from '../utils/rollbar.logger';


export function setupErrorHandler(fastify: FastifyInstance): void {
  fastify.setErrorHandler((error, request, reply) => {
    const path = request.raw.url;
    const method = request.raw.method;
    
    const errorContext = {
      path,
      method,
      headers: request.headers,
      query: request.query,
      params: request.params,
      body: request.body,
      user: (request as any).user?.id || null
    };
    
    // Determine status code - use error code if available or default to 500
    const statusCode = error.statusCode || 500;
    
    // Log the error to Rollbar with context
    if (statusCode >= 500) {
      // Log server errors as critical
      Logger.critical(error, { 
        ...errorContext, 
        statusCode
      });
    } else if (statusCode >= 400) {
      // Log client errors as warnings
      Logger.warn(`Client error: ${error.message}`, { 
        ...errorContext, 
        statusCode
      });
    } else {
      // Log other errors as regular errors
      Logger.error(error, { 
        ...errorContext, 
        statusCode
      });
    }

    


    const messages = {
      400: 'Invalid request parameters',
      401: 'Authentication required',
      403: 'You do not have permission to access this resource',
      404: 'The requested resource was not found',
      429: 'Rate limit exceeded, please try again later',
      500: 'An internal server error occurred'
    }

    let message = messages[statusCode] || 'An internal server error occurred';
    
    // Don't expose internal error details in production
    if (process.env.NODE_ENV !== 'production') {
      message = error.message;
    }
    
    // Send response with appropriate status code
    reply.status(statusCode).send({ 
      error: true,
      message,
      ...(process.env.NODE_ENV !== 'production' ? { stack: error.stack } : {})
    });
  });
  
  // Handle 404 errors
  fastify.setNotFoundHandler((request, reply) => {
    Logger.warn('Route not found', { 
      path: request.raw.url, 
      method: request.raw.method 
    });
    
    reply.status(404).send({ 
      error: true, 
      message: 'Route not found' 
    });
  });
} 