-- MOVEXA Supabase PostgreSQL Schema
-- Run this in your Supabase SQL editor BEFORE running seed scripts

-- ===========================
-- 1. USERS
-- ===========================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'passenger' CHECK (role IN ('passenger', 'driver', 'admin')),
  password_hash TEXT,
  is_active BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===========================
-- 2. PASSENGERS
-- ===========================
CREATE TABLE IF NOT EXISTS passengers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  preferred_language TEXT DEFAULT 'en',
  notifications_enabled BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ===========================
-- 3. DRIVERS
-- ===========================
CREATE TABLE IF NOT EXISTS drivers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  phone           TEXT,
  license_number  TEXT UNIQUE,
  assigned_bus_id UUID,
  status          TEXT DEFAULT 'available' CHECK (status IN ('available','on_trip','off_duty')),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ===========================
-- 4. ROUTES
-- ===========================
CREATE TABLE IF NOT EXISTS routes (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_code                  TEXT UNIQUE NOT NULL,
  route_name                  TEXT NOT NULL,
  origin_name                 TEXT,
  destination_name            TEXT,
  color                       TEXT DEFAULT '#0EA5A3',
  text_color                  TEXT DEFAULT '#FFFFFF',
  status                      TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
  total_distance_km           NUMERIC(8,2) DEFAULT 0,
  estimated_duration_minutes  INTEGER DEFAULT 0,
  created_at                  TIMESTAMPTZ DEFAULT now()
);

-- ===========================
-- 5. STOPS
-- ===========================
CREATE TABLE IF NOT EXISTS stops (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_code   TEXT UNIQUE NOT NULL,
  stop_name   TEXT NOT NULL,
  latitude    NUMERIC(10,7) NOT NULL,
  longitude   NUMERIC(10,7) NOT NULL,
  area        TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stops_name ON stops(stop_name);

-- ===========================
-- 6. ROUTE_STOPS
-- ===========================
CREATE TABLE IF NOT EXISTS route_stops (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id                    UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  stop_id                     UUID NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  stop_order                  INTEGER NOT NULL,
  distance_from_start_km      NUMERIC(8,2) DEFAULT 0,
  estimated_minutes_from_start INTEGER DEFAULT 0,
  UNIQUE(route_id, stop_order)
);

CREATE INDEX IF NOT EXISTS idx_route_stops_route ON route_stops(route_id);
CREATE INDEX IF NOT EXISTS idx_route_stops_stop  ON route_stops(stop_id);

-- ===========================
-- 7. ROUTE_PATHS
-- ===========================
CREATE TABLE IF NOT EXISTS route_paths (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id     UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  coordinates  JSONB NOT NULL DEFAULT '[]',
  path_order   INTEGER DEFAULT 1,
  distance_km  NUMERIC(8,2) DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_route_paths_route ON route_paths(route_id);

-- ===========================
-- 8. BUSES
-- ===========================
CREATE TABLE IF NOT EXISTS buses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number     TEXT UNIQUE NOT NULL,
  bus_code         TEXT UNIQUE NOT NULL,
  capacity         INTEGER DEFAULT 60,
  current_route_id UUID REFERENCES routes(id),
  status           TEXT DEFAULT 'active' CHECK (status IN ('active','maintenance','inactive')),
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Add FK from drivers.assigned_bus_id
ALTER TABLE drivers ADD CONSTRAINT fk_driver_bus
  FOREIGN KEY (assigned_bus_id) REFERENCES buses(id) ON DELETE SET NULL;

-- ===========================
-- 9. SCHEDULES
-- ===========================
CREATE TABLE IF NOT EXISTS schedules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id         UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  departure_time   TEXT NOT NULL,
  arrival_time     TEXT NOT NULL,
  service_days     TEXT[] DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedules_route ON schedules(route_id);

-- ===========================
-- 10. TRIPS
-- ===========================
CREATE TABLE IF NOT EXISTS trips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id        UUID NOT NULL REFERENCES routes(id),
  bus_id          UUID REFERENCES buses(id),
  driver_id       UUID REFERENCES drivers(id),
  schedule_id     UUID REFERENCES schedules(id),
  start_time      TEXT NOT NULL,
  end_time        TEXT,
  status          TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','active','completed','cancelled')),
  delay_minutes   INTEGER DEFAULT 0,
  service_date    DATE DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trips_route  ON trips(route_id);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);

-- ===========================
-- 11. BUS_LOCATIONS
-- ===========================
CREATE TABLE IF NOT EXISTS bus_locations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id              UUID NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
  trip_id             UUID REFERENCES trips(id),
  latitude            NUMERIC(10,7) NOT NULL,
  longitude           NUMERIC(10,7) NOT NULL,
  speed_kph           NUMERIC(5,1) DEFAULT 0,
  heading             NUMERIC(5,1) DEFAULT 0,
  progress_percentage NUMERIC(5,2) DEFAULT 0,
  next_stop_id        UUID REFERENCES stops(id),
  recorded_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bus_locations_bus       ON bus_locations(bus_id);
CREATE INDEX IF NOT EXISTS idx_bus_locations_recorded  ON bus_locations(recorded_at DESC);

-- ===========================
-- 12. ETA_PREDICTIONS
-- ===========================
CREATE TABLE IF NOT EXISTS eta_predictions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id                UUID REFERENCES trips(id) ON DELETE CASCADE,
  bus_id                 UUID REFERENCES buses(id),
  stop_id                UUID REFERENCES stops(id),
  predicted_arrival_time TIMESTAMPTZ,
  scheduled_arrival_time TIMESTAMPTZ,
  eta_minutes            INTEGER DEFAULT 0,
  delay_minutes          INTEGER DEFAULT 0,
  delay_status           TEXT DEFAULT 'on_time',
  confidence_score       NUMERIC(4,2) DEFAULT 0.85,
  created_at             TIMESTAMPTZ DEFAULT now()
);

