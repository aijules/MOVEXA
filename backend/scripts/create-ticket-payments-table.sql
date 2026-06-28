-- ============================================================
-- MOVEXA — Real MoMo payments (UrubutoPay) lifecycle table
-- Run this ONCE in the Supabase SQL editor.
--
-- This is ADDITIVE. It does NOT touch the existing `tickets`
-- table. A real `tickets` row (status 'active') is only created
-- by the backend when a payment SUCCEEDS, so the existing mock
-- "Buy Now" flow and the tickets schema are left untouched.
-- ============================================================

CREATE TABLE IF NOT EXISTS ticket_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- our own merchant reference (sent to UrubutoPay as transaction_id)
  reference         TEXT UNIQUE NOT NULL,
  -- the reference UrubutoPay returns for the transaction
  urubuto_reference TEXT,

  -- what is being bought (mirrors the mock purchase inputs)
  fare_product_id   UUID,
  product_name      TEXT,
  amount            INTEGER NOT NULL CHECK (amount > 0),
  currency          TEXT DEFAULT 'RWF',

  -- payer + channel
  payer_phone       TEXT NOT NULL,
  payment_channel   TEXT DEFAULT 'MOMO',
  route_name        TEXT,
  source            TEXT NOT NULL DEFAULT 'app'
                    CHECK (source IN ('app','ussd')),

  -- lifecycle: pending -> success | failed | expired
  status            TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending','success','failed','expired')),

  -- the ticket created once payment succeeds (FK to existing tickets table)
  ticket_id         UUID REFERENCES tickets(id),

  -- raw provider payloads for auditing / debugging
  initiate_response JSONB,
  last_status_response JSONB,

  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_payments_status     ON ticket_payments (status);
CREATE INDEX IF NOT EXISTS idx_ticket_payments_reference  ON ticket_payments (reference);
CREATE INDEX IF NOT EXISTS idx_ticket_payments_created_at ON ticket_payments (created_at);

-- Backend uses the service-role key (bypasses RLS); keep consistent with the
-- rest of the MOVEXA schema which disables RLS on app tables.
ALTER TABLE ticket_payments DISABLE ROW LEVEL SECURITY;
