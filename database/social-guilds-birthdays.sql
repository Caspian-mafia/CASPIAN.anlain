-- CASPIAN social, guild, birthday and scenario-studio foundation.
-- Additive and idempotent; no automatic coin deductions or gifts are issued.

CREATE TABLE IF NOT EXISTS caspian_guilds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(40) NOT NULL,
  name_normalized VARCHAR(40) NOT NULL UNIQUE,
  description VARCHAR(500) NOT NULL DEFAULT '',
  avatar_url TEXT,
  leader_user_id UUID NOT NULL REFERENCES caspian_users(id),
  deputy_user_id UUID REFERENCES caspian_users(id),
  visibility VARCHAR(12) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  invite_code_hash CHAR(64) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (deputy_user_id IS NULL OR deputy_user_id <> leader_user_id)
);

CREATE TABLE IF NOT EXISTS caspian_guild_members (
  user_id UUID PRIMARY KEY REFERENCES caspian_users(id) ON DELETE CASCADE,
  guild_id UUID NOT NULL REFERENCES caspian_guilds(id) ON DELETE CASCADE,
  member_role VARCHAR(12) NOT NULL DEFAULT 'member' CHECK (member_role IN ('leader','deputy','member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS caspian_guild_members_guild_idx ON caspian_guild_members(guild_id, joined_at);

CREATE TABLE IF NOT EXISTS caspian_guild_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID NOT NULL REFERENCES caspian_guilds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES caspian_users(id) ON DELETE CASCADE,
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
  decided_by UUID REFERENCES caspian_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  UNIQUE(guild_id,user_id)
);
CREATE INDEX IF NOT EXISTS caspian_guild_requests_pending_idx ON caspian_guild_join_requests(guild_id,created_at) WHERE status='pending';

CREATE TABLE IF NOT EXISTS caspian_guild_messages (
  id BIGSERIAL PRIMARY KEY,
  guild_id UUID NOT NULL REFERENCES caspian_guilds(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES caspian_users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 3000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS caspian_guild_messages_history_idx ON caspian_guild_messages(guild_id,created_at DESC);

CREATE TABLE IF NOT EXISTS caspian_guild_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID NOT NULL REFERENCES caspian_guilds(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES caspian_users(id),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS caspian_guild_game_rooms (
  guild_id UUID PRIMARY KEY REFERENCES caspian_guilds(id) ON DELETE CASCADE,
  room_code VARCHAR(12) UNIQUE REFERENCES caspian_room_directory(room_code) ON DELETE SET NULL,
  access_mode VARCHAR(12) NOT NULL DEFAULT 'members' CHECK (access_mode IN ('members','public')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS caspian_birthday_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(12) NOT NULL,
  host_user_id UUID NOT NULL REFERENCES caspian_users(id),
  honoree_user_id UUID NOT NULL REFERENCES caspian_users(id),
  theme_id VARCHAR(64) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','active','completed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS caspian_birthday_room_idx ON caspian_birthday_events(room_code,created_at DESC);

CREATE TABLE IF NOT EXISTS caspian_birthday_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL UNIQUE REFERENCES caspian_birthday_events(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES caspian_users(id),
  cosmetic_id VARCHAR(64) NOT NULL REFERENCES caspian_cosmetics(id),
  gift_status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (gift_status IN ('pending','delivered','cancelled')),
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS caspian_scenario_studio_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES caspian_users(id),
  scenario_id UUID REFERENCES caspian_scenarios(id),
  room_code VARCHAR(12) UNIQUE REFERENCES caspian_room_directory(room_code) ON DELETE SET NULL,
  player_capacity SMALLINT NOT NULL CHECK (player_capacity BETWEEN 4 AND 32),
  room_visibility VARCHAR(12) NOT NULL DEFAULT 'private' CHECK (room_visibility IN ('private','public')),
  room_locked BOOLEAN NOT NULL DEFAULT TRUE,
  entry_fee_coins BIGINT NOT NULL DEFAULT 2000 CHECK (entry_fee_coins >= 0),
  fee_mode VARCHAR(16) NOT NULL DEFAULT 'unset' CHECK (fee_mode IN ('unset','per_player','host_unlock')),
  custom_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','running','finished','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Private scenario-studio room invitations and host-only unlock accounting.
ALTER TABLE caspian_scenario_studio_sessions
  ALTER COLUMN entry_fee_coins SET DEFAULT 20000;
ALTER TABLE caspian_scenario_studio_sessions
  ALTER COLUMN fee_mode SET DEFAULT 'host_unlock';
ALTER TABLE caspian_scenario_studio_sessions
  ADD COLUMN IF NOT EXISTS host_unlock_paid BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS caspian_scenario_room_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES caspian_scenario_studio_sessions(id) ON DELETE CASCADE,
  code_hash CHAR(64) NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES caspian_users(id),
  max_uses INTEGER,
  uses_count INTEGER NOT NULL DEFAULT 0 CHECK (uses_count >= 0),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (max_uses IS NULL OR max_uses > 0)
);
CREATE INDEX IF NOT EXISTS caspian_scenario_room_invites_session_idx
  ON caspian_scenario_room_invites(session_id,created_at DESC);


-- Dedicated, separate Birthday Room (not the scenario-studio room).
CREATE TABLE IF NOT EXISTS caspian_birthday_room_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES caspian_users(id),
  room_code VARCHAR(12) UNIQUE REFERENCES caspian_room_directory(room_code) ON DELETE SET NULL,
  honoree_user_id UUID REFERENCES caspian_users(id),
  theme_id VARCHAR(64) NOT NULL,
  unlock_fee_coins BIGINT NOT NULL DEFAULT 20000 CHECK (unlock_fee_coins = 20000),
  owner_unlock_paid BOOLEAN NOT NULL DEFAULT FALSE,
  room_locked BOOLEAN NOT NULL DEFAULT TRUE,
  room_visibility VARCHAR(12) NOT NULL DEFAULT 'private' CHECK (room_visibility = 'private'),
  status VARCHAR(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','active','finished','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS caspian_birthday_room_owner_idx
  ON caspian_birthday_room_sessions(owner_user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS caspian_birthday_room_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  birthday_room_id UUID NOT NULL REFERENCES caspian_birthday_room_sessions(id) ON DELETE CASCADE,
  code_hash CHAR(64) NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES caspian_users(id),
  max_uses INTEGER,
  uses_count INTEGER NOT NULL DEFAULT 0 CHECK (uses_count >= 0),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (max_uses IS NULL OR max_uses > 0)
);
CREATE INDEX IF NOT EXISTS caspian_birthday_room_invites_room_idx
  ON caspian_birthday_room_invites(birthday_room_id,created_at DESC);


-- Operational birthday-room membership, layout settings and transferable gifts.
ALTER TABLE caspian_birthday_room_sessions
  ADD COLUMN IF NOT EXISTS room_settings JSONB NOT NULL DEFAULT '{"layout":"circle","guestCount":8}'::jsonb;

CREATE TABLE IF NOT EXISTS caspian_birthday_room_participants (
  birthday_room_id UUID NOT NULL REFERENCES caspian_birthday_room_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES caspian_users(id) ON DELETE CASCADE,
  member_role VARCHAR(12) NOT NULL DEFAULT 'guest' CHECK (member_role IN ('owner','honoree','guest')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(birthday_room_id,user_id)
);
CREATE INDEX IF NOT EXISTS caspian_birthday_room_participants_user_idx
  ON caspian_birthday_room_participants(user_id,joined_at DESC);

CREATE TABLE IF NOT EXISTS caspian_birthday_room_gift_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  birthday_room_id UUID NOT NULL REFERENCES caspian_birthday_room_sessions(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES caspian_users(id),
  recipient_user_id UUID NOT NULL REFERENCES caspian_users(id),
  cosmetic_id VARCHAR(64) NOT NULL REFERENCES caspian_cosmetics(id),
  gift_status VARCHAR(12) NOT NULL DEFAULT 'delivered' CHECK (gift_status IN ('delivered','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (sender_user_id <> recipient_user_id)
);
CREATE INDEX IF NOT EXISTS caspian_birthday_room_gifts_room_idx
  ON caspian_birthday_room_gift_deliveries(birthday_room_id,created_at DESC);
