<template>
  <div class="user-detail-container">
    <el-card class="user-info">
      <template #header>
        <div class="card-header">
          <h3>User Information</h3>
          <div class="actions">
            <el-button type="primary" size="small" @click="showGenerationDialog">
              Manage Credits
            </el-button>
            <el-button :type="user?.isBanned ? 'success' : 'danger'" size="small" @click="toggleBanStatus">
              {{ user?.isBanned ? 'Unban User' : 'Ban User' }}
            </el-button>
          </div>
        </div>
      </template>

      <div v-if="loading">Loading user data...</div>
      <div v-else-if="user" class="user-data">
        <el-descriptions border>
          <el-descriptions-item label="Email">{{ user.email }}</el-descriptions-item>
          <el-descriptions-item label="Telegram ID">{{ user.telegramId || 'Not linked' }}</el-descriptions-item>
          <el-descriptions-item label="Telegram Username">{{ user.telegramUsername || 'Not linked'
          }}</el-descriptions-item>
          <el-descriptions-item label="Generation Credits">{{ user.remainingGenerations }}</el-descriptions-item>
          <el-descriptions-item label="Subscription">
            <el-tag :type="user.subscriptionActive ? 'success' : 'info'">
              {{ user.subscriptionActive ? 'Active' : 'Inactive' }}
            </el-tag>
            <div v-if="user.subscriptionActive && user.subscriptionEndDate">
              Expires: {{ formatDate(user.subscriptionEndDate) }}
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="Referral Code">{{ user.referralCode }}</el-descriptions-item>
          <el-descriptions-item label="Account Status">
            <el-tag :type="user.isBanned ? 'danger' : 'success'">
              {{ user.isBanned ? 'Banned' : 'Active' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item v-if="user.isBanned" label="Ban Reason">
            {{ user.banReason || 'No reason provided' }}
          </el-descriptions-item>
          <el-descriptions-item v-if="user.isBanned" label="Banned At">
            {{ formatDate(user.bannedAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="Created At">{{ formatDate(user.createdAt) }}</el-descriptions-item>
        </el-descriptions>
      </div>
    </el-card>

    <!-- User Settings Card -->
    <el-card class="user-settings" v-if="user?.settings">
      <template #header>
        <h3>User Settings</h3>
      </template>

      <el-descriptions border>
        <el-descriptions-item label="Model">{{ user.settings.model }}</el-descriptions-item>
        <el-descriptions-item label="Resolution">{{ user.settings.resolution }}</el-descriptions-item>
        <el-descriptions-item label="Batch Size">{{ user.settings.batchSize }}</el-descriptions-item>
        <el-descriptions-item label="Use Negative Prompt">
          <el-tag :type="user.settings.useNegativePrompt ? 'success' : 'info'">
            {{ user.settings.useNegativePrompt ? 'Yes' : 'No' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="Use Seed">
          <el-tag :type="user.settings.useSeed ? 'success' : 'info'">
            {{ user.settings.useSeed ? 'Yes' : 'No' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="Language">{{ user.settings.language || 'EN' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- Referrals Card -->
    <el-card class="referrals" v-if="user?.referrals?.length">
      <template #header>
        <h3>Referrals ({{ user.referrals.length }})</h3>
      </template>

      <el-table :data="user.referrals" style="width: 100%">
        <el-table-column prop="invitedUser.email" label="Email" show-overflow-tooltip />
        <el-table-column label="Created At" width="180">
          <template #default="scope">
            {{ formatDate(scope.row.createdAt) }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Payments Card -->
    <el-card class="payments" v-if="user?.payments?.length">
      <template #header>
        <h3>Payments ({{ user.payments.length }})</h3>
      </template>

      <el-table :data="user.payments" style="width: 100%">
        <el-table-column prop="amount" label="Amount" width="100" />
        <el-table-column prop="status" label="Status" width="120">
          <template #default="scope">
            <el-tag :type="scope.row.status === 'completed' ? 'success' : 'warning'">
              {{ scope.row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="subscriptionType" label="Type" show-overflow-tooltip />
        <el-table-column prop="generationsAdded" label="Generations" width="120" />
        <el-table-column label="Created At" width="180">
          <template #default="scope">
            {{ formatDate(scope.row.createdAt) }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card class="generation-history">
      <template #header>
        <h3>Generation History ({{ user?.recentGenerations?.length || 0 }})</h3>
      </template>

      <div v-if="loading">Loading history...</div>
      <div v-else-if="user?.recentGenerations?.length">
        <el-table :data="user.recentGenerations" style="width: 100%">
          <el-table-column prop="prompt" label="Prompt" show-overflow-tooltip />
          <el-table-column prop="model" label="Model" width="100" />
          <el-table-column prop="status" label="Status" width="120">
            <template #default="scope">
              <el-tag :type="getStatusTag(scope.row.status)">
                {{ scope.row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="Size" width="120">
            <template #default="scope">
              {{ scope.row.width }}x{{ scope.row.height }}
            </template>
          </el-table-column>
          <el-table-column label="Created" width="180">
            <template #default="scope">
              {{ formatDate(scope.row.createdAt) }}
            </template>
          </el-table-column>
          <el-table-column label="Images" width="100">
            <template #default="scope">
              <el-popover placement="right" trigger="click" width="400">
                <template #reference>
                  <el-button size="small" :disabled="!scope.row.imageUrls?.length">
                    View ({{ scope.row.imageUrls?.length || 0 }})
                  </el-button>
                </template>
                <div class="images-grid">
                  <img v-for="(url, idx) in scope.row.imageUrls" :key="idx" :src="url" class="generation-thumbnail"
                    alt="Generated image" />
                </div>
              </el-popover>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div v-else class="no-data">No generation history available</div>
    </el-card>

    <!-- Dialog for credits -->
    <el-dialog title="Manage Generation Credits" v-model="generationDialogVisible" width="30%">
      <p>Current credits: {{ user?.remainingGenerations }}</p>
      <el-form>
        <el-form-item label="Generation Credits">
          <el-input-number v-model="generationAmount" :min="0" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="updateGenerations">Update Credits</el-button>
        </el-form-item>
      </el-form>
    </el-dialog>

    <!-- Dialog for ban -->
    <el-dialog :title="user?.isBanned ? 'Unban User' : 'Ban User'" v-model="banDialogVisible" width="30%">
      <el-form v-if="!user?.isBanned">
        <el-form-item label="Ban Reason">
          <el-input v-model="banReason" type="textarea" />
        </el-form-item>
      </el-form>
      <span v-else>Are you sure you want to unban this user?</span>
      <template #footer>
        <el-button @click="banDialogVisible = false">Cancel</el-button>
        <el-button type="primary" @click="confirmBanAction">Confirm</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { usersApi } from '../api';
import type { User, Generation, Payment, Referral, UserSettings, UserDetailsResponse } from '../types';
import { ElMessage } from 'element-plus';

const route = useRoute();
const userId = route.params.id as string;
const user = ref<User & {
  referrals?: Referral[];
  payments?: Payment[];
  recentGenerations?: Generation[];
  settings?: UserSettings;
} | null>(null);
const loading = ref(true);
const generationDialogVisible = ref(false);
const generationAmount = ref(0);
const banDialogVisible = ref(false);
const banReason = ref('');

onMounted(async () => {
  await fetchUserData();
});

async function fetchUserData() {
  try {
    loading.value = true;
    const userData: UserDetailsResponse = await usersApi.getUserById(userId);
    user.value = userData.user;
    loading.value = false;
  } catch (error) {
    console.error('Failed to fetch user data:', error);
    ElMessage.error('Failed to load user data');
    loading.value = false;
  }
}

function formatDate(dateString?: string | Date) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleString();
}

function getStatusTag(status: string) {
  const statusMap: Record<string, string> = {
    'COMPLETED': 'success',
    'PROCESSING': 'warning',
    'PENDING': 'info',
    'FAILED': 'danger'
  };
  return statusMap[status] || 'info';
}

function showGenerationDialog() {
  if (!user.value) return;
  generationAmount.value = user.value.remainingGenerations;
  generationDialogVisible.value = true;
}

async function updateGenerations() {
  if (!user.value) return;

  try {
    const updatedUser = await usersApi.updateGenerations(
      user.value.id,
      generationAmount.value
    );

    // Update the user data
    if (user.value) {
      user.value.remainingGenerations = updatedUser.remainingGenerations;
    }

    generationDialogVisible.value = false;
    ElMessage.success('Generation credits updated successfully');
  } catch (error) {
    console.error('Failed to update generations:', error);
    ElMessage.error('Failed to update generation credits');
  }
}

function toggleBanStatus() {
  if (!user.value) return;
  banReason.value = '';
  banDialogVisible.value = true;
}

async function confirmBanAction() {
  if (!user.value) return;

  try {
    if (user.value.isBanned) {
      await usersApi.unbanUser(user.value.id);
      if (user.value) {
        user.value.isBanned = false;
        user.value.banReason = undefined;
        user.value.bannedAt = undefined;
      }
      ElMessage.success('User has been unbanned');
    } else {
     await usersApi.banUser(user.value.id, banReason.value);
      if (user.value) {
        user.value.isBanned = true;
        user.value.banReason = banReason.value;
        user.value.bannedAt = new Date().toISOString();
      }
      ElMessage.success('User has been banned');
    }

    banDialogVisible.value = false;
  } catch (error) {
    console.error(`Failed to ${user.value.isBanned ? 'unban' : 'ban'} user:`, error);
    ElMessage.error(`Failed to ${user.value.isBanned ? 'unban' : 'ban'} user`);
  }
}
</script>

<style scoped>
.user-detail-container {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.actions {
  display: flex;
  gap: 10px;
}

.no-data {
  text-align: center;
  padding: 20px;
  color: #999;
}

.images-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.generation-thumbnail {
  width: 100%;
  height: auto;
  border-radius: 4px;
}
</style>
