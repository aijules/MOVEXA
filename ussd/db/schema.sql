-- ============================================================================
-- MOVEXA USSD ecosystem — additive schema
-- ============================================================================
-- Run this ONCE in the Supabase SQL editor (or psql) to enable full session
-- tracking, request logging and USSD feedback.
--
-- IMPORTANT: This is PURELY ADDITIVE. It creates new tables only and does NOT
-- alter, drop or touch any existing MOVEXA table. The USSD services degrade
-- gracefully and keep working even before this script is applied (the live
-- USSD menu still works; session/log/feedback persistence and analytics simply
-- activate once these tables exist).
-- ============================================================================

-- 1. ussd_logs --------------------------------------------------------------
-- Per-interaction request log for the dedicated USSD module. This is a NEW,
-- independent table (the legacy `ussd_requests` table, if present, is left
-- completely untouched — we never read or write it).
CREATE TABLE IF NOT EXISTS public.ussd_logs (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    text,
    phone_number  text,
    service_code  text,
    text          text,
    response_type text CHECK (response_type IN ('CON', 'END')),
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ussd_logs_session ON public.ussd_logs (session_id);
CREATE INDEX IF NOT EXISTS idx_ussd_logs_created ON public.ussd_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ussd_logs_phone   ON public.ussd_logs (phone_number);

-- 2. ussd_sessions ----------------------------------------------------------
-- One row per USSD session, updated as the dialog progresses. session_id is
-- UNIQUE so the backend can upsert by it.
CREATE TABLE IF NOT EXISTS public.ussd_sessions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    text UNIQUE NOT NULL,
    phone_number  text,
    service_code  text,
    status        text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'completed', 'failed', 'timeout')),
    step_count    integer NOT NULL DEFAULT 0,
    started_at    timestamptz NOT NULL DEFAULT now(),
    last_activity timestamptz NOT NULL DEFAULT now(),
    ended_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ussd_sessions_status ON public.ussd_sessions (status);
CREATE INDEX IF NOT EXISTS idx_ussd_sessions_last   ON public.ussd_sessions (last_activity DESC);

-- 3. ussd_feedback ----------------------------------------------------------
-- Passenger feedback captured through the USSD channel / simulator.
CREATE TABLE IF NOT EXISTS public.ussd_feedback (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    text,
    phone_number  text,
    route_code    text,
    message       text NOT NULL,
    rating        integer CHECK (rating BETWEEN 1 AND 5),
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ussd_feedback_created ON public.ussd_feedback (created_at DESC);

-- 4. (Optional) ussd_analytics ---------------------------------------------
-- Optional pre-aggregated daily rollups. The dashboard computes analytics live
-- from the tables above, so this is only for long-term reporting if desired.
CREATE TABLE IF NOT EXISTS public.ussd_analytics (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    day             date NOT NULL,
    total_requests  integer NOT NULL DEFAULT 0,
    total_sessions  integer NOT NULL DEFAULT 0,
    failed_requests integer NOT NULL DEFAULT 0,
    peak_hour       integer,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (day)
);

-- ============================================================================
-- Done. The USSD backend (:6000) will now persist sessions, log every request
-- and store feedback. No existing MOVEXA table was modified.
-- ============================================================================
