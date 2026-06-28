<template>
  <div class="page tickets">

    <!-- ── Payment Success Overlay ── -->
    <transition name="modal-fade">
      <div v-if="showSuccess" class="success-overlay" @click.self="showSuccess = false">
        <div class="success-modal">
          <div class="success-icon">✅</div>
          <h3>Payment Confirmed!</h3>
          <p class="success-sub">{{ purchasedTicket?.product_name || 'Ticket' }} · {{ purchasedTicket?.price?.toLocaleString() }} RWF</p>

          <!-- Real scannable QR, only after UrubutoPay confirms payment. -->
          <div v-if="purchasedTicket?.payment_status === 'paid'" class="qr-box">
            <div class="qr-svg-wrap">
              <QrcodeVue :value="purchasedTicket.qr_payload" :size="136" level="H" />
            </div>
            <p class="qr-id">{{ purchasedTicket.ticket_reference || purchasedTicket.id }}</p>
          </div>

          <div class="ticket-facts">
            <p><span>Ticket ID</span><b>{{ purchasedTicket?.ticket_reference || purchasedTicket?.id }}</b></p>
            <p><span>Route</span><b>{{ purchasedTicket?.route_name || purchasedTicket?.product_name }}</b></p>
            <p><span>Amount paid</span><b>{{ purchasedTicket?.price?.toLocaleString() }} RWF</b></p>
            <p><span>Payment</span><b class="paid-label">Paid</b></p>
            <p><span>Valid until</span><b>{{ fmtDate(purchasedTicket?.valid_until) }}</b></p>
          </div>

          <div class="qr-instruction">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg>
            Show this QR code to the supervisor to scan your payment
          </div>

          <div v-if="false" class="email-notice">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            Mock confirmation sent to your email
          </div>
          <div v-else class="email-notice">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M20 6L9 17l-5-5"/></svg>
            Payment confirmed by UrubutoPay
          </div>

          <div class="success-validity">
            <span>Valid: {{ fmtDate(purchasedTicket?.valid_from) }}</span>
            <span>→</span>
            <span>{{ fmtDate(purchasedTicket?.valid_until) }}</span>
          </div>

          <button class="btn btn-primary btn-full" @click="showSuccess = false">Done</button>
        </div>
      </div>
    </transition>

    <!-- ── MoMo Payment Modal ── -->
    <transition name="modal-fade">
      <div v-if="showMomo" class="success-overlay" @click.self="closeMomo">
        <div class="success-modal momo-modal">

          <!-- 1. Enter phone -->
          <template v-if="momo.status === 'idle' || momo.status === 'initiating'">
            <div class="momo-icon">📱</div>
            <h3>Pay with Mobile Money</h3>
            <p class="success-sub">{{ selectedProduct?.name }} · {{ selectedPrice }}</p>
            <label class="momo-label">MoMo phone number</label>
            <input
              v-model="momoPhone"
              type="tel"
              inputmode="numeric"
              class="momo-input"
              placeholder="07XX XXX XXX"
              :disabled="momo.status === 'initiating'"
              @keyup.enter="startMomo"
            />
            <p v-if="momoError" class="error-msg">{{ momoError }}</p>
            <button class="btn btn-momo btn-full" :disabled="momo.status === 'initiating'" @click="startMomo">
              <span v-if="momo.status === 'initiating'" class="spin"></span>
              {{ momo.status === 'initiating' ? 'Sending prompt…' : 'Confirm MoMo Payment' }}
            </button>
            <button class="btn-text" @click="closeMomo">Cancel</button>
          </template>

          <!-- 2. Waiting for approval -->
          <template v-else-if="momo.status === 'pending'">
            <div class="momo-spinner"></div>
            <h3>Approve on your phone</h3>
            <p class="success-sub">{{ momo.message }}</p>
            <div class="momo-amount">{{ selectedPrice }}</div>
            <p class="momo-hint">Enter your MoMo PIN on the prompt sent to <b>{{ momoPhone }}</b>. This window updates automatically.</p>
            <button class="btn-text" @click="closeMomo">Cancel / pay later</button>
          </template>

          <!-- 3. Failed -->
          <template v-else-if="momo.status === 'failed'">
            <div class="momo-icon">⚠️</div>
            <h3>Payment not completed</h3>
            <p class="success-sub">{{ momo.message }}</p>
            <button class="btn btn-momo btn-full" @click="momo.reset(); ">Try again</button>
            <button class="btn-text" @click="closeMomo">Close</button>
          </template>

        </div>
      </div>
    </transition>

    <!-- Header -->
    <div class="tickets-header">
      <h2>Tickets</h2>
      <p class="text-muted">Buy and manage your MOVEXA tickets</p>
    </div>

    <!-- Active ticket strip -->
    <transition name="fade">
      <div v-if="activeTicket && !showSuccess" class="active-strip card">
        <div class="as-left">
          <span class="as-dot"></span>
          <div>
            <p class="as-label">ACTIVE TICKET</p>
            <p class="as-name">{{ activeTicket.product_name }}</p>
          </div>
        </div>
        <div class="as-right">
          <p class="as-valid">Valid until</p>
          <p class="as-time">{{ fmtShortDate(activeTicket.valid_until) }}</p>
        </div>
        <button class="as-qr-btn" @click="viewTicket(activeTicket)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>
          Show QR
        </button>
      </div>
    </transition>

    <!-- Buy section -->
    <div class="buy-section">
      <p class="section-title">Buy a Ticket</p>

      <div v-if="ticketStore.loading" class="products-list">
        <div v-for="i in 4" :key="i" class="skeleton" style="height:110px;border-radius:16px;margin-bottom:10px"></div>
      </div>

      <div v-else class="products-list">
        <div
          v-for="p in displayProducts" :key="p.id"
          class="product-card card card-hover"
          :class="{ selected: selectedId === p.id, 'product-disabled': p.disabled }"
          @click="!p.disabled && (selectedId = p.id)"
        >
          <span v-if="p.badge" class="product-badge" :class="p.badge === 'Best Value' ? 'badge-green' : p.badge === 'Popular' ? 'badge-blue' : 'badge-purple'">{{ p.badge }}</span>
          <div class="product-top">
            <div class="product-info">
              <p class="product-name">{{ p.name }}</p>
              <p class="product-desc text-muted">{{ p.description }}</p>
            </div>
            <div class="product-price-col">
              <span class="product-price">{{ (p.price || 0).toLocaleString() }}</span>
              <span class="product-currency">RWF</span>
            </div>
          </div>
          <div class="product-validity">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="12" height="12"><circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/></svg>
            Valid {{ validityLabel(p.validity_minutes) }}
          </div>
          <div v-if="selectedId === p.id" class="product-check">✓</div>
        </div>
      </div>

      <div v-if="ticketStore.error" class="error-msg">{{ ticketStore.error }}</div>

      <!-- ── MoMo is the only passenger payment method ── -->
      <button
        class="btn btn-momo btn-full"
        :disabled="!selectedId || selectedPriceAmount < 1"
        @click="openMomo"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>
        Confirm MoMo Payment — {{ selectedPrice }}
      </button>
      <p class="payment-note">📲 Real payment via UrubutoPay · A prompt is sent to your phone</p>
    </div>

    <!-- History -->
    <div class="history-section" v-if="ticketStore.myTickets.length > 1">
      <p class="section-title">Ticket History</p>
      <div v-for="t in ticketStore.myTickets.slice(1, 5)" :key="t.id" class="history-row">
        <div class="hr-dot" :class="t.status"></div>
        <div class="hr-info">
          <span class="hr-name">{{ t.product_name }}</span>
          <span class="hr-date text-muted">{{ fmtDate(t.created_at) }}</span>
        </div>
        <span class="hr-price">{{ (t.price || 0).toLocaleString() }} RWF</span>
        <span class="hr-status" :class="t.status">{{ t.status || 'active' }}</span>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import QrcodeVue from 'qrcode.vue';
