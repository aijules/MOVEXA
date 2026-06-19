<template>
  <div class="onboarding" :class="`phase-${phase}`">

    <!-- ── SPLASH ── -->
    <transition name="splash">
      <div v-if="phase === 'splash'" class="splash">
        <div class="splash-logo">
          <svg class="logo-mark" viewBox="0 0 44 44" fill="none">
            <path d="M9 33V14.5L22 26.5L35 14.5V33" stroke="white" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="9" cy="12" r="3.8" fill="white"/>
            <circle cx="35" cy="12" r="3.8" fill="white"/>
          </svg>
        </div>
        <h1 class="splash-brand">MOVEXA</h1>
        <p class="splash-tagline">Smart Transport · Kigali</p>
        <div class="splash-ring ring-1"></div>
        <div class="splash-ring ring-2"></div>
        <div class="splash-ring ring-3"></div>
      </div>
    </transition>

    <!-- ── SLIDES ── -->
    <transition name="slides-in">
      <div v-if="phase === 'slides'" class="slides-wrap">

        <!-- Hero gradient -->
        <div class="slides-hero" :style="{ background: slides[current].gradient }">
          <!-- Brand mark -->
          <div class="brand-mark">
            <span class="brand-logo">
              <svg viewBox="0 0 44 44" fill="none" aria-label="MOVEXA">
                <path d="M9 33V14.5L22 26.5L35 14.5V33" stroke="white" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="9" cy="12" r="3.6" fill="white"/>
                <circle cx="35" cy="12" r="3.6" fill="white"/>
              </svg>
            </span>
            <span class="brand-name">MOVEXA</span>
          </div>
          <div class="hero-icon-wrap">
            <span v-html="slides[current].icon" class="hero-icon"></span>
          </div>
        </div>

        <!-- Card with slide content -->
        <div class="slides-card">
          <!-- Dots -->
          <div class="dots">
            <span
              v-for="(_, i) in slides" :key="i"
              class="dot" :class="{ active: i === current }"
              @click="current = i"
            ></span>
          </div>

          <!-- Slide text -->
          <transition name="slide-text" mode="out-in">
            <div :key="current" class="slide-text">
              <h2 class="slide-title">{{ slides[current].title }}</h2>
              <p class="slide-desc">{{ slides[current].desc }}</p>
            </div>
          </transition>

          <!-- Actions -->
          <div class="slide-actions">
            <button v-if="current < slides.length - 1" class="btn btn-primary btn-full" @click="current++">
              Continue
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
            <button v-else class="btn btn-primary btn-full" @click="finish">
              Get Started
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
            <button class="btn-guest" @click="finish">Continue as Guest →</button>
          </div>
        </div>

      </div>
    </transition>

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router  = useRouter();
const phase   = ref('splash');
const current = ref(0);

const slides = [
  {
    title:    'Find Your Route',
    desc:     'Search between any two stops in Kigali. Get departure times and real journey options instantly.',
    gradient: 'linear-gradient(160deg, #0EA5A3 0%, #0d8c8a 60%, #059487 100%)',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="6" cy="19" r="2.4"/>
      <circle cx="18" cy="5" r="2.4"/>
      <path d="M9 19h7.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H15"/>
    </svg>`,
  },
  {
    title:    'Track Buses Live',
    desc:     'Watch buses move in real-time on the map. Know exactly when your bus arrives at your stop.',
    gradient: 'linear-gradient(160deg, #2563EB 0%, #1d4ed8 60%, #1e40af 100%)',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <rect x="4" y="3" width="16" height="14" rx="2.5"/>
      <path d="M4 11h16"/>
      <path d="M8 3v8M16 3v8"/>
      <circle cx="8" cy="20" r="1.4"/>
      <circle cx="16" cy="20" r="1.4"/>
    </svg>`,
  },
  {
    title:    'Live ETA Countdown',
    desc:     'Countdown updates every second. See if your bus is on time or delayed — before you even step outside.',
    gradient: 'linear-gradient(160deg, #7C3AED 0%, #6d28d9 60%, #5b21b6 100%)',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="13" r="8"/>
      <path d="M12 9.5V13l2.5 2"/>
      <path d="M9 2h6"/>
      <path d="M19 5l1.5 1.5"/>
    </svg>`,
  },
  {
    title:    'Save & Go Offline',
    desc:     'Save your favourite routes and journeys. Access timetable data even without internet.',
    gradient: 'linear-gradient(160deg, #059669 0%, #047857 60%, #065f46 100%)',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
      <path d="M9 9.5l2 2 4-4"/>
    </svg>`,
  },
];

function finish() {
  localStorage.setItem('movexa_onboarded', '1');
  router.push('/');
}

onMounted(() => {
  // Show splash for 1.8s then transition to slides
  setTimeout(() => { phase.value = 'slides'; }, 1800);
});
</script>

<style scoped>
.onboarding {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  background: #0EA5A3;
}

/* ── Splash ── */
.splash {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  background: linear-gradient(160deg, #0EA5A3, #0a7a78);
  z-index: 10;
}

.splash-logo {
  width: 88px; height: 88px; border-radius: 28px;
  background: rgba(255,255,255,0.18);
  backdrop-filter: blur(10px);
  border: 2px solid rgba(255,255,255,0.3);
  display: flex; align-items: center; justify-content: center;
  animation: logoIn 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.3s both;
  box-shadow: 0 12px 40px rgba(0,0,0,0.2);
  margin-bottom: 20px;
}
.logo-mark {
  width: 52px; height: 52px;
  animation: logoIn 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.5s both;
  filter: drop-shadow(0 4px 10px rgba(0,0,0,0.22));
}
@keyframes logoIn { from { opacity:0; transform:scale(0.6) translateY(20px); } to { opacity:1; transform:none; } }

.splash-brand {
  font-size: 38px; font-weight: 900; color: #fff;
  letter-spacing: 0.12em; font-family: var(--font-heading);
  animation: fadeUp 0.5s ease 0.7s both;
}
.splash-tagline {
  font-size: 14px; color: rgba(255,255,255,0.72); font-weight: 500;
  letter-spacing: 0.06em; margin-top: 6px;
  animation: fadeUp 0.5s ease 0.9s both;
}
@keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }

