<script setup lang="ts">
import { ref, onMounted, computed, watch, onBeforeUnmount } from 'vue';
import { useUsersStore } from '../stores/users';
import { ElMessageBox, ElMessage } from 'element-plus';
import UserEditDialog from '../components/UserEditDialog.vue';
import { useRouter } from 'vue-router';

// Инициализация хранилища
const usersStore = useUsersStore();
const router = useRouter();

// Состояние компонента
const users = computed(() => usersStore.users);
const totalUsers = computed(() => usersStore.totalUsers);
const isLoading = computed(() => usersStore.isLoading);
const error = computed(() => usersStore.error);
const filterOptions = computed(() => usersStore.filterOptions);
const refreshInterval = ref<number | null>(null);
const refreshRate = 15000; // 15 seconds refresh rate

// Состояние модального окна редактирования
const editUserDialogVisible = ref(false);
const selectedUserId = ref('');

// Состояние фильтрации
const searchQuery = ref('');
const searchTimeout = ref<number | null>(null);
const userStatusFilter = ref('all');

// Получение списка пользователей
const fetchUsers = async () => {
  try {
    await usersStore.fetchUsers();
  } catch (error) {
    console.error('Error fetching users:', error);
  }
};

// Обработчик ввода в поле поиска
const handleSearchInput = () => {
  if (searchTimeout.value) {
    clearTimeout(searchTimeout.value);
  }

  searchTimeout.value = setTimeout(() => {
    usersStore.updateFilterOptions({
      search: searchQuery.value,
      page: 1 // Сбрасываем на первую страницу при поиске
    });
    fetchUsers();
  }, 500) as unknown as number;
};

// Обработчик изменения страницы
const handlePageChange = (page: number) => {
  usersStore.updateFilterOptions({ page });
  fetchUsers();
};

// Обработчик изменения количества элементов на странице
const handleSizeChange = (size: number) => {
  usersStore.updateFilterOptions({
    limit: size,
    page: 1 // Сбрасываем на первую страницу при изменении размера
  });
  fetchUsers();
};

// Открытие диалога редактирования пользователя
const openEditDialog = (userId: string) => {
  selectedUserId.value = userId;
  editUserDialogVisible.value = true;
};

// Закрытие диалога редактирования пользователя
const closeEditDialog = () => {
  editUserDialogVisible.value = false;
  selectedUserId.value = '';
  fetchUsers(); // Обновляем список пользователей после закрытия диалога
};

// Форматирование даты
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Открытие страницы с подробной информацией о пользователе
// @ts-ignore
const openUserDetails = (userId: string) => {
  router.push(`/users/${userId}`);
};

// Обработчик бана пользователя
const handleBanUser = async (userId: string) => {
  try {
    // Запрашиваем причину бана (опционально)
    const { value: banReason, action } = await ElMessageBox.prompt(
      'Укажите причину бана пользователя (необязательно):',
      'Бан пользователя',
      {
        confirmButtonText: 'Подтвердить',
        cancelButtonText: 'Отмена',
        inputPlaceholder: 'Причина бана',
        // Удаляем валидатор для возможности оставить поле пустым
        showCancelButton: true,
        distinguishCancelAndClose: true
      }
    );

    // Если нажата кнопка "Подтвердить", продолжаем с баном
    if (action === 'confirm') {
      await usersStore.banUser(userId, banReason || undefined);
      ElMessage.success('Пользователь успешно заблокирован');
    }
  } catch (error) {
    // Игнорируем ошибку, если пользователь отменил действие
    if (error !== 'cancel' && error !== 'close') {
      console.error('Error banning user:', error);
      ElMessage.error('Не удалось заблокировать пользователя');
    }
  }
};

// Обработчик разбана пользователя
const handleUnbanUser = async (userId: string) => {
  try {
    await ElMessageBox.confirm(
      'Вы уверены, что хотите разблокировать этого пользователя?',
      'Разблокировка пользователя',
      {
        confirmButtonText: 'Подтвердить',
        cancelButtonText: 'Отмена',
        type: 'warning'
      }
    );

    await usersStore.unbanUser(userId);
    ElMessage.success('Пользователь успешно разблокирован');
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Error unbanning user:', error);
      ElMessage.error('Не удалось разблокировать пользователя');
    }
  }
};