import { useTicketStore } from '../stores/ticketStore';
import { useJourneyStore } from '../stores/journeyStore';

const ticketStore  = useTicketStore();
const journeyStore = useJourneyStore();
const selectedId   = ref(null);
const showSuccess  = ref(false);
const purchasedTicket = ref(null);

// ── MoMo (real UrubutoPay) payment ──
const showMomo  = ref(false);
const momoPhone = ref('');
const momoError = ref('');
const momo = computed(() => ({
  status:  ticketStore.momoStatus,
  message: ticketStore.momoMessage,
  reset:   ticketStore.resetMomo,
}));

function openMomo() {
  if (!selectedId.value) return;
  ticketStore.resetMomo();
  momoPhone.value = '';
  momoError.value = '';
  showMomo.value = true;
}

function startMomo() {
  momoError.value = '';
  const digits = (momoPhone.value || '').replace(/\D/g, '');
  if (!/^(07\d{8}|2507\d{8}|7\d{8})$/.test(digits)) {
    momoError.value = 'Enter a valid Rwandan number, e.g. 0788 123 456.';
    return;
  }
  const product    = selectedProduct.value;
  const fareAmount = product?.price > 0 ? product.price : undefined;
  ticketStore.payWithMomo(selectedId.value, momoPhone.value, fareAmount, selectedRouteName.value, (ticket) => {
    // Payment succeeded → reuse the existing success modal + QR.
    showMomo.value = false;
    purchasedTicket.value = ticket;
    showSuccess.value = true;
    selectedId.value = null;
    ticketStore.resetMomo();
  });
}

