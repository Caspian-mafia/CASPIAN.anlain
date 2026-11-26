-- CASPIAN administrator operations: audited account, wallet, store and settings controls.
ALTER TABLE caspian_users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS caspian_admin_audit (
 id BIGSERIAL PRIMARY KEY,
 action VARCHAR(48) NOT NULL,
 target_type VARCHAR(32) NOT NULL,
 target_id VARCHAR(128),
 details JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS caspian_admin_audit_created_idx ON caspian_admin_audit(created_at DESC);
CREATE TABLE IF NOT EXISTS caspian_app_settings (
 setting_key VARCHAR(80) PRIMARY KEY,
 setting_value JSONB NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO caspian_app_settings(setting_key,setting_value) VALUES
 ('maintenance_mode','false'::jsonb),
 ('public_rooms_enabled','true'::jsonb),
 ('private_rooms_enabled','true'::jsonb),
 ('default_game_prize_coins','20000'::jsonb),
 ('registration_enabled','true'::jsonb)
ON CONFLICT(setting_key) DO NOTHING;
