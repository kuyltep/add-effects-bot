<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';

const router = useRouter();
const password = ref('');
const errorMessage = ref('');
const isLoading = ref(false);

const apiUrl = import.meta.env.VITE_API_URL || '';

const login = async () => {
  if (!password.value) {
    errorMessage.value = 'Введите пароль администратора';
    return;
  }

  try {
    isLoading.value = true;
    // Используем новый эндпоинт для аутентификации админа
    const response = await axios.post(`${apiUrl}/admin/login`, {
      password: password.value
    });

    // Проверяем ответ
    if (response.data.token) {
      // Сохраняем токен
      localStorage.setItem('admin_token', response.data.token);
      router.push('/');
    } else {
      errorMessage.value = 'Ошибка авторизации';
    }
  } catch (error) {
    console.error('Login error:', error);
    errorMessage.value = 'Неверный пароль администратора';
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8 bg-white p-10 rounded-lg shadow-md">
      <div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
          AI Admin
        </h2>
        <p class="mt-2 text-center text-sm text-gray-600">
          Админ-панель для управления сервисом генерации изображений
        </p>
      </div>
      <form class="mt-8 space-y-6" @submit.prevent="login">
        <div class="rounded-md shadow-sm">
          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 mb-2">Пароль администратора</label>
            <input id="password" name="password" type="password" v-model="password" required
              class="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
              placeholder="Введите пароль из .env файла" />
          </div>
        </div>

        <div v-if="errorMessage" class="text-red-500 text-sm text-center">
          {{ errorMessage }}
        </div>

        <div>
          <button type="submit" :disabled="isLoading"
            class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
            <span v-if="isLoading" class="absolute left-0 inset-y-0 flex items-center pl-3">
              <!-- Спиннер -->
              <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none"
                viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
                </path>
              </svg>
            </span>
            {{ isLoading ? 'Вход...' : 'Войти' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>