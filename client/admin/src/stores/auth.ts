import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import axios from 'axios';

// Новый интерфейс только с паролем для админа
interface AdminLoginCredentials {
  password: string;
}

interface User {
  role: string;
}

export const useAuthStore = defineStore('auth', () => {
  // Состояние
  const token = ref<string | null>(localStorage.getItem('admin_token'));
  const user = ref<User | null>(null);
  const isLoading = ref<boolean>(false);
  const error = ref<string | null>(null);

  // Геттеры
  const isAuthenticated = computed(() => !!token.value);
  const isAdmin = computed(() => user.value?.role === 'ADMIN');
  const getUser = computed(() => user.value);
  const getToken = computed(() => token.value);
  const getIsLoading = computed(() => isLoading.value);
  const getError = computed(() => error.value);

  // Экшены
  const login = async (credentials: AdminLoginCredentials) => {
    try {
      isLoading.value = true;
      error.value = null;
      
      // Обновленный эндпоинт для авторизации админа
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const response = await axios.post(`${apiUrl}/admin/login`, credentials);
      
      const { token: newToken, user: userData } = response.data;
      
      token.value = newToken;
      user.value = userData || { role: 'ADMIN' };
      
      // Сохраняем токен в localStorage
      localStorage.setItem('admin_token', newToken);
      
      return userData;
    } catch (err: any) {
      error.value = err.response?.data?.message || 'Ошибка авторизации';
      console.error('Login error:', err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  };
  
  const logout = () => {
    token.value = null;
    user.value = null;
    localStorage.removeItem('admin_token');
  };
  
  const checkAuth = async () => {
    if (!token.value) return false;
    
    try {
      // Устанавливаем пользователя как админа - в нашем случае наличие валидного токена
      // уже означает, что это администратор, т.к. обычные пользователи не используют веб-интерфейс
      user.value = { role: 'ADMIN' };
      return true;
    } catch (err) {
      console.error('Auth check error:', err);
      logout();
      return false;
    }
  };

  return {
    // Состояние
    token,
    user,
    isLoading,
    error,
    
    // Геттеры
    isAuthenticated,
    isAdmin,
    getUser,
    getToken,
    getIsLoading,
    getError,
    
    // Экшены
    login,
    logout,
    checkAuth,
  };
}); 