function closeMomo() {
  showMomo.value = false;
  ticketStore.resetMomo();
}

// Journey fare from last selected journey
const journeyFare = computed(() => journeyStore.selectedJourney?.summary?.fareEstimate);

// Mirror of backend transportCalc.computePassPrices — same formula
function calcPassPrices(singleFare) {
  if (!singleFare) return { sevenDay: 0, oneMonth: 0 };
  const sevenDay = Math.max(3000,  Math.round((singleFare * 14 * 0.82) / 500) * 500);
  const oneMonth = Math.max(10000, Math.round((singleFare * 60 * 0.72) / 500) * 500);
  return { sevenDay, oneMonth };
}

// Build display products: all 3 with dynamic prices from journey distance
const displayProducts = computed(() => {
  const fare        = journeyFare.value?.amount || 0;
  const distKm      = journeyFare.value?.distanceKm;
  const passPrices  = calcPassPrices(fare);
  const hasJourney  = fare > 0;

  const stBase       = ticketStore.products.find(p => p.name === 'Single Trip');
  const sevenDayBase = ticketStore.products.find(p => p.name === '7-Day Unlimited');
  const oneMonthBase = ticketStore.products.find(p => p.name === '1-Month Unlimited');

  return [
    stBase ? {
      ...stBase,
      price:       fare,
      description: hasJourney
        ? `${journeyStore.originName || 'Journey'} → ${journeyStore.destinationName || 'Destination'} · ${distKm} km`
        : 'Plan a journey first to see your fare',
      disabled: !hasJourney,
    } : null,
    sevenDayBase ? {
      ...sevenDayBase,
      price:       hasJourney ? passPrices.sevenDay : sevenDayBase.price,
      description: hasJourney
        ? `14 rides/week on your ${distKm} km route · 18% off vs single trips`
        : 'Unlimited rides for 7 days',
      disabled: false,
    } : null,
    oneMonthBase ? {
      ...oneMonthBase,
      price:       hasJourney ? passPrices.oneMonth : oneMonthBase.price,
      description: hasJourney
        ? `60 rides/month on your ${distKm} km route · 28% off vs single trips`
        : 'Unlimited rides for 30 days',
      disabled: false,
    } : null,
  ].filter(Boolean);
});

const selectedProduct = computed(() => displayProducts.value.find(p => p.id === selectedId.value));
const selectedPriceAmount = computed(() => Number(selectedProduct.value?.price || 0));
const selectedPrice   = computed(() => selectedProduct.value ? `${(selectedProduct.value.price || 0).toLocaleString()} RWF` : '');
const selectedRouteName = computed(() => {
  const route = journeyStore.selectedJourney?.route_code || journeyStore.selectedJourney?.routeCode;
  return route || [journeyStore.originName, journeyStore.destinationName].filter(Boolean).join(' → ') || selectedProduct.value?.name;
});
const activeTicket = computed(() => ticketStore.myTickets.find(t =>
  t.payment_method === 'momo' && t.payment_status === 'paid' && t.status === 'active'
) || null);

// Keep the payment controls usable without making the passenger discover that
// a fare card must be clicked first. Prefer the first enabled, non-zero fare.
watch(displayProducts, (products) => {
  const current = products.find(p => p.id === selectedId.value && !p.disabled && Number(p.price) > 0);
  if (!current) selectedId.value = products.find(p => !p.disabled && Number(p.price) > 0)?.id || null;
}, { immediate: true });

