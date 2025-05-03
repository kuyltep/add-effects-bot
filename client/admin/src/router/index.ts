import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

// Определение маршрутов
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'admin',
    component: () => import('../views/AdminLayout.vue'),
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('../views/Dashboard.vue'),
      },
      {
        path: 'users',
        name: 'users',
        component: () => import('../views/Users.vue'),
      },
      {
        path: 'users/:id',
        name: 'user-details',
        component: () => import('../views/UserDetails.vue'),
        props: true,
      },
      {
        path: 'users/:id/edit',
        name: 'user-edit',
        component: () => import('../views/UserEdit.vue'),
        props: true,
      },
      {
        path: 'generations',
        name: 'generations',
        component: () => import('../views/Generations.vue'),
      },
      {
        path: 'payments',
        name: 'payments',
        component: () => import('../views/Payments.vue'),
      }
    ]
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/Login.vue')
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('../views/NotFound.vue')
  }
]

// Создание экземпляра роутера
const router = createRouter({
  history: createWebHistory('/admin'),
  
  routes
})

// Защита маршрутов (проверка авторизации)
router.beforeEach((to, _from, next) => {
  // Получаем токен из localStorage
  const isAuthenticated = !!localStorage.getItem('admin_token')
  
  // Если маршрут требует авторизации, а пользователь не авторизован, перенаправляем на страницу входа
  if (to.name !== 'login' && !isAuthenticated) {
    next({ name: 'login' })
  } else {
    next()
  }
})

export default router 