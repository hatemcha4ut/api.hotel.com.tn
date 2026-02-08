-- Migration: Add guest sessions, settings, and audit log tables
-- This migration creates tables for:
-- - guest_sessions: temporary sessions for non-authenticated users
-- - settings: application-wide configuration with audit trail support
-- - settings_audit_log: audit log for settings changes
-- It also adds guest_session_id to bookings and whatsapp_consent to profiles

-- Create guest_sessions table
-- Stores temporary sessions for guest (anonymous) users
-- Backend-only access via service_role
CREATE TABLE IF NOT EXISTS public.guest_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS guest_sessions_expires_at_idx ON public.guest_sessions (expires_at);

COMMENT ON TABLE public.guest_sessions IS 'Temporary sessions for guest users (non-authenticated). Backend-only access.';
COMMENT ON COLUMN public.guest_sessions.expires_at IS 'Session expiration timestamp. Sessions should be cleaned up after this time.';
COMMENT ON COLUMN public.guest_sessions.metadata IS 'Flexible JSON storage for session-related data (device info, preferences, etc.)';

-- Create settings table
-- Stores application-wide configuration
CREATE TABLE IF NOT EXISTS public.settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

COMMENT ON TABLE public.settings IS 'Application-wide settings and configuration';
COMMENT ON COLUMN public.settings.key IS 'Unique setting identifier (e.g., checkout-policy, payment-config)';
COMMENT ON COLUMN public.settings.value IS 'JSON value for the setting';
COMMENT ON COLUMN public.settings.updated_by IS 'User who last updated this setting (if applicable)';

-- Insert default checkout-policy setting
-- ON_HOLD_PREAUTH means bookings are held with pre-authorization
INSERT INTO public.settings (key, value)
VALUES ('checkout-policy', '{"policy": "ON_HOLD_PREAUTH"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Create settings_audit_log table
-- Tracks all changes to settings for audit purposes
CREATE TABLE IF NOT EXISTS public.settings_audit_log (
  id bigserial PRIMARY KEY,
  setting_key text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS settings_audit_log_key_idx ON public.settings_audit_log (setting_key);
CREATE INDEX IF NOT EXISTS settings_audit_log_changed_at_idx ON public.settings_audit_log (changed_at);

COMMENT ON TABLE public.settings_audit_log IS 'Audit log for all settings changes';
COMMENT ON COLUMN public.settings_audit_log.setting_key IS 'Key of the setting that was changed';
COMMENT ON COLUMN public.settings_audit_log.old_value IS 'Previous value before change (NULL for new settings)';
COMMENT ON COLUMN public.settings_audit_log.new_value IS 'New value after change';
COMMENT ON COLUMN public.settings_audit_log.changed_by IS 'User who made the change (NULL for system changes)';

-- Add guest_session_id column to bookings
-- Links bookings to guest sessions for non-authenticated users
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS guest_session_id uuid REFERENCES public.guest_sessions(id);

CREATE INDEX IF NOT EXISTS bookings_guest_session_id_idx ON public.bookings (guest_session_id);

COMMENT ON COLUMN public.bookings.guest_session_id IS 'Links booking to guest session for non-authenticated users';

-- Add whatsapp_consent column to profiles
-- Tracks explicit user consent for WhatsApp communications
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_consent boolean DEFAULT false;

COMMENT ON COLUMN public.profiles.whatsapp_consent IS 'User consent for receiving WhatsApp messages (GDPR/privacy compliance)';

-- Enable Row Level Security (RLS) on new tables
ALTER TABLE public.guest_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for guest_sessions
-- Only service_role can access (backend-only)
-- No policies for anon/authenticated = access denied by default with RLS enabled

-- RLS Policies for settings
-- Authenticated users can read settings
CREATE POLICY "settings_select_authenticated" ON public.settings
  FOR SELECT TO authenticated
  USING (true);

-- Only service_role can insert/update/delete settings (managed by backend)
-- No INSERT/UPDATE/DELETE policies for authenticated = denied by default

-- RLS Policies for settings_audit_log
-- Authenticated users can read audit log (admin check should be done in application layer)
CREATE POLICY "audit_log_select_authenticated" ON public.settings_audit_log
  FOR SELECT TO authenticated
  USING (true);

-- Only service_role can insert into audit log (managed by backend)
-- No INSERT policy for authenticated = denied by default
