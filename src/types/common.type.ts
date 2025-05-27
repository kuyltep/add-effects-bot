/**
 * Utility type for pagination
 */
export interface PaginationOptions {
  page: number;
  limit: number;
}

/**
 * Utility type for API responses
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