-- ===========================
-- 13. TICKETS
-- ===========================
CREATE TABLE IF NOT EXISTS tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id),
  product_name    TEXT NOT NULL,
  price           INTEGER NOT NULL,
  currency        TEXT DEFAULT 'RWF',
  validity_minutes INTEGER DEFAULT 60,
  status          TEXT DEFAULT 'active' CHECK (status IN ('active','used','expired')),
  valid_from      TIMESTAMPTZ DEFAULT now(),
  valid_until     TIMESTAMPTZ,
  activated_at    TIMESTAMPTZ DEFAULT now(),
  payment_method  TEXT DEFAULT 'mock',
  qr_payload      TEXT,
  ticket_reference TEXT,
  route_name      TEXT,
  payment_status  TEXT NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid','pending','failed')),
  source          TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app','ussd')),
  validated_at    TIMESTAMPTZ,
  validated_by    TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ===========================
-- 14. SAVED_JOURNEYS
-- ===========================
CREATE TABLE IF NOT EXISTS saved_journeys (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id) ON DELETE CASCADE,
  from_stop_id   UUID REFERENCES stops(id),
  to_stop_id     UUID REFERENCES stops(id),
  from_stop_name TEXT,
  to_stop_name   TEXT,
  route_id       UUID REFERENCES routes(id),
  journey_data   JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ===========================
-- 15. INCIDENTS
-- ===========================
CREATE TABLE IF NOT EXISTS incidents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id    UUID REFERENCES routes(id),
  trip_id     UUID REFERENCES trips(id),
  bus_id      UUID REFERENCES buses(id),
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  severity    TEXT DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  status      TEXT DEFAULT 'open' CHECK (status IN ('open','investigating','resolved')),
  is_active   BOOLEAN DEFAULT true,
  starts_at   TIMESTAMPTZ DEFAULT now(),
  ends_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ===========================
-- 16. PASSENGER_FEEDBACK
-- ===========================
CREATE TABLE IF NOT EXISTS passenger_feedback (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id),
  route_id   UUID REFERENCES routes(id),
  trip_id    UUID REFERENCES trips(id),
  rating     INTEGER CHECK (rating BETWEEN 1 AND 5),
  message    TEXT,
  type       TEXT DEFAULT 'general',
  status     TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===========================
-- 17. NOTIFICATIONS
-- ===========================
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id),
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  type       TEXT DEFAULT 'info',
  is_read    BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===========================
-- 18. ADAPTIVE_ACTIONS
-- ===========================
CREATE TABLE IF NOT EXISTS adaptive_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id    UUID REFERENCES routes(id),
  trip_id     UUID REFERENCES trips(id),
  action_type TEXT NOT NULL,
  reason      TEXT,
  severity    TEXT DEFAULT 'warning',
  status      TEXT DEFAULT 'pending' CHECK (status IN ('pending','applied','dismissed')),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ===========================
-- 19. ROUTE_PERFORMANCE
-- ===========================
CREATE TABLE IF NOT EXISTS route_performance (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id             UUID REFERENCES routes(id),
  date                 DATE DEFAULT CURRENT_DATE,
  total_trips          INTEGER DEFAULT 0,
  on_time_trips        INTEGER DEFAULT 0,
  delayed_trips        INTEGER DEFAULT 0,
  avg_delay_minutes    NUMERIC(5,2) DEFAULT 0,
  avg_occupancy_pct    NUMERIC(5,2) DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT now()
);