// Быстрый бан пользователя без запроса причины
const handleQuickBan = async (userId: string) => {
  try {
    await usersStore.banUser(userId);
    ElMessage.success('Пользователь успешно заблокирован');
  } catch (error) {
    console.error('Error banning user:', error);
    ElMessage.error('Не удалось заблокировать пользователя');
  }
};

// Отслеживание изменения фильтра по статусу
watch(userStatusFilter, (_newValue) => {
  // TODO: Добавить фильтрацию по статусу пользователя, когда будет доступно в API
  fetchUsers();
});

// Функция для запуска интервала обновления данных
const startPolling = () => {
  stopPolling(); // Сначала остановим, если был запущен
  refreshInterval.value = setInterval(fetchUsers, refreshRate) as unknown as number;
};

// Функция для остановки интервала обновления данных
const stopPolling = () => {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value);
    refreshInterval.value = null;
  }
};

// Инициализация при монтировании компонента
onMounted(async () => {
  await fetchUsers();
  startPolling();
});

// Очистка при размонтировании компонента
onBeforeUnmount(() => {
  stopPolling();
  if (searchTimeout.value) {
    clearTimeout(searchTimeout.value);
  }
});
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold text-gray-900 mb-6">Пользователи</h1>

    <!-- Фильтры и поиск -->
    <div class="bg-white p-4 rounded-lg shadow mb-6">
      <div class="flex flex-col md:flex-row gap-4 mb-4">
        <div class="flex-1">
          <div class="relative">
            <input v-model="searchQuery" @input="handleSearchInput" type="text"
              placeholder="Поиск по имени, TelegramID или email..."
              class="w-full p-2 pl-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400 absolute left-3 top-3" fill="none"
              viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
        <div>
          <select v-model="userStatusFilter"
            class="p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">Все пользователи</option>
            <option value="active">С подпиской</option>
            <option value="banned">Заблокированные</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Таблица пользователей -->
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <!-- Спиннер загрузки -->
      <div v-if="isLoading" class="flex justify-center items-center p-10">
        <svg class="animate-spin h-10 w-10 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none"
          viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
          </path>
        </svg>
      </div>

      <!-- Сообщение об ошибке -->
      <div v-else-if="error" class="p-6 text-center">
        <div class="text-red-500 mb-4">{{ error }}</div>
        <button @click="fetchUsers" class="btn">Повторить</button>
      </div>

      <!-- Пустой результат -->
      <div v-else-if="users.length === 0" class="p-10 text-center text-gray-500">
        Пользователи не найдены
      </div>

      <!-- Таблица с данными -->
      <div v-else>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID/Имя
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Статус
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Генерации
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Настройки
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Рефералы
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Дата регистрации
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="user in users" :key="user.id" :class="{ 'bg-red-50': user.isBanned }">
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex flex-col">
                    <div class="text-sm font-medium text-gray-900">
                      {{ user.telegramUsername || 'Нет имени' }}
                    </div>
                    <div class="text-sm text-gray-500">
                      ID: {{ user.telegramId || 'Нет ID' }}
                    </div>
                    <div class="text-sm text-gray-500">
                      {{ user.email }}
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex flex-col">
                    <span :class="[
                      'px-2 inline-flex text-xs leading-5 font-semibold rounded-full',
                      user.subscriptionActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    ]">
                      {{ user.subscriptionActive ? 'Активная подписка' : 'Без подписки' }}
                    </span>
                    <span v-if="user.isBanned"
                      class="mt-1 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                      Заблокирован
                    </span>
                    <div class="text-sm text-gray-500 mt-1">
                      Осталось генераций: {{ user.remainingGenerations }}
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-900">{{ user.generationCount || 0 }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div v-if="user.settings" class="text-sm text-gray-900">
                    <div>Разрешение: {{ user.settings.resolution }}</div>
                    <div>Пакет: {{ user.settings.batchSize }}</div>
                    <div>Негат. промпт: {{ user.settings.useNegativePrompt ? 'Да' : 'Нет' }}</div>
                    <div>Seed: {{ user.settings.useSeed ? 'Да' : 'Нет' }}</div>
                  </div>
                  <div v-else class="text-sm text-gray-500">
                    Нет настроек
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-900">{{ user.referralCount || 0 }}</div>
                  <div class="text-sm text-gray-500">{{ user.referralCode }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-900">{{ formatDate(user.createdAt) }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div class="flex gap-2 justify-end">
                    <button @click="openEditDialog(user.id)" class="text-blue-600 hover:text-blue-900"
                      title="Редактировать">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24"
                        stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>

                    <template v-if="!user.isBanned">
                      <button @click="handleBanUser(user.id)" class="text-red-600 hover:text-red-900"
                        title="Забанить с указанием причины">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24"
                          stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      </button>
                      <button @click="handleQuickBan(user.id)" class="text-red-400 hover:text-red-700"
                        title="Быстрый бан без указания причины">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24"
                          stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </button>
                    </template>

                    <button v-else @click="handleUnbanUser(user.id)" class="text-green-600 hover:text-green-900"
                      title="Разбанить">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24"
                        stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Пагинация -->
        <div class="p-4 flex items-center justify-between border-t border-gray-200">
          <div class="flex-1 flex justify-between sm:hidden">
            <button @click="handlePageChange(filterOptions.page - 1)" :disabled="filterOptions.page <= 1" :class="[
              'relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md',
              filterOptions.page <= 1
                ? 'bg-white text-gray-300 cursor-not-allowed'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            ]">
              Назад
            </button>
            <button @click="handlePageChange(filterOptions.page + 1)"
              :disabled="filterOptions.page * filterOptions.limit >= totalUsers" :class="[
                'ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md',
                filterOptions.page * filterOptions.limit >= totalUsers
                  ? 'bg-white text-gray-300 cursor-not-allowed'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              ]">
              Вперед
            </button>
          </div>
          <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p class="text-sm text-gray-700">
                Показано
                <span class="font-medium">{{ (filterOptions.page - 1) * filterOptions.limit + 1 }}</span>
                по
                <span class="font-medium">
                  {{ Math.min(filterOptions.page * filterOptions.limit, totalUsers) }}
                </span>
                из
                <span class="font-medium">{{ totalUsers }}</span>
                результатов
              </p>
            </div>
            <div>
              <div class="flex items-center">
                <select v-model="filterOptions.limit"
                  @change="handleSizeChange(Number(($event.target as HTMLSelectElement).value))"
                  class="mr-4 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="5">5 на странице</option>
                  <option value="10">10 на странице</option>
                  <option value="20">20 на странице</option>
                  <option value="50">50 на странице</option>
                </select>

                <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button @click="handlePageChange(filterOptions.page - 1)" :disabled="filterOptions.page <= 1" :class="[
                    'relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium',
                    filterOptions.page <= 1
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-gray-500 hover:bg-gray-50'
                  ]">
                    <span class="sr-only">Предыдущая</span>
                    <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                      aria-hidden="true">
                      <path fill-rule="evenodd"
                        d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                        clip-rule="evenodd" />
                    </svg>
                  </button>

                  <!-- Кнопки страниц -->
                  <template v-for="pageNum in Math.ceil(totalUsers / filterOptions.limit)">
                    <button
                      v-if="pageNum <= 3 || pageNum > Math.ceil(totalUsers / filterOptions.limit) - 3 || Math.abs(pageNum - filterOptions.page) <= 1"
                      :key="pageNum" @click="handlePageChange(pageNum)" :class="[
                        'relative inline-flex items-center px-4 py-2 border text-sm font-medium',
                        pageNum === filterOptions.page
                          ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                          : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                      ]">
                      {{ pageNum }}
                    </button>
                    <span
                      v-else-if="pageNum === 4 && filterOptions.page > 4 || pageNum === Math.ceil(totalUsers / filterOptions.limit) - 3 && filterOptions.page < Math.ceil(totalUsers / filterOptions.limit) - 3"
                      :key="'ellipsis-' + pageNum"
                      class="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                      ...
                    </span>
                  </template>

                  <button @click="handlePageChange(filterOptions.page + 1)"
                    :disabled="filterOptions.page * filterOptions.limit >= totalUsers" :class="[
                      'relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium',
                      filterOptions.page * filterOptions.limit >= totalUsers
                        ? 'text-gray-300 cursor-not-allowed'
                        : 'text-gray-500 hover:bg-gray-50'
                    ]">
                    <span class="sr-only">Следующая</span>
                    <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                      aria-hidden="true">
                      <path fill-rule="evenodd"
                        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                        clip-rule="evenodd" />
                    </svg>
                  </button>
                </nav>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Модальное окно редактирования пользователя -->
    <UserEditDialog v-if="editUserDialogVisible" :visible="editUserDialogVisible" :user-id="selectedUserId"
      @close="closeEditDialog" />
  </div>
</template>