<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUsersStore } from '../stores/users';
import UserEditDialog from '../components/UserEditDialog.vue';
import { ElMessage } from 'element-plus';

const router = useRouter();
const route = useRoute();
const usersStore = useUsersStore();

const isLoading = ref(true);
const userData = ref<any>(null);
const userId = route.params.id as string;

// Флаг для отображения диалога редактирования
const dialogVisible = ref(true);

// Загрузка данных пользователя
onMounted(async () => {
  try {
    isLoading.value = true;
    await usersStore.getUserById(userId);
    userData.value = usersStore.selectedUser;
  } catch (error) {
    ElMessage.error('Не удалось загрузить данные пользователя');
    router.push('/users');
  } finally {
    isLoading.value = false;
  }
});

// Закрытие диалога и переход назад
const handleClose = () => {
  router.push('/users');
};

// Обновление пользователя
const handleUpdate = () => {
  ElMessage.success('Пользователь успешно обновлен');
  router.push('/users');
};
</script>

<template>
  <div>
    <div v-if="isLoading" class="flex justify-center items-center p-10">
      <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>
    
    <UserEditDialog
      v-if="!isLoading && dialogVisible"
      :user-id="userId"
      :visible="dialogVisible"
      @close="handleClose"
      @update="handleUpdate"
    />
  </div>
</template> 