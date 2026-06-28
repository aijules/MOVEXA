import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'Home', component: () => import('../views/HomeView.vue') },
    { path: '/onboarding', name: 'Onboarding', component: () => import('../views/OnboardingView.vue') },
    { path: '/map', name: 'Map', component: () => import('../views/LiveMapView.vue') },
    { path: '/nearby', name: 'Nearby', component: () => import('../views/NearbyStopsView.vue') },
    { path: '/planner', name: 'Planner', component: () => import('../views/PlannerView.vue') },
    { path: '/results', name: 'Results', component: () => import('../views/JourneyResultsView.vue') },
    { path: '/journey/:id', name: 'JourneyDetail', component: () => import('../views/JourneyDetailView.vue') },
    { path: '/navigate/:id', name: 'Navigate', component: () => import('../views/NavigateView.vue') },
    { path: '/stops/:id', name: 'StopDetail', component: () => import('../views/StopDetailView.vue') },
    { path: '/lines/:id', name: 'LineDetail', component: () => import('../views/LineDetailView.vue') },
    { path: '/tickets', name: 'Tickets', component: () => import('../views/TicketsView.vue') },
    { path: '/saved', name: 'Saved', component: () => import('../views/SavedView.vue') },
    { path: '/alerts', name: 'Alerts', component: () => import('../views/AlertsView.vue') },
    { path: '/profile', name: 'Profile', component: () => import('../views/ProfileView.vue') },
    { path: '/admin', name: 'Admin', component: () => import('../views/AdminView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

const ONBOARDED_KEY = 'movexa_onboarded';
router.beforeEach((to) => {
  const onboarded = localStorage.getItem(ONBOARDED_KEY);
  if (!onboarded && to.name !== 'Onboarding') {
    return { name: 'Onboarding' };
  }
});

export default router;
