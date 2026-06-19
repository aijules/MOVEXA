ALTER TABLE public.ticket_payments
  ADD COLUMN IF NOT EXISTS route_name TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'app'
    CHECK (source IN ('app', 'ussd'));

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS ticket_reference TEXT,
  ADD COLUMN IF NOT EXISTS route_name TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'paid'
    CHECK (payment_status IN ('paid', 'pending', 'failed')),
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'app'
    CHECK (source IN ('app', 'ussd')),
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validated_by TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_ticket_reference
  ON public.tickets (ticket_reference)
  WHERE ticket_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_qr_payload
  ON public.tickets (qr_payload);
CREATE INDEX IF NOT EXISTS idx_ticket_payments_source
  ON public.ticket_payments (source);
