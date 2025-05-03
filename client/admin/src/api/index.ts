import axios from 'axios';
import type {
  UserListResponse,
  UserFilterOptions,
  PaymentListResponse,
  PaymentFilterOptions,
  DashboardStats,
  AdminLoginRequest,
  LoginResponse,
  User,
  UserSettings,
  Generation,
  UserUpdateRequest,
  UserDetailsResponse,
} from '../types';
import { useAuthStore } from '../stores/auth';

// Determine the API URL - in production, we expect this to be set as an env var on Railway
const apiBaseUrl = import.meta.env.VITE_API_URL ||  'https://old-new-bot-production.up.railway.app/api';

// Create axios instance with base URL
const api = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Интерцептор для добавления токена аутентификации
api.interceptors.request.use(config => {
  const authStore = useAuthStore();
  const token = authStore.token;
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  return config;
}, error => {
  return Promise.reject(error);
});

// Интерцептор для обработки ответов
api.interceptors.response.use(
  response => response,
  error => {
    // Если ошибка авторизации (401), выйти из системы
    if (error.response && error.response.status === 401) {
      const authStore = useAuthStore();
      authStore.logout();
    }
    return Promise.reject(error);
  }
);

// API-методы для аутентификации
export const authApi = {
  /**
   * Авторизация администратора по паролю
   * @param credentials - Объект с паролем администратора
   * @returns Ответ с токеном и данными пользователя
   */
  login: async (credentials: AdminLoginRequest): Promise<LoginResponse> => {
    const response = await api.post('/admin/login', credentials);
    return response.data;
  },
};

// API-методы для работы с дашбордом
export const dashboardApi = {
  getStats: async (): Promise<DashboardStats> => {
    const response = await api.get('/admin/dashboard');
    return response.data;
  },
};

// API-методы для работы с пользователями
export const usersApi = {
  getUsers: async (options: UserFilterOptions): Promise<UserListResponse> => {
    const { page, limit, search, sortBy, sortDirection } = options;
    const response = await api.get('/admin/users', {
      params: {
        page,
        limit,
        search,
        sortBy,
        sortDirection,
      },
    });
    return response.data;
  },

  getUserById: async (id: string): Promise<UserDetailsResponse> => {
    const response = await api.get(`/admin/users/${id}`);
    return response.data;
  },

  getUserSettings: async (userId: string): Promise<UserSettings> => {
    const response = await api.get(`/admin/users/${userId}/settings`);
    return response.data;
  },

  updateUser: async (id: string, data: UserUpdateRequest): Promise<User> => {
    const response = await api.put(`/admin/users/${id}`, data);
    return response.data.user;
  },

  // Update the user's remaining generations
  updateGenerations: async (id: string, remainingGenerations: number): Promise<User> => {
    const response = await api.put(`/admin/users/${id}`, { remainingGenerations });
    return response.data.user;
  },

  banUser: async (id: string, reason?: string): Promise<User> => {
    const response = await api.post(`/admin/users/${id}/ban`, { reason });
    return response.data.user;
  },

  unbanUser: async (id: string): Promise<User> => {
    const response = await api.post(`/admin/users/${id}/unban`);
    return response.data.user;
  },
};

// API-методы для работы с платежами
export const paymentsApi = {
  getPayments: async (options: PaymentFilterOptions): Promise<PaymentListResponse> => {
    const { page, limit, search, sortBy, sortDirection, status } = options;
    const response = await api.get('/admin/payments', {
      params: {
        page,
        limit,
        search,
        sortBy,
        sortDirection,
        status,
      },
    });
    return response.data;
  },
  
  getPaymentById: async (id: string): Promise<any> => {
    const response = await api.get(`/admin/payments/${id}`);
    return response.data;
  },
};

// API для работы с генерациями
export const generationsApi = {
  getGenerations: async (options: UserFilterOptions): Promise<{ generations: Generation[], total: number }> => {
    const { page, limit, search, sortBy, sortDirection } = options;
    const response = await api.get('/admin/generations', {
      params: {
        page,
        limit,
        search,
        sortBy,
        sortDirection,
      },
    });
    return response.data;
  },

  getUserGenerations: async (userId: string, options: UserFilterOptions): Promise<{ generations: Generation[], total: number }> => {
    const { page, limit, sortBy, sortDirection } = options;
    const response = await api.get(`/admin/users/${userId}/generations`, {
      params: {
        page,
        limit,
        sortBy,
        sortDirection,
      },
    });
    return response.data;
  },
};

export { api }; 