-- ===========================
-- 20. DRIVER_ATTENDANCE
-- ===========================
CREATE TABLE IF NOT EXISTS driver_attendance (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id  UUID REFERENCES drivers(id),
  date       DATE DEFAULT CURRENT_DATE,
  check_in   TIMESTAMPTZ,
  check_out  TIMESTAMPTZ,
  status     TEXT DEFAULT 'present',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===========================
-- 21. USSD_SESSIONS
-- ===========================
CREATE TABLE IF NOT EXISTS ussd_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        TEXT UNIQUE NOT NULL,
  phone_number      TEXT NOT NULL,
  current_menu      TEXT DEFAULT 'main',
  selected_from_stop TEXT,
  selected_to_stop  TEXT,
  selected_route_id UUID REFERENCES routes(id),
  last_text         TEXT,
  status            TEXT DEFAULT 'active' CHECK (status IN ('active','ended')),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ===========================
-- 22. USSD_REQUESTS
-- ===========================
CREATE TABLE IF NOT EXISTS ussd_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  text         TEXT,
  response     TEXT,
  menu_level   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ===========================
-- FARE PRODUCTS (for tickets)
-- ===========================
CREATE TABLE IF NOT EXISTS fare_products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  description      TEXT,
  price            INTEGER NOT NULL,
  currency         TEXT DEFAULT 'RWF',
  validity_minutes INTEGER DEFAULT 60,
  is_active        BOOLEAN DEFAULT true
);

INSERT INTO fare_products (name, description, price, currency, validity_minutes) VALUES
  ('Single Ride',  'One-way ticket valid for 60 minutes',   500,   'RWF', 60),
  ('Day Pass',     'Unlimited rides for one day',           2000,  'RWF', 1440),
  ('Weekly Pass',  'Unlimited rides for 7 days',            10000, 'RWF', 10080)
ON CONFLICT DO NOTHING;

-- ===========================
-- PAYMENT LIFECYCLE (UrubutoPay / MoMo)
-- Kept separate from tickets: a ticket is created only after the provider
-- confirms payment, while this row tracks pending/failed/expired attempts.
-- ===========================
CREATE TABLE IF NOT EXISTS ticket_payments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference            TEXT UNIQUE NOT NULL,
  urubuto_reference    TEXT,
  fare_product_id      UUID,
  product_name         TEXT,
  amount               INTEGER NOT NULL CHECK (amount > 0),
  currency             TEXT DEFAULT 'RWF',
  payer_phone          TEXT NOT NULL,
  payment_channel      TEXT DEFAULT 'MOMO',
  route_name           TEXT,
  source               TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app','ussd')),
  status               TEXT DEFAULT 'pending'
                       CHECK (status IN ('pending','success','failed','expired')),
  ticket_id            UUID REFERENCES tickets(id),
  initiate_response    JSONB,
  last_status_response JSONB,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_payments_status
  ON ticket_payments (status);
CREATE INDEX IF NOT EXISTS idx_ticket_payments_reference
  ON ticket_payments (reference);
CREATE INDEX IF NOT EXISTS idx_ticket_payments_created_at
  ON ticket_payments (created_at);

-- ===========================
-- SEED: Demo admin user
-- ===========================
INSERT INTO users (full_name, email, role, password_hash) VALUES
  ('Admin User', 'admin@movexa.rw', 'admin', '$2b$10$placeholder_hash')
ON CONFLICT (email) DO NOTHING;

-- ===========================
-- PERMISSIONS — grant service_role full access
-- Run this so seed scripts work without permission errors
-- ===========================
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

-- Disable RLS on all tables (backend uses service_role — safe for dissertation)
ALTER TABLE users               DISABLE ROW LEVEL SECURITY;
ALTER TABLE passengers          DISABLE ROW LEVEL SECURITY;
ALTER TABLE drivers             DISABLE ROW LEVEL SECURITY;
ALTER TABLE routes              DISABLE ROW LEVEL SECURITY;
ALTER TABLE stops               DISABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops         DISABLE ROW LEVEL SECURITY;
ALTER TABLE route_paths         DISABLE ROW LEVEL SECURITY;
ALTER TABLE buses               DISABLE ROW LEVEL SECURITY;
ALTER TABLE schedules           DISABLE ROW LEVEL SECURITY;
ALTER TABLE trips               DISABLE ROW LEVEL SECURITY;
ALTER TABLE bus_locations       DISABLE ROW LEVEL SECURITY;
ALTER TABLE eta_predictions     DISABLE ROW LEVEL SECURITY;
ALTER TABLE tickets             DISABLE ROW LEVEL SECURITY;
ALTER TABLE saved_journeys      DISABLE ROW LEVEL SECURITY;
ALTER TABLE incidents           DISABLE ROW LEVEL SECURITY;
ALTER TABLE passenger_feedback  DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications       DISABLE ROW LEVEL SECURITY;
ALTER TABLE adaptive_actions    DISABLE ROW LEVEL SECURITY;
ALTER TABLE route_performance   DISABLE ROW LEVEL SECURITY;
ALTER TABLE driver_attendance   DISABLE ROW LEVEL SECURITY;
ALTER TABLE ussd_sessions       DISABLE ROW LEVEL SECURITY;
ALTER TABLE ussd_requests       DISABLE ROW LEVEL SECURITY;
ALTER TABLE fare_products       DISABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_payments     DISABLE ROW LEVEL SECURITY;
