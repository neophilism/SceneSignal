-- SS-24: private, scoped, replay-resistant contribution facts only.
-- Apply in a transaction before enabling the durable adapter.
-- Do not store raw receipt bytes, bearer credentials, contact data or payouts.
CREATE TABLE IF NOT EXISTS scene_contribution_events (
  tenant_id text NOT NULL,
  session_id text NOT NULL,
  event_id text NOT NULL,
  speaker_id text NOT NULL,
  contributor_id text NOT NULL,
  seconds integer NOT NULL CHECK (seconds BETWEEN 1 AND 300),
  verified_at_ms bigint NOT NULL CHECK (verified_at_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,session_id,event_id)
);
CREATE INDEX IF NOT EXISTS scene_contribution_session_contributor
  ON scene_contribution_events(tenant_id,session_id,contributor_id);