.splash-ring {
  position: absolute; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.12); pointer-events: none;
  animation: ringExpand 2s ease-out infinite;
}
.ring-1 { width:160px; height:160px; animation-delay:0s; }
.ring-2 { width:280px; height:280px; animation-delay:0.5s; }
.ring-3 { width:400px; height:400px; animation-delay:1s; }
@keyframes ringExpand { 0%{transform:scale(0.8);opacity:0.6;} 100%{transform:scale(1.2);opacity:0;} }

/* splash transition */
.splash-enter-active { transition: opacity 0.4s ease; }
.splash-leave-active { transition: opacity 0.6s ease, transform 0.6s ease; }
.splash-enter-from   { opacity: 0; }
.splash-leave-to     { opacity: 0; transform: scale(1.06); }

/* ── Slides layout ── */
.slides-wrap {
  display: flex; flex-direction: column; min-height: 100dvh;
}

/* slides-in transition */
.slides-in-enter-active { transition: opacity 0.5s ease 0.2s; }
.slides-in-enter-from   { opacity: 0; }

.slides-hero {
  flex: 1.2;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.5s ease;
  min-height: 280px;
  position: relative; overflow: hidden;
}
.slides-hero::after {
  content: '';
  position: absolute; bottom: -1px; left: 0; right: 0; height: 40px;
  background: #fff; border-radius: 40px 40px 0 0;
}
.hero-icon-wrap {
  position: relative;
  display: flex; align-items: center; justify-content: center;
  width: 128px; height: 128px;
  background: rgba(255,255,255,0.16);
  border-radius: 38px;
  backdrop-filter: blur(8px);
  border: 1.5px solid rgba(255,255,255,0.35);
  box-shadow: 0 18px 50px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.4);
  animation: heroIconBounce 0.45s cubic-bezier(0.34,1.56,0.64,1), heroFloat 4s ease-in-out infinite 0.5s;
}
/* soft pulsing halo behind the icon */
.hero-icon-wrap::before {
  content: ''; position: absolute; inset: -22px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.18);
  animation: haloPulse 2.4s ease-out infinite;
}
.hero-icon-wrap::after {
  content: ''; position: absolute; inset: -42px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.10);
  animation: haloPulse 2.4s ease-out infinite 0.8s;
}
@keyframes heroIconBounce { from { transform:scale(0.7) translateY(20px); opacity:0; } to { transform:none; opacity:1; } }
@keyframes heroFloat { 0%,100%{ transform: translateY(0); } 50%{ transform: translateY(-8px); } }
@keyframes haloPulse { 0%{ transform:scale(0.85); opacity:0.7; } 100%{ transform:scale(1.15); opacity:0; } }

/* MOVEXA brand mark at top of every slide */
.brand-mark {
  position: absolute; top: 24px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px; z-index: 3;
}
.brand-logo {
  width: 34px; height: 34px; border-radius: 11px;
  background: linear-gradient(150deg, rgba(255,255,255,0.30), rgba(255,255,255,0.12));
  border: 1px solid rgba(255,255,255,0.45);
  backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 6px 16px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.5);
}
.brand-logo svg { width: 26px; height: 26px; }
.brand-name {
  color: #fff; font-family: var(--font-heading); font-weight: 700;
  font-size: 16px; letter-spacing: 0.26em; padding-left: 2px;
  text-shadow: 0 1px 6px rgba(0,0,0,0.18);
}

.hero-icon { display: flex; align-items: center; justify-content: center; }
.hero-icon :deep(svg) {
  width: 58px; height: 58px;
  filter: drop-shadow(0 4px 10px rgba(0,0,0,0.22));
}

/* ── Card ── */
.slides-card {
  background: #fff;
  border-radius: 0; padding: 28px 28px 40px;
  flex: 1;
}

.dots { display:flex; gap:8px; justify-content:center; margin-bottom:24px; }
.dot { width:8px; height:8px; border-radius:50%; background:var(--color-border); cursor:pointer; transition:all 0.2s; }
.dot.active { width:24px; border-radius:4px; background:var(--color-primary); }

/* slide text transition */
.slide-text-enter-active { transition: all 0.3s cubic-bezier(0.34,1.4,0.64,1); }
.slide-text-leave-active { transition: all 0.2s ease; }
.slide-text-enter-from   { opacity:0; transform:translateX(24px); }
.slide-text-leave-to     { opacity:0; transform:translateX(-16px); }

.slide-title { font-size: 26px; font-weight: 800; color: var(--color-text); margin-bottom: 12px; }
.slide-desc  { font-size: 15px; color: var(--color-muted); line-height: 1.6; max-width: 320px; }

.slide-actions { margin-top: 32px; display: flex; flex-direction: column; gap: 10px; }
.slide-actions .btn { gap: 10px; }

.btn-guest {
  display: block; text-align: center;
  font-size: 14px; font-weight: 600; color: var(--color-muted);
  padding: 8px; cursor: pointer; border: none; background: none;
  transition: color 0.15s;
}
.btn-guest:hover { color: var(--color-primary); }
</style>
