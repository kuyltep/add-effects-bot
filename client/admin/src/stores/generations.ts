import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api';
import type { Generation } from '../types';

interface FilterOptions {
  page: number;
  limit: number;
  status?: string;
  userId?: string;
  search?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export const useGenerationsStore = defineStore('generations', () => {
  // State
  const generations = ref<Generation[]>([]);
  const totalGenerations = ref<number>(0);
  const totalPages = ref<number>(0);
  const isLoading = ref<boolean>(false);
  const error = ref<string | null>(null);
  const filterOptions = ref<FilterOptions>({
    page: 1,
    limit: 10,
    sortBy: 'createdAt',
    sortDirection: 'desc',
  });

  // Getters
  const getGenerations = computed(() => generations.value);
  const getTotalGenerations = computed(() => totalGenerations.value);
  const getIsLoading = computed(() => isLoading.value);
  const getError = computed(() => error.value);
  const getFilterOptions = computed(() => filterOptions.value);

  // Actions
  const fetchGenerations = async () => {
    try {
      isLoading.value = true;
      error.value = null;
      
      const endpoint = filterOptions.value.userId 
        ? `/admin/users/${filterOptions.value.userId}/generations` 
        : '/admin/generations';
      
      const response = await api.get(endpoint, {
        params: {
          page: filterOptions.value.page,
          limit: filterOptions.value.limit,
          status: filterOptions.value.status,
          search: filterOptions.value.search,
          sortBy: filterOptions.value.sortBy,
          sortDirection: filterOptions.value.sortDirection,
        },
      });
      
      generations.value = response.data.generations;
      totalGenerations.value = response.data.pagination.totalCount;
      totalPages.value = response.data.pagination.totalPages;
      
      return {
        generations: generations.value,
        totalGenerations: totalGenerations.value,
        totalPages: totalPages.value
      };
    } catch (err: any) {
      error.value = err.response?.data?.message || 'Error loading generations';
      console.error('Error fetching generations:', err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  };
  
  // Get generation by ID
  const getGenerationById = async (id: string): Promise<Generation | null> => {
    try {
      isLoading.value = true;
      error.value = null;
      
      const response = await api.get(`/admin/generations/${id}`);
      return response.data.generation;
    } catch (err: any) {
      error.value = err.response?.data?.message || 'Error loading generation';
      console.error('Error fetching generation:', err);
      return null;
    } finally {
      isLoading.value = false;
    }
  };
  
  // Update filter options
  const updateFilterOptions = (options: Partial<FilterOptions>) => {
    filterOptions.value = { ...filterOptions.value, ...options };
  };

  return {
    // State
    generations,
    totalGenerations,
    totalPages,
    isLoading,
    error,
    filterOptions,
    
    // Getters
    getGenerations,
    getTotalGenerations,
    getIsLoading,
    getError,
    getFilterOptions,
    
    // Actions
    fetchGenerations,
    getGenerationById,
    updateFilterOptions,
  };
}); 