function validityLabel(mins) {
  if (mins >= 43200) return '30 days';
  if (mins >= 10080) return '7 days';
  if (mins >= 1440)  return '24 hours';
  if (mins >= 60)    return `${mins} minutes`;
  return `${mins}min`;
}

function fmtDate(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleString('en-RW', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtShortDate(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleString('en-RW', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function viewTicket(ticket) {
  if (ticket?.payment_method !== 'momo' || ticket?.payment_status !== 'paid') return;
  purchasedTicket.value = ticket;
  showSuccess.value = true;
}

onMounted(() => {
  ticketStore.fetchProducts();
  if (!ticketStore.myTickets.length) ticketStore.fetchMyTickets?.();
});
</script>

<style scoped>
.tickets { background: var(--color-bg); }

.tickets-header { padding: 24px 20px 12px; }
h2 { font-size: 26px; }

/* ── Active strip ── */
.active-strip {
  display: flex; align-items: center; gap: 12px; margin: 0 16px 12px;
  padding: 14px; background: linear-gradient(135deg, #F0FDF4, #ECFDF5);
  border: 1px solid #A7F3D0;
}
.as-left { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.as-dot { width: 10px; height: 10px; border-radius: 50%; background: #16A34A; animation: pulse 1.5s ease infinite; flex-shrink: 0; }
@keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.3;} }
.as-label { font-size: 10px; font-weight: 800; color: #15803D; text-transform: uppercase; letter-spacing: 0.06em; }
.as-name  { font-size: 14px; font-weight: 700; color: var(--color-text); }
.as-right { text-align: right; flex-shrink: 0; }
.as-valid { font-size: 10px; color: var(--color-muted); }
.as-time  { font-size: 12px; font-weight: 700; }
.as-qr-btn { display: flex; align-items: center; gap: 5px; padding: 7px 12px; border-radius: var(--radius-md); background: white; border: 1.5px solid #A7F3D0; font-size: 12px; font-weight: 700; color: #15803D; flex-shrink: 0; }

/* ── Buy section ── */
.buy-section { padding: 0 16px; }
.products-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }

.product-card { padding: 16px; position: relative; cursor: pointer; border: 2px solid transparent; transition: border-color 0.18s, box-shadow 0.18s; }
.product-card.selected { border-color: var(--color-primary); background: #F0FDFC; }
.product-card.product-disabled { opacity: 0.5; cursor: not-allowed; }
.product-badge {
  position: absolute; top: -1px; right: 12px;
  padding: 3px 10px; border-radius: 0 0 8px 8px; font-size: 10px; font-weight: 800; letter-spacing: 0.04em;
}
.badge-green  { background: #DCFCE7; color: #15803D; }
.badge-blue   { background: #DBEAFE; color: #1D4ED8; }
.badge-purple { background: #EDE9FE; color: #6D28D9; }

.product-top { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
.product-info { flex: 1; min-width: 0; }
.product-name { font-weight: 700; font-size: 16px; margin-bottom: 2px; }
.product-desc { font-size: 12px; line-height: 1.4; }
.product-price-col { text-align: right; flex-shrink: 0; }
.product-price { font-size: 24px; font-weight: 900; font-family: var(--font-heading); }
.product-currency { font-size: 12px; color: var(--color-muted); display: block; text-align: right; }
.product-validity { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--color-muted); }
.product-check { position: absolute; top: 12px; left: 12px; width: 22px; height: 22px; border-radius: 50%; background: var(--color-primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; }

.error-msg { color: var(--color-danger); font-size: 13px; text-align: center; margin-bottom: 8px; }
.buy-btn { display: flex; align-items: center; justify-content: center; gap: 8px; }
.spin { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.payment-note { font-size: 12px; color: var(--color-muted); text-align: center; margin-top: 8px; margin-bottom: 20px; }

/* ── History ── */
.history-section { padding: 0 16px 20px; }
.history-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--color-border); }
.hr-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: var(--color-accent-green); }
.hr-dot.expired { background: var(--color-muted); }
.hr-info { flex: 1; min-width: 0; }
.hr-name { font-size: 13px; font-weight: 600; display: block; }
.hr-date { font-size: 11px; }
.hr-price { font-size: 13px; font-weight: 700; flex-shrink: 0; }
.hr-status { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 20px; flex-shrink: 0; background: #DCFCE7; color: #15803D; }
.hr-status.expired { background: var(--color-border); color: var(--color-muted); }

/* ── MoMo button + modal ── */
.btn-momo {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  background: linear-gradient(135deg, #F59E0B, #F97316); color: #fff; border: none;
}
.btn-momo:disabled { opacity: 0.5; }
.momo-divider {
  display: flex; align-items: center; gap: 10px;
  margin: 16px 0 12px; color: var(--color-muted); font-size: 12px;
}
.momo-divider::before, .momo-divider::after {
  content: ''; flex: 1; height: 1px; background: var(--color-border);
}
.momo-modal { text-align: center; }
.momo-icon { font-size: 44px; margin-bottom: 6px; }
.momo-label { display: block; text-align: left; font-size: 12px; font-weight: 700; color: var(--color-muted); margin: 14px 0 6px; }
.momo-input {
  width: 100%; padding: 14px 16px; font-size: 18px; letter-spacing: 0.04em;
  border: 2px solid var(--color-border); border-radius: 14px; margin-bottom: 12px;
  font-family: var(--font-heading);
}
.momo-input:focus { outline: none; border-color: #F97316; }
.momo-amount { font-size: 30px; font-weight: 900; font-family: var(--font-heading); margin: 8px 0; }
.momo-hint { font-size: 13px; color: var(--color-muted); margin-bottom: 16px; line-height: 1.5; }
.btn-text { background: none; border: none; color: var(--color-muted); font-size: 13px; font-weight: 600; margin-top: 12px; padding: 8px; width: 100%; }
.momo-spinner {
  width: 52px; height: 52px; margin: 6px auto 14px;
  border: 4px solid #FDE68A; border-top-color: #F97316; border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* ── Payment success overlay ── */
.success-overlay {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(0,0,0,0.55); backdrop-filter: blur(6px);
  display: flex; align-items: flex-end; justify-content: center;
}
.success-modal {
  background: white; border-radius: 28px 28px 0 0;
  width: 100%; max-width: 480px;
  padding: 28px 24px 40px;
  animation: modalUp 0.35s cubic-bezier(0.34,1.56,0.64,1);
}
@keyframes modalUp { from { transform: translateY(100%); } to { transform: none; } }

.modal-fade-enter-active { transition: opacity 0.2s ease; }
.modal-fade-leave-active { transition: opacity 0.2s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }

.success-icon { font-size: 48px; text-align: center; margin-bottom: 8px; }
.success-modal h3 { font-size: 24px; text-align: center; margin-bottom: 4px; }
.success-sub { text-align: center; color: var(--color-muted); font-size: 14px; margin-bottom: 20px; }

.qr-box { display: flex; flex-direction: column; align-items: center; margin-bottom: 16px; }
.qr-svg-wrap {
  width: 160px; height: 160px; padding: 12px;
  background: white; border-radius: 16px;
  border: 2px solid var(--color-border);
  box-shadow: 0 4px 24px rgba(0,0,0,0.1);
}
.qr-svg { width: 100%; height: 100%; }
.qr-id { font-size: 11px; color: var(--color-muted); font-family: monospace; margin-top: 8px; }
.ticket-facts { margin: 0 0 14px; border: 1px solid var(--color-border); border-radius: 12px; overflow: hidden; }
.ticket-facts p { display: flex; justify-content: space-between; gap: 12px; padding: 8px 11px; font-size: 12px; border-bottom: 1px solid var(--color-border); }
.ticket-facts p:last-child { border-bottom: 0; }
.ticket-facts span { color: var(--color-muted); }
.ticket-facts b { text-align: right; }
.paid-label { color: #15803D; }

.qr-instruction {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  background: linear-gradient(135deg, #EFF6FF, #DBEAFE);
  padding: 12px 16px; border-radius: 12px;
  font-size: 13px; font-weight: 600; color: #1D4ED8;
  text-align: center; margin-bottom: 10px;
}

.email-notice {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  font-size: 12px; color: var(--color-muted); margin-bottom: 12px;
}

.success-validity {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  font-size: 12px; color: var(--color-muted); margin-bottom: 20px;
  background: var(--color-bg); padding: 8px 16px; border-radius: 8px;
}
</style>
