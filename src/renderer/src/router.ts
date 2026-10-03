import { createRouter, createWebHashHistory } from 'vue-router'
import { useSiteStore } from './stores/site'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'site', component: () => import('./views/SiteView.vue') },
    { path: '/posts', name: 'posts', component: () => import('./views/PostsView.vue'), meta: { needsSite: true } },
    { path: '/stats', name: 'stats', component: () => import('./views/StatsView.vue'), meta: { needsSite: true } },
    { path: '/editor', name: 'editor', component: () => import('./views/EditorView.vue'), meta: { needsSite: true } },
    { path: '/publish', name: 'publish', component: () => import('./views/PublishView.vue'), meta: { needsSite: true } },
    { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue'), meta: { needsSite: true } }
  ]
})

router.beforeEach((to) => {
  const site = useSiteStore()
  if (to.meta.needsSite && !site.site) return { path: '/' }
  return true
})
