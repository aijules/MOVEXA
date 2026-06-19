import { defineStore } from 'pinia';
import { ref } from 'vue';
import { ticketsApi, paymentsApi } from '../services/api';

export const useTicketStore = defineStore('tickets', () => {
  const products = ref([]);
  const myTickets = ref([]);
  const purchasing = ref(false);
  const loading = ref(false);
  const error = ref(null);
  const lastPurchased = ref(null);

  async function fetchProducts() {
    loading.value = true;
    try {
      const res = await ticketsApi.getProducts();
      products.value = res.data || [];
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function purchase(fareProductId, fareAmount) {
    purchasing.value = true;
    error.value = null;
    try {
      const res = await ticketsApi.purchase(fareProductId, 'mock', fareAmount);
      lastPurchased.value = res.data?.ticket;
      myTickets.value.unshift(res.data?.ticket);
      return res.data?.ticket;
    } catch (e) {
      error.value = e.message;
      return null;
    } finally {
      purchasing.value = false;
    }
  }

  // ── Real MoMo payment (UrubutoPay) ──
  const momoStatus = ref('idle');   // idle | initiating | pending | success | failed
  const momoMessage = ref('');
  const momoReference = ref(null);
  let pollHandle = null;

  function stopMomoPolling() {
    if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
  }

  // Start a MoMo payment: pushes the prompt, then polls until settled.
  // onSuccess(ticket) fires once the ticket is issued.
  async function payWithMomo(fareProductId, phone, fareAmount, routeName, onSuccess) {
    stopMomoPolling();
    error.value = null;
    momoStatus.value = 'initiating';
    momoMessage.value = '';
    momoReference.value = null;
    try {
      const res = await paymentsApi.initiate(fareProductId, phone, fareAmount, 'MOMO', routeName, 'app');
      momoReference.value = res.data?.reference;
      momoStatus.value = 'pending';
      momoMessage.value = 'Waiting for MoMo confirmation';

      // Poll every 3s for up to ~3 minutes.
      let elapsed = 0;
      pollHandle = setInterval(async () => {
        elapsed += 3;
        try {
          const s = await paymentsApi.status(momoReference.value);
          const st = s.data?.status;
          if (st === 'success') {
            stopMomoPolling();
            momoStatus.value = 'success';
            const ticket = s.data?.ticket;
            if (ticket) {
              lastPurchased.value = ticket;
              myTickets.value.unshift(ticket);
              onSuccess?.(ticket);
            }
          } else if (st === 'failed' || st === 'expired') {
            stopMomoPolling();
            momoStatus.value = 'failed';
            momoMessage.value = st === 'expired' ? 'Payment timed out. Please try again.' : 'Payment was declined or cancelled.';
          }
        } catch { /* transient — keep polling */ }
        if (elapsed >= 180 && momoStatus.value === 'pending') {
          stopMomoPolling();
          momoStatus.value = 'failed';
          momoMessage.value = 'Timed out waiting for confirmation. If you approved it, check Ticket History shortly.';
        }
      }, 3000);
    } catch (e) {
      momoStatus.value = 'failed';
      momoMessage.value = e.message || 'Could not start the payment.';
    }
  }

  function resetMomo() {
    stopMomoPolling();
    momoStatus.value = 'idle';
    momoMessage.value = '';
    momoReference.value = null;
  }

  async function fetchMyTickets() {
    try {
      const res = await ticketsApi.getMyTickets();
      myTickets.value = res.data || [];
      if (myTickets.value.length && !lastPurchased.value) lastPurchased.value = myTickets.value[0];
    } catch { /* silent */ }
  }

  return {
    products, myTickets, purchasing, loading, error, lastPurchased,
    fetchProducts, purchase, fetchMyTickets,
    momoStatus, momoMessage, momoReference, payWithMomo, resetMomo,
  };
});
