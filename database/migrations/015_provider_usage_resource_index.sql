CREATE INDEX IF NOT EXISTS idx_tts_provider_usage_events_resource
  ON tts_provider_usage_events (user_id, event_type, resource_id, created_at DESC)
  WHERE resource_id IS NOT NULL;
