-- Run in Supabase SQL Editor to allow upsert-by-bus_id in simulation
ALTER TABLE bus_locations DROP CONSTRAINT IF EXISTS bus_locations_bus_id_key;
ALTER TABLE bus_locations ADD CONSTRAINT bus_locations_bus_id_key UNIQUE (bus_id);
