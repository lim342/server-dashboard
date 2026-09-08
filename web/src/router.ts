import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'overview', component: () => import('@/views/OverviewView.vue') },
    {
      path: '/host/:hostname',
      name: 'host',
      component: () => import('@/views/HostDetailView.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
