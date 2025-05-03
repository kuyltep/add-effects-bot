import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { paymentsApi } from '../api';
import type { 
  PaymentListResponse, 
  PaymentFilterOptions, 
  Payment
} from '../types';

export const usePaymentsStore = defineStore('payments', () => {
  // Состояние
  const payments = ref<Payment[]>([]);
  const totalPayments = ref(0);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const filterOptions = ref<PaymentFilterOptions>({
    page: 1,
    limit: 10,
    search: '',
    sortBy: 'createdAt',
    sortDirection: 'desc',
    status: '',
  });

  // Геттеры
  const getPayments = computed(() => payments.value);
  const getTotalPayments = computed(() => totalPayments.value);
  const getIsLoading = computed(() => isLoading.value);
  const getError = computed(() => error.value);
  const getFilterOptions = computed(() => filterOptions.value);

  // Действия
  const fetchPayments = async () => {
    try {
      isLoading.value = true;
      error.value = null;
      
      const response: PaymentListResponse = await paymentsApi.getPayments(filterOptions.value);
      payments.value = response.payments;
      totalPayments.value = response.total;
    } catch (err) {
      console.error('Error fetching payments:', err);
      error.value = 'Ошибка при загрузке платежей';
    } finally {
      isLoading.value = false;
    }
  };

  const updateFilterOptions = (newOptions: Partial<PaymentFilterOptions>) => {
    filterOptions.value = { ...filterOptions.value, ...newOptions };
    // При изменении фильтров сбрасываем страницу на первую, если не задана явно
    if (newOptions.page === undefined) {
      filterOptions.value.page = 1;
    }
  };

  return {
    // Состояние
    payments,
    totalPayments,
    isLoading,
    error,
    filterOptions,
    
    // Геттеры
    getPayments,
    getTotalPayments,
    getIsLoading,
    getError,
    getFilterOptions,
    
    // Действия
    fetchPayments,
    updateFilterOptions,
  };
}); 