<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useUsersStore } from '../stores/users';
import { ElMessage } from 'element-plus';

const props = defineProps<{
  visible: boolean;
  userId: string | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

// Инициализация хранилища
const usersStore = useUsersStore();

// Состояние формы
const isLoading = ref(false);
const formData = ref({
  email: '',
  remainingGenerations: 0,
  subscriptionActive: false,
  subscriptionEndDate: '',
  // Другие поля, которые можно редактировать
});

// Загрузка данных пользователя
const loadUserData = async () => {
  if (!props.userId) return;
  
  try {
    isLoading.value = true;
    const userData = await usersStore.getUserById(props.userId);
    if (userData) {
      formData.value = {
        email: userData.email || '',
        remainingGenerations: userData.remainingGenerations || 0,
        subscriptionActive: userData.subscriptionActive || false,
        subscriptionEndDate: userData.subscriptionEndDate || '',
        // Заполнение других полей
      };
    }
  } catch (error) {
    ElMessage({
      type: 'error',
      message: 'Ошибка загрузки данных пользователя',
    });
  } finally {
    isLoading.value = false;
  }
};

// Обработка отправки формы
const handleSubmit = async () => {
  if (!props.userId) return;
  
  try {
    isLoading.value = true;
    await usersStore.updateUser(props.userId, {
      remainingGenerations: formData.value.remainingGenerations,
      subscriptionActive: formData.value.subscriptionActive,
      subscriptionEndDate: formData.value.subscriptionEndDate,
      // Другие поля, которые редактируются
    });
    
    ElMessage({
      type: 'success',
      message: 'Пользователь успешно обновлен',
    });
    
    emit('close');
  } catch (error) {
    ElMessage({
      type: 'error',
      message: 'Ошибка обновления пользователя',
    });
  } finally {
    isLoading.value = false;
  }
};

// Загрузка данных пользователя при открытии диалога
watch(() => props.visible, (newValue) => {
  if (newValue && props.userId) {
    loadUserData();
  }
});

// Загрузка данных при монтировании, если диалог открыт
onMounted(() => {
  if (props.visible && props.userId) {
    loadUserData();
  }
});

// Обработка закрытия диалога
const handleClose = () => {
  emit('close');
};
</script>

<template>
  <div
    v-if="visible"
    class="fixed inset-0 flex items-center justify-center z-50"
  >
    <!-- Затемнение фона -->
    <div class="absolute inset-0 bg-black bg-opacity-50" @click="handleClose"></div>
    
    <!-- Модальное окно -->
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md relative z-10 mx-4">
      <div class="p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-6">Редактирование пользователя</h2>
        
        <!-- Спиннер загрузки -->
        <div v-if="isLoading" class="flex justify-center items-center p-10">
          <svg class="animate-spin h-10 w-10 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
        
        <!-- Форма редактирования -->
        <form v-else @submit.prevent="handleSubmit">
          <!-- Email (только для просмотра) -->
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              v-model="formData.email"
              disabled
              class="w-full p-2 border border-gray-300 rounded-md bg-gray-100"
            />
            <p class="text-xs text-gray-500 mt-1">Email нельзя изменить</p>
          </div>
          
          <!-- Генерации -->
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">Оставшиеся генерации</label>
            <input
              type="number"
              v-model="formData.remainingGenerations"
              min="0"
              class="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <!-- Статус подписки -->
          <div class="mb-4">
            <label class="flex items-center">
              <input
                type="checkbox"
                v-model="formData.subscriptionActive"
                class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span class="ml-2 text-sm font-medium text-gray-700">Активная подписка</span>
            </label>
          </div>
          
          <!-- Дата окончания подписки -->
          <div class="mb-6" v-if="formData.subscriptionActive">
            <label class="block text-sm font-medium text-gray-700 mb-1">Дата окончания подписки</label>
            <input
              type="date"
              v-model="formData.subscriptionEndDate"
              class="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <!-- Кнопки действий -->
          <div class="flex justify-end">
            <button
              type="button"
              @click="handleClose"
              class="mr-3 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Отмена
            </button>
            <button
              type="submit"
              :disabled="isLoading"
              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template> 