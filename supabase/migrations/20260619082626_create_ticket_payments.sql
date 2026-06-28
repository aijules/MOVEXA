-- UrubutoPay/MoMo payment lifecycle. Existing tickets are untouched; a ticket
-- is linked only after UrubutoPay confirms the transaction.
CREATE TABLE IF NOT EXISTS public.ticket_payments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference            TEXT UNIQUE NOT NULL,
  urubuto_reference    TEXT,
  fare_product_id      UUID,
  product_name         TEXT,
  amount               INTEGER NOT NULL CHECK (amount > 0),
  currency             TEXT DEFAULT 'RWF',
  payer_phone          TEXT NOT NULL,
  payment_channel      TEXT DEFAULT 'MOMO',
  status               TEXT DEFAULT 'pending'
                       CHECK (status IN ('pending', 'success', 'failed', 'expired')),
  ticket_id            UUID REFERENCES public.tickets(id),
  initiate_response    JSONB,
  last_status_response JSONB,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_payments_status
  ON public.ticket_payments (status);
CREATE INDEX IF NOT EXISTS idx_ticket_payments_reference
  ON public.ticket_payments (reference);
CREATE INDEX IF NOT EXISTS idx_ticket_payments_created_at
  ON public.ticket_payments (created_at);

ALTER TABLE public.ticket_payments DISABLE ROW LEVEL SECURITY;

GRANT ALL PRIVILEGES ON TABLE public.ticket_payments TO service_role;
