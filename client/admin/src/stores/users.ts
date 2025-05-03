import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api';
import type { User, UserWithStats } from '../types';

interface FilterOptions {
  page: number;
  limit: number;
  search?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export const useUsersStore = defineStore('users', () => {
  // State
  const users = ref<UserWithStats[]>([]);
  const totalUsers = ref<number>(0);
  const totalPages = ref<number>(0);
  const isLoading = ref<boolean>(false);
  const error = ref<string | null>(null);
  const selectedUser = ref<UserWithStats | null>(null);
  const filterOptions = ref<FilterOptions>({
    page: 1,
    limit: 10,
    sortBy: 'createdAt',
    sortDirection: 'desc',
  });

  // Getters
  const getUsers = computed(() => users.value);
  const getTotalUsers = computed(() => totalUsers.value);
  const getIsLoading = computed(() => isLoading.value);
  const getError = computed(() => error.value);
  const getFilterOptions = computed(() => filterOptions.value);
  const getSelectedUser = computed(() => selectedUser.value);

  // Actions
  const fetchUsers = async () => {
    try {
      isLoading.value = true;
      error.value = null;
      
      const response = await api.get('/admin/users', {
        params: {
          page: filterOptions.value.page,
          limit: filterOptions.value.limit,
          search: filterOptions.value.search,
          sortBy: filterOptions.value.sortBy,
          sortDirection: filterOptions.value.sortDirection,
        },
      });
      
      users.value = response.data.users;
      totalUsers.value = response.data.pagination.totalCount;
      totalPages.value = response.data.pagination.totalPages;
      
      return {
        users: users.value,
        totalUsers: totalUsers.value,
        totalPages: totalPages.value
      };
    } catch (err: any) {
      error.value = err.response?.data?.message || 'Error loading users';
      console.error('Error fetching users:', err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  };
  
  // Get user by ID
  const getUserById = async (id: string): Promise<UserWithStats | null> => {
    try {
      isLoading.value = true;
      error.value = null;
      
      const response = await api.get(`/admin/users/${id}`);
      selectedUser.value = response.data.user;
      return selectedUser.value;
    } catch (err: any) {
      error.value = err.response?.data?.message || 'Error loading user';
      console.error('Error fetching user:', err);
      return null;
    } finally {
      isLoading.value = false;
    }
  };
  
  // Update user
  const updateUser = async (id: string, userData: Partial<User>) => {
    try {
      isLoading.value = true;
      error.value = null;
      
      const response = await api.put(`/admin/users/${id}`, userData);
      
      // Update user in local array
      const index = users.value.findIndex(user => user.id === id);
      if (index !== -1) {
        users.value[index] = { ...users.value[index], ...response.data.user };
      }
      
      // Update selected user if it's the current selected user
      if (selectedUser.value && selectedUser.value.id === id) {
        selectedUser.value = { ...selectedUser.value, ...response.data.user };
      }
      
      return response.data.user;
    } catch (err: any) {
      error.value = err.response?.data?.message || 'Error updating user';
      console.error('Error updating user:', err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  };
  
  // Ban user
  const banUser = async (id: string, reason?: string) => {
    try {
      isLoading.value = true;
      error.value = null;
      
      const response = await api.post(`/admin/users/${id}/ban`, { reason });
      
      // Update user in local array
      const index = users.value.findIndex(user => user.id === id);
      if (index !== -1) {
        users.value[index] = { 
          ...users.value[index], 
          isBanned: true,
          banReason: reason || 'Banned by administrator',
          bannedAt: new Date().toISOString()
        };
      }
      
      // Update selected user if it's the current selected user
      if (selectedUser.value && selectedUser.value.id === id) {
        selectedUser.value = { 
          ...selectedUser.value, 
          isBanned: true,
          banReason: reason || 'Banned by administrator',
          bannedAt: new Date().toISOString()
        };
      }
      
      return response.data;
    } catch (err: any) {
      error.value = err.response?.data?.message || 'Error banning user';
      console.error('Error banning user:', err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  };
  
  // Unban user
  const unbanUser = async (id: string) => {
    try {
      isLoading.value = true;
      error.value = null;
      
      const response = await api.post(`/admin/users/${id}/unban`);
      
      // Update user in local array
      const index = users.value.findIndex(user => user.id === id);
      if (index !== -1) {
        users.value[index] = { 
          ...users.value[index], 
          isBanned: false,
          banReason: undefined,
          bannedAt: undefined 
        };
      }
      
      // Update selected user if it's the current selected user
      if (selectedUser.value && selectedUser.value.id === id) {
        selectedUser.value = { 
          ...selectedUser.value, 
          isBanned: false,
          banReason: undefined,
          bannedAt: undefined
        };
      }
      
      return response.data;
    } catch (err: any) {
      error.value = err.response?.data?.message || 'Error unbanning user';
      console.error('Error unbanning user:', err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  // Update generation count
  const updateGenerations = async (id: string, remainingGenerations: number) => {
    try {
      isLoading.value = true;
      error.value = null;
      
      const response = await api.put(`/admin/users/${id}`, { remainingGenerations });
      
      // Update user in local array
      const index = users.value.findIndex(user => user.id === id);
      if (index !== -1) {
        users.value[index] = { ...users.value[index], remainingGenerations };
      }
      
      // Update selected user if it's the current selected user
      if (selectedUser.value && selectedUser.value.id === id) {
        selectedUser.value = { ...selectedUser.value, remainingGenerations };
      }
      
      return response.data.user;
    } catch (err: any) {
      error.value = err.response?.data?.message || 'Error updating generation count';
      console.error('Error updating generation count:', err);
      throw err;
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
    users,
    totalUsers,
    totalPages,
    isLoading,
    error,
    filterOptions,
    selectedUser,
    
    // Getters
    getUsers,
    getTotalUsers,
    getIsLoading,
    getError,
    getFilterOptions,
    getSelectedUser,
    
    // Actions
    fetchUsers,
    getUserById,
    updateUser,
    banUser,
    unbanUser,
    updateGenerations,
    updateFilterOptions,
  };
}); 