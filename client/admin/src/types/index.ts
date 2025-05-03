// Базовый интерфейс пользователя
export interface User {
  id: string;
  username: string;
  email: string;
  telegramId?: string;
  telegramUsername?: string;
  telegramChatId?: string;
  createdAt: string;
  updatedAt: string;
  bannedAt?: string;
  isBanned?: boolean;
  banReason?: string;
  remainingGenerations: number;
  subscriptionActive?: boolean;
  subscriptionEndDate?: string;
  referralCode: string;
  role: 'user' | 'admin';
}

// Расширенный интерфейс пользователя со статистикой
export interface UserWithStats extends User {
  generationCount: number;
  paymentCount: number;
  referralCount: number;
  
  settings: UserSettings | null;
}

// Настройки пользователя
export interface UserSettings {
  id: string;
  userId: string;
  useNegativePrompt: boolean;
  useSeed: boolean;
  batchSize: number;
  resolution: 'SQUARE' | 'VERTICAL' | 'HORIZONTAL';
  model: string;
  language?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Интерфейс для генерации изображения
export interface Generation {
  id: string;
  userId: string;
  username?: string;
  prompt: string;
  translatedPrompt?: string;
  status: "COMPLETED" | "PENDING" | "PROCESSING" | "FAILED";
  resultUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  width: number;
  height: number;
  seed: number;
  batchSize: number;
  model: string;
  imageUrls: string[];
  metadata?: {
    width?: number;
    height?: number;
    steps?: number;
    seed?: number;
    model?: string;
    [key: string]: any;
  };
}

// Статус генерации
export enum GenerationStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

// Изображение в генерации
export interface GenerationImage {
  id: string;
  generationId: string;
  url: string;
  createdAt: string;
}

// Интерфейс для платежа
export interface Payment {
  id: string;
  userId: string;
  amount: number;
  status: string;
  transactionId: number;
  subscriptionType?: string;
  subscriptionDays?: number;
  generationsAdded?: number;
  createdAt: string;
  user?: User;
}

// Реферал
export interface Referral {
  id: string;
  referrerId: string;
  invitedUserId: string;
  createdAt: string;
  invitedUser: {
    id: string;
    email: string;
    createdAt: string;
  };
}

// Результат запроса списка пользователей
export interface UserListResponse {
  users: UserWithStats[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

// Параметры фильтрации для запроса пользователей
export interface UserFilterOptions {
  page: number;
  limit: number;
  search?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

// Результат запроса списка платежей
export interface PaymentListResponse {
  payments: Payment[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Параметры фильтрации для запроса платежей
export interface PaymentFilterOptions {
  page: number;
  limit: number;
  search?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  status?: string;
}

// Типы для статистики дашборда
export interface DashboardStats {
  users: {
    total: number;
    last30Days: number;
  };
  generations: {
    total: number;
    last30Days: number;
  };
  payments: {
    total: number;
    last30Days: number;
  };
  revenue: {
    total: number;
    last30Days: number;
  };
}

// Запрос для авторизации администратора
export interface AdminLoginRequest {
  password: string;
}

// Ответ при успешной авторизации
export interface LoginResponse {
  token: string;
  user: {
    role: string;
  };
}

// Запрос на обновление пользователя
export interface UserUpdateRequest {
  remainingGenerations?: number;
  subscriptionActive?: boolean;
  subscriptionEndDate?: string;
  role?: string;
}

// Запрос на блокировку пользователя
export interface BanUserRequest {
  reason?: string;
}

// Ответ с детальной информацией о пользователе
export interface UserDetailsResponse {
  user: User & {
    referrals: Referral[];
    payments: Payment[];
    recentGenerations: Generation[];
    settings?: UserSettings;
  };
} 