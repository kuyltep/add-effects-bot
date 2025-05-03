<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

const goBack = () => {
  router.push('/');
};
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full text-center">
      <h1 class="text-9xl font-bold text-blue-600">404</h1>
      <h2 class="mt-3 text-2xl font-semibold text-gray-900">Страница не найдена</h2>
      <p class="mt-4 text-gray-600">Страница, которую вы ищете, не существует или была перемещена.</p>
      <div class="mt-6">
        <button @click="goBack" class="btn">
          Вернуться на главную
        </button>
      </div>
    </div>
  </div>
</template> 