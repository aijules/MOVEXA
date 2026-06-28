<template>
  <div class="page">
    <div class="screen-header">
      <button class="back-btn" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      </button>
      <h2>Profile</h2>
    </div>

    <div class="profile-hero">
      <div class="avatar-circle">
        <svg viewBox="0 0 40 40" fill="none"><circle cx="20" cy="16" r="8" fill="white" fill-opacity="0.85"/><path d="M4 36c0-9 7-14 16-14s16 5 16 14" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>
      </div>
      <h3>{{ userName }}</h3>
      <p class="hero-sub">Kigali, Rwanda · {{ isGuest ? 'Guest session' : 'Member' }}</p>
      <div class="hero-stats">
        <div class="hs-item"><span class="hs-num">{{ stats.trips }}</span><span class="hs-label">Trips</span></div>
        <div class="hs-divider"></div>
        <div class="hs-item"><span class="hs-num">{{ stats.saved }}</span><span class="hs-label">Saved</span></div>
        <div class="hs-divider"></div>
        <div class="hs-item"><span class="hs-num">{{ stats.tickets }}</span><span class="hs-label">Tickets</span></div>
      </div>
    </div>

    <div class="profile-body">
      <button v-if="isGuest" class="btn btn-primary btn-full login-cta" @click="mockLogin">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="18" height="18"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
        Sign in to sync your trips
      </button>

      <div class="settings-list card">
        <div class="settings-item" v-for="item in settingsItems" :key="item.label">
          <span class="si-icon">{{ item.icon }}</span>
          <div class="si-info">
            <p class="si-label">{{ item.label }}</p>
            <p class="si-val text-muted" v-if="item.value">{{ item.value }}</p>
          </div>
          <svg class="si-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>

      <div class="feedback-section">
        <p class="section-title">Send Feedback</p>
        <div class="card" style="padding:16px">
          <textarea
            v-model="feedbackMsg"
            class="input-field"
            rows="3"
            placeholder="Tell us how to improve MoveXa..."
            style="resize:none"
          ></textarea>
          <button class="btn btn-primary btn-full" style="margin-top:10px" @click="submitFeedback" :disabled="sending">
            {{ sending ? 'Sending...' : 'Submit Feedback' }}
          </button>
          <p v-if="feedbackSent" class="text-center" style="color:var(--color-accent-green);margin-top:8px;font-weight:600">
            ✓ Thank you for your feedback!
          </p>
        </div>
      </div>

      <button class="btn btn-ghost btn-full" style="color:var(--color-danger)" @click="resetOnboarding">
        Reset Onboarding
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { feedbackApi, savedJourneysApi, ticketsApi } from '../services/api';

const router = useRouter();
const feedbackMsg = ref('');
const sending = ref(false);
const feedbackSent = ref(false);

const isGuest  = ref(localStorage.getItem('movexa_user') === null);
const userName = computed(() => isGuest.value ? 'Guest User' : (localStorage.getItem('movexa_user') || 'MOVEXA User'));
const stats = ref({ trips: 0, saved: 0, tickets: 0 });

function mockLogin() {
  localStorage.setItem('movexa_user', 'MOVEXA User');
  isGuest.value = false;
}

onMounted(async () => {
  try {
    const [sv, tk] = await Promise.all([savedJourneysApi.getAll(), ticketsApi.getMyTickets()]);
    stats.value.saved   = (sv.data || []).length;
    stats.value.tickets = (tk.data || []).length;
    stats.value.trips   = (sv.data || []).length + (tk.data || []).length;
  } catch { /* silent */ }
});

const settingsItems = [
  { icon: '🌍', label: 'Language', value: 'English' },
  { icon: '🔔', label: 'Notifications', value: 'On' },
  { icon: '🗺️', label: 'Map Provider', value: 'OpenStreetMap' },
  { icon: '📦', label: 'Offline Storage', value: 'Enabled' },
  { icon: 'ℹ️', label: 'App Version', value: '1.0.0' },
];

async function submitFeedback() {
  if (!feedbackMsg.value.trim()) return;
  sending.value = true;
  try {
    await feedbackApi.submit({ type: 'general', message: feedbackMsg.value });
    feedbackSent.value = true;
    feedbackMsg.value = '';
    setTimeout(() => feedbackSent.value = false, 3000);
  } catch {}
  sending.value = false;
}

function resetOnboarding() {
  localStorage.removeItem('movexa_onboarded');
  router.push('/onboarding');
}
</script>

<style scoped>
.profile-hero {
  background: var(--grad-header);
  color: #fff;
  text-align: center;
  padding: 8px 20px 24px;
  margin-top: -1px;
}
.avatar-circle {
  width: 84px; height: 84px; border-radius: 50%;
  background: rgba(255,255,255,0.18);
  border: 2px solid rgba(255,255,255,0.35);
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.18);
}
.avatar-circle svg { width: 50px; height: 50px; }
.profile-hero h3 { font-size: 22px; color: #fff; margin-bottom: 2px; }
.hero-sub { font-size: 13px; color: rgba(255,255,255,0.8); }
.hero-stats {
  display: flex; align-items: center; justify-content: center; gap: 0;
  margin-top: 18px; background: rgba(255,255,255,0.14);
  border-radius: 16px; padding: 12px 8px; backdrop-filter: blur(6px);
}
.hs-item { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.hs-num { font-size: 22px; font-weight: 800; font-family: var(--font-heading); }
.hs-label { font-size: 11px; color: rgba(255,255,255,0.78); }
.hs-divider { width: 1px; height: 28px; background: rgba(255,255,255,0.22); }

.profile-body { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
.login-cta { gap: 8px; }

.settings-list { padding: 8px; }
.settings-item { display: flex; align-items: center; gap: 12px; padding: 12px 8px; border-bottom: 1px solid var(--color-border); cursor: pointer; }
.settings-item:last-child { border-bottom: none; }
.si-icon { font-size: 20px; }
.si-info { flex: 1; }
.si-label { font-weight: 600; font-size: 14px; }
.si-val { font-size: 12px; margin-top: 2px; }
.si-arrow { width: 16px; height: 16px; color: var(--color-muted); }

.feedback-section { display: flex; flex-direction: column; gap: 8px; }
</style>
