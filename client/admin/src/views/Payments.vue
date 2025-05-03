<script setup lang="ts">
import { ref, onMounted, computed, watch, onBeforeUnmount } from 'vue';
import { usePaymentsStore } from '../stores/payments';
import type { Payment } from '../types';

// Router

// Store
const paymentsStore = usePaymentsStore();

// Component state from store
const payments = computed(() => paymentsStore.payments);
const isLoading = computed(() => paymentsStore.isLoading);
const error = computed(() => paymentsStore.error);
const totalPayments = computed(() => paymentsStore.totalPayments);
const filterOptions = computed(() => paymentsStore.filterOptions);
const refreshInterval = ref<number | null>(null);
const refreshRate = 30000; // 30 seconds refresh rate

// Filter state
const searchQuery = ref('');
const searchTimeout = ref<number | null>(null);
const statusFilter = ref('all');

// Fetch payments
const fetchPayments = async () => {
  // Set status filter if not "all"
  paymentsStore.updateFilterOptions({
    status: statusFilter.value !== 'all' ? statusFilter.value : undefined
  });

  await paymentsStore.fetchPayments();
};

// Handle search input
const handleSearchInput = () => {
  if (searchTimeout.value) {
    clearTimeout(searchTimeout.value);
  }

  searchTimeout.value = setTimeout(() => {
    paymentsStore.updateFilterOptions({
      search: searchQuery.value,
      page: 1
    });
    fetchPayments();
  }, 500) as unknown as number;
};

// Handle status filter change
watch(statusFilter, () => {
  paymentsStore.updateFilterOptions({ page: 1 });
  fetchPayments();
});

// Handle page change
const handlePageChange = (page: number) => {
  paymentsStore.updateFilterOptions({ page });
  fetchPayments();
};

// Handle size change
const handleSizeChange = (size: number) => {
  paymentsStore.updateFilterOptions({
    limit: size,
    page: 1
  });
  fetchPayments();
};

// Format date
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

// Format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0
  }).format(amount);
};

// Get status badge class
const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800';
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'failed':
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

// Get subscription type display text
const getSubscriptionTypeText = (payment: Payment) => {
  if (!payment.subscriptionType) return 'Нет';

  const days = payment.subscriptionDays || 0;
  const subscriptionMap: Record<string, string> = {
    'basic': 'Базовая',
    'premium': 'Премиум',
    'pro': 'Профессиональная'
  };

  const type = subscriptionMap[payment.subscriptionType] || payment.subscriptionType;
  return `${type} (${days} дней)`;
};

// Poll functions
const startPolling = () => {
  stopPolling();
  refreshInterval.value = setInterval(fetchPayments, refreshRate) as unknown as number;
};

const stopPolling = () => {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value);
    refreshInterval.value = null;
  }
};

// Initialize component
onMounted(async () => {
  // Initialize from store filter options
  searchQuery.value = filterOptions.value.search || '';
  statusFilter.value = filterOptions.value.status || 'all';

  await fetchPayments();
  startPolling();
});

// Cleanup on unmount
onBeforeUnmount(() => {
  stopPolling();
  if (searchTimeout.value) {
    clearTimeout(searchTimeout.value);
  }
});
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold text-gray-900 mb-6">Платежи</h1>

    <!-- Filters and search -->
    <div class="bg-white p-4 rounded-lg shadow mb-6">
      <div class="flex flex-col md:flex-row gap-4 mb-4">
        <div class="flex-1">
          <div class="relative">
            <input v-model="searchQuery" @input="handleSearchInput" type="text"
              placeholder="Поиск по ID пользователя, email или имени пользователя..."
              class="w-full p-2 pl-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400 absolute left-3 top-3" fill="none"
              viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
        <div>
          <select v-model="statusFilter"
            class="p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">Все платежи</option>
            <option value="completed">Завершенные</option>
            <option value="pending">В ожидании</option>
            <option value="failed">Неудачные</option>
            <option value="cancelled">Отмененные</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Payments table -->
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <!-- Loading spinner -->
      <div v-if="isLoading" class="flex justify-center items-center p-10">
        <svg class="animate-spin h-10 w-10 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none"
          viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
          </path>
        </svg>
      </div>

      <!-- Error message -->
      <div v-else-if="error" class="p-6 text-center">
        <div class="text-red-500 mb-4">{{ error }}</div>
        <button @click="fetchPayments" class="btn">Повторить</button>
      </div>

      <!-- Empty result -->
      <div v-else-if="payments.length === 0" class="p-10 text-center text-gray-500">
        Платежи не найдены
      </div>

      <!-- Table with data -->
      <div v-else>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID / Пользователь
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Сумма / Дата
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Статус
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Тип подписки
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Добавлено генераций
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID транзакции
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="payment in payments" :key="payment.id">
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex flex-col">
                    <div class="text-sm font-medium text-gray-900">
                      {{ payment.user?.telegramUsername || payment.user?.email || 'Нет имени' }}
                    </div>
                    <div class="text-sm text-gray-500">
                      ID: {{ payment.userId }}
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm font-medium text-gray-900">
                    {{ formatCurrency(payment.amount) }}
                  </div>
                  <div class="text-sm text-gray-500">
                    {{ formatDate(payment.createdAt) }}
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="[
                    'px-2 inline-flex text-xs leading-5 font-semibold rounded-full',
                    getStatusBadgeClass(payment.status)
                  ]">
                    {{ payment.status === 'completed' ? 'Завершен' :
                      payment.status === 'pending' ? 'В обработке' :
                        payment.status === 'failed' ? 'Ошибка' :
                          payment.status === 'cancelled' ? 'Отменен' : payment.status
                    }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-900">
                    {{ getSubscriptionTypeText(payment) }}
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-900">
                    {{ payment.generationsAdded || 0 }}
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-900">
                    {{ payment.transactionId || 'Нет ID' }}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
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
              :disabled="filterOptions.page * filterOptions.limit >= totalPayments" :class="[
                'ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md',
                filterOptions.page * filterOptions.limit >= totalPayments
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
                  {{ Math.min(filterOptions.page * filterOptions.limit, totalPayments) }}
                </span>
                из
                <span class="font-medium">{{ totalPayments }}</span>
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

                  <!-- Page buttons -->
                  <template v-for="pageNum in Math.max(1, Math.ceil(totalPayments / filterOptions.limit))">
                    <button
                      v-if="pageNum <= 3 || pageNum > Math.ceil(totalPayments / filterOptions.limit) - 3 || Math.abs(pageNum - filterOptions.page) <= 1"
                      :key="pageNum" @click="handlePageChange(pageNum)" :class="[
                        'relative inline-flex items-center px-4 py-2 border text-sm font-medium',
                        pageNum === filterOptions.page
                          ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                          : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                      ]">
                      {{ pageNum }}
                    </button>
                    <span
                      v-else-if="pageNum === 4 && filterOptions.page > 4 || pageNum === Math.ceil(totalPayments / filterOptions.limit) - 3 && filterOptions.page < Math.ceil(totalPayments / filterOptions.limit) - 3"
                      :key="'ellipsis-' + pageNum"
                      class="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                      ...
                    </span>
                  </template>

                  <button @click="handlePageChange(filterOptions.page + 1)"
                    :disabled="filterOptions.page * filterOptions.limit >= totalPayments" :class="[
                      'relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium',
                      filterOptions.page * filterOptions.limit >= totalPayments
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
  </div>
</template>