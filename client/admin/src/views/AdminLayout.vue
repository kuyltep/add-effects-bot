<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const isCollapse = ref(false);

// Функция для выхода из системы
const handleLogout = () => {
  localStorage.removeItem('admin_token');
  router.push('/login');
};
</script>

<template>
  <!-- Главный контейнер -->
  <div class="flex h-screen bg-gray-50">
    <!-- Боковое меню -->
    <div :class="['bg-gray-800 text-white transition-all', isCollapse ? 'w-20' : 'w-64']">
      <!-- Заголовок -->
      <div class="p-4 flex items-center justify-between">
        <h1 :class="['font-bold text-xl transition-opacity', isCollapse ? 'opacity-0' : 'opacity-100']">
          Reve Admin
        </h1>
        <button @click="isCollapse = !isCollapse" class="text-white p-1 rounded hover:bg-gray-700">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6">
            <path v-if="isCollapse" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      <!-- Элементы навигации -->
      <div class="mt-5">
        <router-link to="/" exact-active-class="bg-gray-700" class="flex items-center px-4 py-3 hover:bg-gray-700">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          <span :class="['ml-3 transition-opacity', isCollapse ? 'opacity-0' : 'opacity-100']">Дашборд</span>
        </router-link>

        <router-link to="/users" exact-active-class="bg-gray-700" class="flex items-center px-4 py-3 hover:bg-gray-700">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <span :class="['ml-3 transition-opacity', isCollapse ? 'opacity-0' : 'opacity-100']">Пользователи</span>
        </router-link>

        <router-link to="/generations" exact-active-class="bg-gray-700"
          class="flex items-center px-4 py-3 hover:bg-gray-700">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span :class="['ml-3 transition-opacity', isCollapse ? 'opacity-0' : 'opacity-100']">Генерации</span>
        </router-link>

        <router-link to="/payments" exact-active-class="bg-gray-700"
          class="flex items-center px-4 py-3 hover:bg-gray-700">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span :class="['ml-3 transition-opacity', isCollapse ? 'opacity-0' : 'opacity-100']">Платежи</span>
        </router-link>

        <!-- Кнопка выхода -->
        <div @click="handleLogout" class="flex items-center px-4 py-3 hover:bg-gray-700 cursor-pointer mt-8">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span :class="['ml-3 transition-opacity', isCollapse ? 'opacity-0' : 'opacity-100']">Выход</span>
        </div>
      </div>
    </div>

    <!-- Основной контент -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Верхняя панель -->
      <header class="bg-white shadow">
        <div class="px-6 py-4">
          <h2 class="text-xl font-semibold text-gray-800">Админ-панель Reve AI</h2>
        </div>
      </header>

      <!-- Основной контент страницы -->
      <main class="flex-1 overflow-auto p-6">
        <router-view />
      </main>
    </div>
  </div>
</template>