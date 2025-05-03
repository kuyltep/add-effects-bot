<template>
  <div class="generations-view">
    <h1 class="text-2xl font-bold mb-4">Generations</h1>

    <!-- Filters -->
    <div class="bg-white p-4 rounded-lg shadow mb-4">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Search</label>
          <input type="text" v-model="searchQuery" @input="handleSearchDebounced" placeholder="Search by prompt..."
            class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select v-model="filterOptions.status" @change="handleFilterChange"
            class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
          <select v-model="filterOptions.sortBy" @change="handleFilterChange"
            class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
            <option value="createdAt">Created Date</option>
            <option value="status">Status</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Sort Direction</label>
          <select v-model="filterOptions.sortDirection" @change="handleFilterChange"
            class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
            <option value="desc">Newest First</option>
            <option value="asc">Oldest First</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Generations Table -->
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              ID
            </th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              User
            </th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Prompt
            </th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Created At
            </th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Result
            </th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <template v-if="isLoading && generations.length === 0">
            <tr>
              <td colspan="7" class="px-6 py-4 text-center">
                <div class="flex justify-center">
                  <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
                </div>
              </td>
            </tr>
          </template>
          <template v-else-if="generations.length === 0">
            <tr>
              <td colspan="7" class="px-6 py-4 text-center text-gray-500">
                No generations found
              </td>
            </tr>
          </template>
          <template v-else>
            <tr v-for="generation in generations" :key="generation.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {{ generation.id.substring(0, 8) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <router-link :to="`/users/${generation.userId}`" class="text-indigo-600 hover:text-indigo-900">
                  {{ generation.username || generation.userId.substring(0, 8) }}
                </router-link>
              </td>
              <td class="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                {{ generation.prompt }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full" :class="{
                  'bg-yellow-100 text-yellow-800': generation.status === 'pending',
                  'bg-blue-100 text-blue-800': generation.status === 'processing',
                  'bg-green-100 text-green-800': generation.status === 'completed',
                  'bg-red-100 text-red-800': generation.status === 'failed'
                }">
                  {{ generation.status }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {{ new Date(generation.createdAt).toLocaleString() }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <a v-if="generation.resultUrl" :href="generation.resultUrl" target="_blank"
                  class="text-indigo-600 hover:text-indigo-900">
                  View Result
                </a>
                <span v-else-if="generation.error" class="text-red-500">
                  {{ generation.error }}
                </span>
                <span v-else>-</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <button @click="viewGenerationDetails(generation.id)" class="text-indigo-600 hover:text-indigo-900">
                  Details
                </button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div class="mt-4 flex justify-between items-center">
      <div class="text-sm text-gray-700">
        Showing <span class="font-medium">{{ startItem }}</span> to <span class="font-medium">{{ endItem }}</span> of
        <span class="font-medium">{{ totalGenerations }}</span> results
      </div>
      <div class="flex space-x-2">
        <button @click="prevPage" :disabled="filterOptions.page === 1"
          class="px-3 py-1 border rounded-md text-sm font-medium"
          :class="filterOptions.page === 1 ? 'text-gray-400 border-gray-200 cursor-not-allowed' : 'text-gray-700 border-gray-300 hover:bg-gray-50'">
          Previous
        </button>
        <button @click="nextPage" :disabled="filterOptions.page >= totalPages"
          class="px-3 py-1 border rounded-md text-sm font-medium"
          :class="filterOptions.page >= totalPages ? 'text-gray-400 border-gray-200 cursor-not-allowed' : 'text-gray-700 border-gray-300 hover:bg-gray-50'">
          Next
        </button>
      </div>
    </div>

    <!-- Generation Details Modal -->
    <div v-if="showDetailsModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-bold">Generation Details</h2>
            <button @click="showDetailsModal = false" class="text-gray-500 hover:text-gray-700">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <div v-if="selectedGeneration" class="space-y-4">
            <!-- Generation Info -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 class="text-sm font-medium text-gray-500">ID</h3>
                <p>{{ selectedGeneration.id }}</p>
              </div>
              <div>
                <h3 class="text-sm font-medium text-gray-500">User ID</h3>
                <p>
                  <router-link :to="`/users/${selectedGeneration.userId}`"
                    class="text-indigo-600 hover:text-indigo-900">
                    {{ selectedGeneration.userId }}
                  </router-link>
                </p>
              </div>
              <div>
                <h3 class="text-sm font-medium text-gray-500">Status</h3>
                <p>
                  <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full" :class="{
                    'bg-yellow-100 text-yellow-800': selectedGeneration.status === 'pending',
                    'bg-blue-100 text-blue-800': selectedGeneration.status === 'processing',
                    'bg-green-100 text-green-800': selectedGeneration.status === 'completed',
                    'bg-red-100 text-red-800': selectedGeneration.status === 'failed'
                  }">
                    {{ selectedGeneration.status }}
                  </span>
                </p>
              </div>
              <div>
                <h3 class="text-sm font-medium text-gray-500">Created At</h3>
                <p>{{ new Date(selectedGeneration.createdAt).toLocaleString() }}</p>
              </div>
              <div>
                <h3 class="text-sm font-medium text-gray-500">Updated At</h3>
                <p>{{ new Date(selectedGeneration.updatedAt).toLocaleString() }}</p>
              </div>
              <div class="col-span-2">
                <h3 class="text-sm font-medium text-gray-500">Prompt</h3>
                <p class="whitespace-pre-wrap">{{ selectedGeneration.prompt }}</p>
              </div>
            </div>

            <!-- Metadata -->
            <div v-if="selectedGeneration.metadata">
              <h3 class="text-sm font-medium text-gray-500 mb-2">Metadata</h3>
              <div class="bg-gray-50 p-3 rounded-md">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div v-if="selectedGeneration.metadata.model">
                    <span class="text-xs font-medium text-gray-500">Model</span>
                    <p class="text-sm">{{ selectedGeneration.metadata.model }}</p>
                  </div>
                  <div v-if="selectedGeneration.metadata.width">
                    <span class="text-xs font-medium text-gray-500">Width</span>
                    <p class="text-sm">{{ selectedGeneration.metadata.width }}</p>
                  </div>
                  <div v-if="selectedGeneration.metadata.height">
                    <span class="text-xs font-medium text-gray-500">Height</span>
                    <p class="text-sm">{{ selectedGeneration.metadata.height }}</p>
                  </div>
                  <div v-if="selectedGeneration.metadata.steps">
                    <span class="text-xs font-medium text-gray-500">Steps</span>
                    <p class="text-sm">{{ selectedGeneration.metadata.steps }}</p>
                  </div>
                  <div v-if="selectedGeneration.metadata.seed">
                    <span class="text-xs font-medium text-gray-500">Seed</span>
                    <p class="text-sm">{{ selectedGeneration.metadata.seed }}</p>
                  </div>
                </div>

                <!-- Additional Metadata -->
                <div class="mt-2" v-for="(value, key) in additionalMetadata" :key="key">
                  <span class="text-xs font-medium text-gray-500">{{ key }}</span>
                  <p class="text-sm">{{ value }}</p>
                </div>
              </div>
            </div>

            <!-- Error -->
            <div v-if="selectedGeneration.error" class="mt-4">
              <h3 class="text-sm font-medium text-gray-500">Error</h3>
              <p class="text-red-600 whitespace-pre-wrap">{{ selectedGeneration.error }}</p>
            </div>

            <!-- Result -->
            <div v-if="selectedGeneration.resultUrl" class="mt-4">
              <h3 class="text-sm font-medium text-gray-500 mb-2">Result</h3>
              <div class="border rounded-md overflow-hidden">
                <img :src="selectedGeneration.resultUrl" class="w-full h-auto" alt="Generation result" />
              </div>
              <div class="mt-2">
                <a :href="selectedGeneration.resultUrl" target="_blank"
                  class="text-indigo-600 hover:text-indigo-900 text-sm">
                  Open in new tab
                </a>
              </div>
            </div>
          </div>

          <div v-else-if="isLoadingDetails" class="flex justify-center py-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useGenerationsStore } from '../stores/generations';
import { useRoute, useRouter } from 'vue-router';
import { debounce } from 'lodash-es';

const generationsStore = useGenerationsStore();
const route = useRoute();
const router = useRouter();

const generations = computed(() => generationsStore.getGenerations);
const totalGenerations = computed(() => generationsStore.getTotalGenerations);
const totalPages = computed(() => generationsStore.totalPages);
const isLoading = computed(() => generationsStore.getIsLoading);
const error = computed(() => generationsStore.getError);
const filterOptions = ref({ ...generationsStore.getFilterOptions });

const selectedGeneration = ref(null);
const showDetailsModal = ref(false);
const isLoadingDetails = ref(false);
const searchQuery = ref('');

// Computed properties for pagination
const startItem = computed(() =>
  totalGenerations.value === 0 ? 0 : (filterOptions.value.page - 1) * filterOptions.value.limit + 1
);
const endItem = computed(() =>
  Math.min(startItem.value + filterOptions.value.limit - 1, totalGenerations.value)
);

// Computed property for additional metadata (excluding common fields)
const additionalMetadata = computed(() => {
  if (!selectedGeneration.value?.metadata) return {};

  const { width, height, steps, seed, model, ...rest } = selectedGeneration.value.metadata;
  return rest;
});

// Pagination methods
const nextPage = () => {
  if (filterOptions.value.page < totalPages.value) {
    updateFilters({ page: filterOptions.value.page + 1 });
  }
};

const prevPage = () => {
  if (filterOptions.value.page > 1) {
    updateFilters({ page: filterOptions.value.page - 1 });
  }
};

// Filter methods
const updateFilters = (newFilters) => {
  filterOptions.value = { ...filterOptions.value, ...newFilters };
  generationsStore.updateFilterOptions(filterOptions.value);
  fetchGenerations();

  // Update URL query params
  router.replace({
    query: {
      ...route.query,
      ...newFilters,
    }
  });
};

const handleFilterChange = () => {
  updateFilters({
    ...filterOptions.value,
    page: 1 // Reset to first page when filters change
  });
};

const handleSearchDebounced = debounce(() => {
  updateFilters({
    search: searchQuery.value,
    page: 1
  });
}, 500);

// Generation details
const viewGenerationDetails = async (id) => {
  try {
    isLoadingDetails.value = true;
    showDetailsModal.value = true;
    selectedGeneration.value = await generationsStore.getGenerationById(id);
  } catch (err) {
    console.error('Error loading generation details:', err);
  } finally {
    isLoadingDetails.value = false;
  }
};

// Fetch generations
const fetchGenerations = async () => {
  try {
    await generationsStore.fetchGenerations();
  } catch (err) {
    console.error('Error fetching generations:', err);
  }
};

// Initialize from URL query params
const initFromQueryParams = () => {
  const queryParams = route.query;
  const newFilters = {};

  if (queryParams.page) newFilters.page = Number(queryParams.page);
  if (queryParams.limit) newFilters.limit = Number(queryParams.limit);
  if (queryParams.status) newFilters.status = queryParams.status;
  if (queryParams.userId) newFilters.userId = queryParams.userId;
  if (queryParams.search) {
    newFilters.search = queryParams.search;
    searchQuery.value = queryParams.search;
  }
  if (queryParams.sortBy) newFilters.sortBy = queryParams.sortBy;
  if (queryParams.sortDirection) newFilters.sortDirection = queryParams.sortDirection;

  if (Object.keys(newFilters).length > 0) {
    filterOptions.value = { ...filterOptions.value, ...newFilters };
    generationsStore.updateFilterOptions(filterOptions.value);
  }
};

// Lifecycle hooks
onMounted(() => {
  initFromQueryParams();
  fetchGenerations();
});

// Watch for route changes
watch(
  () => route.query,
  () => {
    initFromQueryParams();
    fetchGenerations();
  },
  { deep: true }
);
</script>