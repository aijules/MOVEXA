import { createRouter, createWebHistory } from 'vue-router';
import { useAdminAuthStore } from '../stores/adminAuth.store.js';

const AdminLayout = () => import('../layouts/AdminLayout.vue');
const AdminAuthLayout = () => import('../layouts/AdminAuthLayout.vue');
const Login = () => import('../views/admin/AdminLoginView.vue');
const Overview = () => import('../views/admin/AdminOverviewView.vue');
const LiveMap = () => import('../views/admin/AdminLiveMapView.vue');
const Reports = () => import('../views/admin/AdminReportsView.vue');
const Settings = () => import('../views/admin/AdminSettingsView.vue');
const Table = () => import('../views/admin/AdminTableView.vue');
const Incidents = () => import('../views/admin/AdminIncidentsView.vue');
const Buses = () => import('../views/admin/AdminBusesView.vue');
const Ussd = () => import('../views/admin/AdminUssdView.vue');
const Stops = () => import('../views/admin/AdminStopsView.vue');
const AccessDenied = () => import('../views/admin/AccessDeniedView.vue');
const Payments = () => import('../views/admin/AdminPaymentsView.vue');
const VerifyTicket = () => import('../views/admin/AdminVerifyTicketView.vue');

// Read-only resource pages share AdminTableView, configured by `resource`.
const tablePages = [
  ['routes', 'Routes', 'routes'],
  ['schedules', 'Schedules', 'schedules'],
  ['trips', 'Trips', 'trips'],
  ['eta', 'ETA Monitoring', 'eta'],
  ['adaptive', 'Adaptive Scheduling', 'adaptive'],
  ['feedback', 'Passenger Feedback', 'feedback'],
];

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/admin' },
    { path: '/admin/login', component: AdminAuthLayout, children: [{ path: '', component: Login }] },
    {
      path: '/admin',
      component: AdminLayout,
      meta: { requiresAuth: true },
      children: [
        { path: '', name: 'Overview', component: Overview, meta: { permission: 'overview' } },
        { path: 'live-map', name: 'Live Monitoring', component: LiveMap, meta: { permission: 'live-map', fullWidth: true } },
        { path: 'incidents', name: 'Incidents', component: Incidents, meta: { permission: 'incidents' } },
        { path: 'buses', name: 'Buses', component: Buses, meta: { permission: 'buses' } },
        { path: 'stops', name: 'Stops', component: Stops, meta: { permission: 'stops' } },
        { path: 'ussd', name: 'USSD Service', component: Ussd, meta: { permission: 'ussd' } },
        { path: 'payments', name: 'MoMo Payments', component: Payments, meta: { permission: 'payments' } },
        { path: 'verify-ticket', name: 'Verify Ticket', component: VerifyTicket, meta: { permission: 'verify' } },
        { path: 'reports', name: 'Reports', component: Reports, meta: { permission: 'reports' } },
        { path: 'settings', name: 'Settings', component: Settings, meta: { permission: 'settings' } },
        { path: 'access-denied', component: AccessDenied },
        ...tablePages.map(([routePath, title, resource]) => ({
          path: routePath, name: title, component: Table,
          props: { resource, title }, meta: { permission: resource },
        })),
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAdminAuthStore();
  if (to.path === '/admin/login') return auth.isAuthenticated ? '/admin' : true;
  if (!auth.isAuthenticated) return '/admin/login';
  if (!auth.user) await auth.loadMe();
  if (!auth.user) return '/admin/login';            // token invalid / expired
  const perm = to.meta.permission;
  if (perm && !auth.hasPermission(perm)) return '/admin/access-denied';
  return true;
});

export default router;
