-- CASPIAN platform foundation: persistent accounts, economy, cosmetics and scenarios.
-- This migration is additive and safe to run repeatedly.

CREATE TABLE IF NOT EXISTS caspian_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(24) NOT NULL,
  username_normalized VARCHAR(24) NOT NULL UNIQUE,
  display_name VARCHAR(32) NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_cosmetic_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS caspian_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES caspian_users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS caspian_sessions_user_idx ON caspian_sessions(user_id);
CREATE INDEX IF NOT EXISTS caspian_sessions_expiry_idx ON caspian_sessions(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS caspian_wallets (
  user_id UUID PRIMARY KEY REFERENCES caspian_users(id) ON DELETE CASCADE,
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS caspian_wallet_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES caspian_users(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL CHECK (amount <> 0),
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  entry_type VARCHAR(32) NOT NULL,
  reference_type VARCHAR(32),
  reference_id VARCHAR(128),
  idempotency_key VARCHAR(128) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS caspian_wallet_ledger_user_idx ON caspian_wallet_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS caspian_cosmetics (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  category VARCHAR(24) NOT NULL CHECK (category IN ('avatar','frame','badge','role_skin')),
  price_coins BIGINT NOT NULL DEFAULT 0 CHECK (price_coins >= 0),
  asset_url TEXT NOT NULL,
  rarity VARCHAR(16) NOT NULL DEFAULT 'common',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS caspian_user_cosmetics (
  user_id UUID NOT NULL REFERENCES caspian_users(id) ON DELETE CASCADE,
  cosmetic_id VARCHAR(64) NOT NULL REFERENCES caspian_cosmetics(id),
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acquisition_type VARCHAR(24) NOT NULL CHECK (acquisition_type IN ('purchase','reward','grant')),
  PRIMARY KEY(user_id, cosmetic_id)
);

CREATE TABLE IF NOT EXISTS caspian_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES caspian_users(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(1000) NOT NULL DEFAULT '',
  visibility VARCHAR(16) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','unlisted','public')),
  status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS caspian_scenarios_public_idx ON caspian_scenarios(updated_at DESC)
  WHERE status='published' AND visibility='public';
CREATE INDEX IF NOT EXISTS caspian_scenarios_owner_idx ON caspian_scenarios(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS caspian_scenario_permissions (
  scenario_id UUID NOT NULL REFERENCES caspian_scenarios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES caspian_users(id) ON DELETE CASCADE,
  permission VARCHAR(16) NOT NULL CHECK (permission IN ('view','run','edit')),
  granted_by UUID NOT NULL REFERENCES caspian_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(scenario_id, user_id)
);

CREATE TABLE IF NOT EXISTS caspian_room_directory (
  room_code VARCHAR(12) PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES caspian_users(id),
  scenario_id UUID REFERENCES caspian_scenarios(id),
  visibility VARCHAR(16) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  status VARCHAR(16) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','running','finished','closed')),
  max_players SMALLINT NOT NULL DEFAULT 16 CHECK (max_players BETWEEN 4 AND 32),
  entry_fee BIGINT NOT NULL DEFAULT 0 CHECK (entry_fee >= 0),
  prize_pool BIGINT NOT NULL DEFAULT 0 CHECK (prize_pool >= 0),
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS caspian_room_directory_browse_idx ON caspian_room_directory(status, visibility, created_at DESC);

CREATE TABLE IF NOT EXISTS caspian_game_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(12) NOT NULL,
  user_id UUID NOT NULL REFERENCES caspian_users(id),
  outcome VARCHAR(16) NOT NULL CHECK (outcome IN ('win','loss','draw','left')),
  reward_coins BIGINT NOT NULL DEFAULT 0 CHECK (reward_coins >= 0),
  scenario_id UUID REFERENCES caspian_scenarios(id),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_code, user_id)
);
CREATE INDEX IF NOT EXISTS caspian_game_results_user_idx ON caspian_game_results(user_id, completed_at DESC);

CREATE TABLE IF NOT EXISTS caspian_coin_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES caspian_users(id),
  provider VARCHAR(32) NOT NULL,
  provider_reference VARCHAR(160),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL,
  coins BIGINT NOT NULL CHECK (coins > 0),
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Profile cosmetics: one equipped avatar and one equipped frame per account.
ALTER TABLE caspian_users ADD COLUMN IF NOT EXISTS frame_cosmetic_id VARCHAR(64);

INSERT INTO caspian_cosmetics (id,name,description,category,price_coins,asset_url,rarity)
VALUES
 ('avatar-fox','روباه زرین','آواتور فانتزی روباه','avatar',250,'emoji:🦊','common'),
 ('avatar-cat','گربه شب','آواتور فانتزی گربه','avatar',300,'emoji:🐈‍⬛','common'),
 ('avatar-wolf','گرگ نقره‌ای','آواتور فانتزی گرگ','avatar',450,'emoji:🐺','rare'),
 ('avatar-owl','جغد دانا','آواتور فانتزی جغد','avatar',500,'emoji:🦉','rare'),
 ('avatar-dragon','اژدهای آتشین','آواتور فانتزی اژدها','avatar',900,'emoji:🐉','epic'),
 ('avatar-king','پادشاه ماسک‌دار','آواتور ویژه کاسپین','avatar',1200,'emoji:👑','epic'),
 ('frame-bronze','قاب برنزی','قاب کلاسیک پروفایل','frame',150,'frame:bronze','common'),
 ('frame-silver','قاب نقره‌ای','قاب درخشان پروفایل','frame',300,'frame:silver','common'),
 ('frame-gold','قاب طلایی','قاب طلایی پروفایل','frame',550,'frame:gold','rare'),
 ('frame-neon','قاب نئونی','قاب نورانی پروفایل','frame',800,'frame:neon','rare'),
 ('frame-fire','قاب شعله‌ای','قاب آتشین پروفایل','frame',1100,'frame:fire','epic'),
 ('avatar-starter-fox','روباه بازیگوش','آواتار پایه رایگان برای شروع','avatar',0,'emoji:🦊','common'),
 ('avatar-starter-cat','گربه مهربان','آواتار پایه رایگان برای شروع','avatar',0,'emoji:🐱','common'),
 ('avatar-starter-owl','جغد کوچک','آواتار پایه رایگان برای شروع','avatar',0,'emoji:🦉','common'),
 ('frame-starter','قاب ساده','قاب پایه رایگان برای همه اعضای تازه‌وارد','frame',0,'frame:starter','common'),
 ('avatar-detective','کارآگاه نیمه‌شب','چهره کارآگاه مرموز شهر','avatar',350,'emoji:🕵️','common'),
 ('avatar-doctor','پزشک سپیده‌دم','پزشک نگهبان شهر','avatar',400,'emoji:🧑‍⚕️','common'),
 ('avatar-godfather','پدرخوانده','چهره فرمانروای خاندان مافیا','avatar',1400,'emoji:🎩','legendary'),
 ('avatar-hitman','مرد سایه','آدمکش خاموش شب','avatar',750,'emoji:🥷','rare'),
 ('avatar-witch','جادوگر مه‌آلود','جادوگر اسرارآمیز شب','avatar',850,'emoji:🧙‍♀️','epic'),
 ('avatar-vampire','کنت خون','اشراف‌زاده تاریکی','avatar',950,'emoji:🧛','epic'),
 ('avatar-pirate','کاپیتان سیاه','کاپیتان جسور دریاهای تاریک','avatar',600,'emoji:🏴‍☠️','rare'),
 ('avatar-samurai','سامورایی سرخ','جنگجوی افسانه‌ای','avatar',800,'emoji:🗡️','rare'),
 ('avatar-raven','کلاغ شوم','نگهبان رازهای شهر','avatar',550,'emoji:🐦‍⬛','rare'),
 ('avatar-tiger','ببر آتشین','شکارچی قدرتمند شب','avatar',700,'emoji:🐅','rare'),
 ('avatar-ice-queen','ملکه یخی','فرمانروای قلمرو یخ','avatar',1000,'emoji:👸','epic'),
 ('avatar-phantom','شبح نقاب‌دار','روح ناشناس کوچه‌ها','avatar',900,'emoji:👻','epic'),
 ('avatar-alchemist','کیمیاگر','استاد معجون‌ها و اسرار','avatar',650,'emoji:⚗️','rare'),
 ('frame-iron','قاب آهنی','حاشیه فلزی تیره','frame',250,'frame:iron','common'),
 ('frame-emerald','قاب زمردی','حاشیه سبز زمردی','frame',450,'frame:emerald','rare'),
 ('frame-sapphire','قاب یاقوت کبود','حاشیه آبی جواهری','frame',650,'frame:sapphire','rare'),
 ('frame-amethyst','قاب آمتیست','حاشیه بنفش جادویی','frame',750,'frame:amethyst','rare'),
 ('frame-shadow','قاب سایه','حاشیه تیره با جزئیات مرموز','frame',900,'frame:shadow','epic'),
 ('frame-royal-red','قاب سلطنتی سرخ','حاشیه قرمز و طلایی','frame',1000,'frame:royal-red','epic'),
 ('frame-celestial','قاب آسمانی','حاشیه درخشان ستاره‌ای','frame',1250,'frame:celestial','epic'),
 ('frame-diamond','قاب الماس','حاشیه جواهری ویژه','frame',1800,'frame:diamond','legendary')
ON CONFLICT (id) DO NOTHING;

-- Persistent anonymous-device profiles. The raw guest token is never stored.
CREATE TABLE IF NOT EXISTS caspian_guest_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash CHAR(64) NOT NULL UNIQUE,
  avatar_cosmetic_id VARCHAR(64),
  frame_cosmetic_id VARCHAR(64),
  claimed_by UUID UNIQUE REFERENCES caspian_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS caspian_guest_cosmetics (
  guest_id UUID NOT NULL REFERENCES caspian_guest_profiles(id) ON DELETE CASCADE,
  cosmetic_id VARCHAR(64) NOT NULL REFERENCES caspian_cosmetics(id),
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(guest_id,cosmetic_id)
);

-- Phone-number identity and short-lived OTP challenges.
ALTER TABLE caspian_users ADD COLUMN IF NOT EXISTS phone_e164 VARCHAR(16);
CREATE UNIQUE INDEX IF NOT EXISTS caspian_users_phone_unique ON caspian_users(phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE TABLE IF NOT EXISTS caspian_phone_otps (
 phone_e164 VARCHAR(16) PRIMARY KEY,
 code_hash CHAR(64) NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
 last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Original zodiac-themed player avatars; these remain separate from secret role identity.
INSERT INTO caspian_cosmetics (id,name,description,category,price_coins,asset_url,rarity) VALUES
 ('avatar-zodiac-aries','حمل · شعله‌ور','آواتار فانتزی اختصاصی مجموعه زودیاک کاسپین','avatar',700,'sprite:zodiac:aries','rare'),
 ('avatar-zodiac-taurus','ثور · نگهبان زمرد','آواتار فانتزی اختصاصی مجموعه زودیاک کاسپین','avatar',750,'sprite:zodiac:taurus','rare'),
 ('avatar-zodiac-gemini','جوزا · دوقلوی نور','آواتار فانتزی اختصاصی مجموعه زودیاک کاسپین','avatar',800,'sprite:zodiac:gemini','rare'),
 ('avatar-zodiac-cancer','سرطان · ماه‌تاب','آواتار فانتزی اختصاصی مجموعه زودیاک کاسپین','avatar',850,'sprite:zodiac:cancer','rare'),
 ('avatar-zodiac-leo','اسد · شیر خورشیدی','آواتار فانتزی اختصاصی مجموعه زودیاک کاسپین','avatar',900,'sprite:zodiac:leo','rare'),
 ('avatar-zodiac-virgo','سنبله · بانوی ستاره','آواتار فانتزی اختصاصی مجموعه زودیاک کاسپین','avatar',950,'sprite:zodiac:virgo','rare'),
 ('avatar-zodiac-libra','میزان · ترازوی آسمان','آواتار فانتزی اختصاصی مجموعه زودیاک کاسپین','avatar',1000,'sprite:zodiac:libra','rare'),
 ('avatar-zodiac-scorpio','عقرب · نیش سایه','آواتار فانتزی اختصاصی مجموعه زودیاک کاسپین','avatar',1050,'sprite:zodiac:scorpio','rare'),
 ('avatar-zodiac-sagittarius','قوس · کماندار کیهانی','آواتار فانتزی اختصاصی مجموعه زودیاک کاسپین','avatar',1100,'sprite:zodiac:sagittarius','epic'),
 ('avatar-zodiac-capricorn','جدی · شاخ بلورین','آواتار فانتزی اختصاصی مجموعه زودیاک کاسپین','avatar',1150,'sprite:zodiac:capricorn','epic'),
 ('avatar-zodiac-aquarius','دلو · موج‌ساز','آواتار فانتزی اختصاصی مجموعه زودیاک کاسپین','avatar',1200,'sprite:zodiac:aquarius','epic'),
 ('avatar-zodiac-pisces','حوت · دو ماهی خیال','آواتار فانتزی اختصاصی مجموعه زودیاک کاسپین','avatar',1300,'sprite:zodiac:pisces','epic')
ON CONFLICT (id) DO NOTHING;

-- CASPIAN pricing update: paid avatars/frames start at 30,000 coins; starter gifts stay free.
UPDATE caspian_cosmetics
SET price_coins = CASE
 WHEN id IN ('avatar-starter-fox','avatar-starter-cat','avatar-starter-owl','frame-starter') THEN 0
 WHEN rarity = 'common' THEN 30000
 WHEN rarity = 'rare' THEN 50000
 WHEN rarity = 'epic' THEN 80000
 WHEN rarity = 'legendary' THEN 120000
 ELSE GREATEST(price_coins,30000)
END
WHERE category IN ('avatar','frame');
-- Zodiac collection receives a premium tier while keeping the minimum paid item at 30,000 coins.
UPDATE caspian_cosmetics SET price_coins = CASE id
 WHEN 'avatar-zodiac-aries' THEN 50000 WHEN 'avatar-zodiac-taurus' THEN 55000
 WHEN 'avatar-zodiac-gemini' THEN 60000 WHEN 'avatar-zodiac-cancer' THEN 65000
 WHEN 'avatar-zodiac-leo' THEN 70000 WHEN 'avatar-zodiac-virgo' THEN 75000
 WHEN 'avatar-zodiac-libra' THEN 80000 WHEN 'avatar-zodiac-scorpio' THEN 85000
 WHEN 'avatar-zodiac-sagittarius' THEN 90000 WHEN 'avatar-zodiac-capricorn' THEN 100000
 WHEN 'avatar-zodiac-aquarius' THEN 110000 WHEN 'avatar-zodiac-pisces' THEN 120000
 ELSE price_coins END
WHERE id LIKE 'avatar-zodiac-%';


-- Exactly-once, program-funded match prize settlement (default pool: 20,000 coins).
CREATE TABLE IF NOT EXISTS caspian_game_payouts (
  room_code VARCHAR(12) PRIMARY KEY,
  winner VARCHAR(24) NOT NULL CHECK (winner IN ('mafia','town','serial-killer')),
  prize_pool_coins BIGINT NOT NULL CHECK (prize_pool_coins >= 0),
  winner_count INTEGER NOT NULL DEFAULT 0 CHECK (winner_count >= 0),
  distributed_coins BIGINT NOT NULL DEFAULT 0 CHECK (distributed_coins >= 0),
  settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Align paid cosmetics with the approved minimum of 30,000 coins.
-- Keep starter cosmetics free; this UPDATE also corrects installations that
-- already ran an earlier version of the additive seed migration.
UPDATE caspian_cosmetics
SET price_coins = CASE id
 WHEN 'avatar-fox' THEN 30000
 WHEN 'avatar-cat' THEN 35000
 WHEN 'avatar-wolf' THEN 40000
 WHEN 'avatar-owl' THEN 45000
 WHEN 'avatar-dragon' THEN 90000
 WHEN 'avatar-king' THEN 120000
 WHEN 'avatar-detective' THEN 50000
 WHEN 'avatar-doctor' THEN 55000
 WHEN 'avatar-godfather' THEN 150000
 WHEN 'avatar-hitman' THEN 75000
 WHEN 'avatar-witch' THEN 85000
 WHEN 'avatar-vampire' THEN 95000
 WHEN 'avatar-pirate' THEN 60000
 WHEN 'avatar-samurai' THEN 80000
 WHEN 'avatar-raven' THEN 50000
 WHEN 'avatar-tiger' THEN 70000
 WHEN 'avatar-ice-queen' THEN 110000
 WHEN 'avatar-phantom' THEN 100000
 WHEN 'avatar-alchemist' THEN 65000
 WHEN 'frame-bronze' THEN 30000
 WHEN 'frame-silver' THEN 40000
 WHEN 'frame-gold' THEN 55000
 WHEN 'frame-neon' THEN 80000
 WHEN 'frame-fire' THEN 100000
 WHEN 'frame-iron' THEN 35000
 WHEN 'frame-emerald' THEN 50000
 WHEN 'frame-sapphire' THEN 70000
 WHEN 'frame-amethyst' THEN 80000
 WHEN 'frame-shadow' THEN 95000
 WHEN 'frame-royal-red' THEN 105000
 WHEN 'frame-celestial' THEN 130000
 WHEN 'frame-diamond' THEN 180000
 ELSE price_coins
END
WHERE id IN (
 'avatar-fox','avatar-cat','avatar-wolf','avatar-owl','avatar-dragon','avatar-king',
 'avatar-detective','avatar-doctor','avatar-godfather','avatar-hitman','avatar-witch',
 'avatar-vampire','avatar-pirate','avatar-samurai','avatar-raven','avatar-tiger',
 'avatar-ice-queen','avatar-phantom','avatar-alchemist','frame-bronze','frame-silver',
 'frame-gold','frame-neon','frame-fire','frame-iron','frame-emerald','frame-sapphire',
 'frame-amethyst','frame-shadow','frame-royal-red','frame-celestial','frame-diamond'
);


-- Social cosmetics sold separately from profile avatars/frames.
INSERT INTO caspian_cosmetics (id,name,description,category,price_coins,asset_url,rarity) VALUES
 ('social-sticker-suspect','بسته استیکر کارآگاه','استیکرهای «مشکوکم»، «حواسم بهته» و هشدار مافیا','badge',9000,'social:sticker-suspect','common'),
 ('social-sticker-drama','بسته استیکر هیجان','تشویق، خنده، آتش و واکنش‌های نمایشی','badge',12000,'social:sticker-drama','rare'),
 ('social-speaker-mafia','اسپیکر خاندان مافیا','گردن‌گیری، اتهام مافیا و هشدارهای صوتی/متنی فانتزی','badge',15000,'social:speaker-mafia','rare'),
 ('social-speaker-royal','اسپیکر سلطنتی کاسپین','اسپیکرهای اعتماد، دفاع و بی‌توجهی با افکت طلایی','badge',15000,'social:speaker-royal','rare'),
 ('social-vote-effects','جلوه‌های رأی سلطنتی','تاج، صاعقه، رز، سایه و شهاب هنگام رأی دادن','badge',18000,'social:vote-effects','epic'),
 ('social-royal-bundle','بسته کامل تعامل کاسپین','تمام استیکرها، اسپیکرها و جلوه‌های رأی‌گیری','badge',35000,'social:royal-bundle','legendary')
ON CONFLICT (id) DO NOTHING;


-- Premium apocalypse avatar collection: original neon-purple, infernal and ice designs.
INSERT INTO caspian_cosmetics (id,name,description,category,price_coins,asset_url,rarity) VALUES
 ('avatar-apoc-hellking','پادشاه جهنم','فرمانروای شعله‌های آخرالزمان','avatar',1800,'/assets/cosmetics/avatars.svg#avatar-apoc-hellking','legendary'),
 ('avatar-apoc-demon','شیطان بال‌دار','نگهبان بال‌سیاه دوزخ','avatar',1700,'/assets/cosmetics/avatars.svg#avatar-apoc-demon','legendary'),
 ('avatar-apoc-vampire','خون‌آشام سرخ','شکارچی شب با چشمان یاقوتی','avatar',1500,'/assets/cosmetics/avatars.svg#avatar-apoc-vampire','epic'),
 ('avatar-apoc-iceghost','روح یخی','شبح سرد و بی‌رحم','avatar',1500,'/assets/cosmetics/avatars.svg#avatar-apoc-iceghost','epic'),
 ('avatar-apoc-darkwitch','جادوگر تاریکی','افسونگر مه و سایه','avatar',1450,'/assets/cosmetics/avatars.svg#avatar-apoc-darkwitch','epic'),
 ('avatar-apoc-shadowqueen','ملکه سایه‌ها','ملکه تاج‌دار قلمرو تاریک','avatar',1800,'/assets/cosmetics/avatars.svg#avatar-apoc-shadowqueen','legendary'),
 ('avatar-apoc-hellwolf','گرگ اهریمنی','گرگ شعله‌چشم شب‌های سرخ','avatar',1600,'/assets/cosmetics/avatars.svg#avatar-apoc-hellwolf','epic'),
 ('avatar-apoc-skullknight','شوالیه جمجمه','جنگجوی نفرین‌شده','avatar',1550,'/assets/cosmetics/avatars.svg#avatar-apoc-skullknight','epic'),
 ('avatar-apoc-plague','فرشته طاعون','فرشته سقوط‌کرده با نقاب','avatar',1700,'/assets/cosmetics/avatars.svg#avatar-apoc-plague','legendary'),
 ('avatar-apoc-crow','کلاغ قیامت','پیام‌آور پایان جهان','avatar',1400,'/assets/cosmetics/avatars.svg#avatar-apoc-crow','epic'),
 ('avatar-apoc-firelord','ارباب آتش','فرمانروای آتش و خاکستر','avatar',1650,'/assets/cosmetics/avatars.svg#avatar-apoc-firelord','epic'),
 ('avatar-apoc-nightmare','کابوس','چهره هراس در مه بنفش','avatar',1550,'/assets/cosmetics/avatars.svg#avatar-apoc-nightmare','epic')
ON CONFLICT (id) DO NOTHING;


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


-- CASPIAN social sticker inventory and persistent cross-device ownership.
ALTER TABLE caspian_cosmetics DROP CONSTRAINT IF EXISTS caspian_cosmetics_category_check;
ALTER TABLE caspian_cosmetics ADD CONSTRAINT caspian_cosmetics_category_check
  CHECK (category IN ('avatar','frame','badge','role_skin','sticker'));

INSERT INTO caspian_cosmetics (id,name,description,category,price_coins,asset_url,rarity)
VALUES
 ('sticker-like','لایک','واکنش مثبت هنگام گفت‌وگو','sticker',250,'/assets/cosmetics/stickers/like.png','common'),
 ('sticker-dislike','دیسلایک','واکنش منفی هنگام گفت‌وگو','sticker',250,'/assets/cosmetics/stickers/dislike.png','common'),
 ('sticker-heart','قلب','ارسال قلب بنفش','sticker',300,'/assets/cosmetics/stickers/heart.png','common'),
 ('sticker-suspicious','مشکوکم','واکنش شک و تردید','sticker',300,'/assets/cosmetics/stickers/surprised.png','common'),
 ('sticker-attention','توجه','جلب توجه بازیکنان','sticker',300,'/assets/cosmetics/stickers/attention.jpg','common'),
 ('sticker-angry','عصبانی','واکنش عصبانیت','sticker',300,'/assets/cosmetics/stickers/angry.png','common'),
 ('sticker-defend','دفاع','اعلام دفاع از بازیکن','sticker',350,'/assets/cosmetics/stickers/trust.jpg','rare'),
 ('sticker-accuse','اتهام','اعلام اتهام در بحث','sticker',350,'/assets/cosmetics/stickers/attention.jpg','rare'),
 ('sticker-trust','اعتماد','اعلام اعتماد به بازیکن','sticker',350,'/assets/cosmetics/stickers/trust.jpg','rare'),
 ('sticker-laugh','خنده','واکنش خنده','sticker',250,'/assets/cosmetics/stickers/laugh.png','common'),
 ('sticker-sad','ناراحت','واکنش ناراحتی','sticker',250,'/assets/cosmetics/stickers/broken-heart.png','common'),
 ('sticker-crown','تاج سلطنتی','واکنش ویژه کاسپین','sticker',500,'/assets/cosmetics/stickers/mafia.jpg','epic')
ON CONFLICT (id) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,category=EXCLUDED.category,
 price_coins=EXCLUDED.price_coins,asset_url=EXCLUDED.asset_url,active=TRUE;

-- CASPIAN premium apocalypse avatar pricing —
-- The 12 apocalypse SVG avatars already exist in the bundled asset sprite.
-- Prices are virtual coins; the real-money coin-pack prices remain separately
-- configured on the server and must be reviewed against inflation periodically.
UPDATE caspian_cosmetics SET price_coins = CASE id
 WHEN 'avatar-apoc-crow' THEN 140000
 WHEN 'avatar-apoc-darkwitch' THEN 150000
 WHEN 'avatar-apoc-vampire' THEN 160000
 WHEN 'avatar-apoc-iceghost' THEN 165000
 WHEN 'avatar-apoc-hellwolf' THEN 175000
 WHEN 'avatar-apoc-skullknight' THEN 180000
 WHEN 'avatar-apoc-nightmare' THEN 185000
 WHEN 'avatar-apoc-firelord' THEN 195000
 WHEN 'avatar-apoc-demon' THEN 220000
 WHEN 'avatar-apoc-plague' THEN 225000
 WHEN 'avatar-apoc-hellking' THEN 240000
 WHEN 'avatar-apoc-shadowqueen' THEN 250000
 ELSE price_coins
END
WHERE id IN (
 'avatar-apoc-hellking','avatar-apoc-demon','avatar-apoc-vampire',
 'avatar-apoc-iceghost','avatar-apoc-darkwitch','avatar-apoc-shadowqueen',
 'avatar-apoc-hellwolf','avatar-apoc-skullknight','avatar-apoc-plague',
 'avatar-apoc-crow','avatar-apoc-firelord','avatar-apoc-nightmare'
);


-- CASPIAN 20 standalone neon avatar catalog
-- Asset files are expected under public/assets/cosmetics/avatars/neon/.
INSERT INTO caspian_cosmetics (id,name,description,category,price_coins,asset_url,rarity) VALUES
 ('avatar-neon-hellking','پادشاه جهنم','فرمانروای شعله‌های آخرالزمان','avatar',250000,'/assets/cosmetics/avatars/neon/avatar-neon-hellking.webp','legendary'),
 ('avatar-neon-demon','شیطان بال‌دار','نگهبان بال‌سیاه دوزخ','avatar',240000,'/assets/cosmetics/avatars/neon/avatar-neon-demon.webp','legendary'),
 ('avatar-neon-blood-vampire','خون‌آشام سرخ','شکارچی شب با چشمان یاقوتی','avatar',220000,'/assets/cosmetics/avatars/neon/avatar-neon-blood_vampire.webp','legendary'),
 ('avatar-neon-ice-wraith','روح یخی','شبح سرد و نئونی','avatar',195000,'/assets/cosmetics/avatars/neon/avatar-neon-ice_wraith.webp','epic'),
 ('avatar-neon-dark-witch','جادوگر تاریکی','افسونگر مه و سایه','avatar',185000,'/assets/cosmetics/avatars/neon/avatar-neon-dark_witch.webp','epic'),
 ('avatar-neon-shadow-queen','ملکه سایه‌ها','ملکه تاج‌دار قلمرو تاریک','avatar',250000,'/assets/cosmetics/avatars/neon/avatar-neon-shadow_queen.webp','legendary'),
 ('avatar-neon-hellwolf','گرگ اهریمنی','گرگ شعله‌چشم شب‌های سرخ','avatar',220000,'/assets/cosmetics/avatars/neon/avatar-neon-hellwolf.webp','legendary'),
 ('avatar-neon-skull-knight','شوالیه جمجمه','جنگجوی نفرین‌شده','avatar',195000,'/assets/cosmetics/avatars/neon/avatar-neon-skull_knight.webp','epic'),
 ('avatar-neon-plague-doctor','پزشک طاعون','پزشک نقاب‌دار آخرالزمان','avatar',185000,'/assets/cosmetics/avatars/neon/avatar-neon-plague_doctor.webp','epic'),
 ('avatar-neon-doomsday-raven','کلاغ قیامت','پیام‌آور پایان جهان','avatar',160000,'/assets/cosmetics/avatars/neon/avatar-neon-doomsday_raven.webp','epic'),
 ('avatar-neon-fire-lord','ارباب آتش','فرمانروای آتش و خاکستر','avatar',195000,'/assets/cosmetics/avatars/neon/avatar-neon-fire_lord.webp','epic'),
 ('avatar-neon-shadow-sorcerer','جادوگر سایه','جادوگر رازآلود قلمرو تاریک','avatar',180000,'/assets/cosmetics/avatars/neon/avatar-neon-shadow_sorcerer.webp','epic'),
 ('avatar-neon-cyber-assassin','آدمکش سایبری','قاتل آینده‌نگر با زره نئونی','avatar',165000,'/assets/cosmetics/avatars/neon/avatar-neon-cyber_assassin.webp','epic'),
 ('avatar-neon-red-samurai','سامورایی سرخ','جنگجوی سرخ‌پوش شب','avatar',175000,'/assets/cosmetics/avatars/neon/avatar-neon-red_samurai.webp','epic'),
 ('avatar-neon-neon-dragon','اژدهای نئونی','اژدهای افسانه‌ای بنفش','avatar',225000,'/assets/cosmetics/avatars/neon/avatar-neon-neon_dragon.webp','legendary'),
 ('avatar-neon-dark-jester','دلقک تاریک','چهره مرموز نمایش آخرالزمان','avatar',150000,'/assets/cosmetics/avatars/neon/avatar-neon-dark_jester.webp','rare'),
 ('avatar-neon-royal-guard','محافظ سلطنتی','نگهبان تاج و تخت کاسپین','avatar',140000,'/assets/cosmetics/avatars/neon/avatar-neon-royal_guard.webp','rare'),
 ('avatar-neon-sea-witch','جادوگر دریا','افسونگر اعماق تاریک','avatar',170000,'/assets/cosmetics/avatars/neon/avatar-neon-sea_witch.webp','epic'),
 ('avatar-neon-horned-warlock','جادوگر شاخدار','فرمانروای طلسم‌های ممنوعه','avatar',210000,'/assets/cosmetics/avatars/neon/avatar-neon-horned_warlock.webp','legendary'),
 ('avatar-neon-ghost-oracle','پیشگوی شبح','پیشگوی ارواح در مه بنفش','avatar',180000,'/assets/cosmetics/avatars/neon/avatar-neon-ghost_oracle.webp','epic')
ON CONFLICT (id) DO UPDATE SET
 name=EXCLUDED.name, description=EXCLUDED.description, category='avatar',
 price_coins=EXCLUDED.price_coins, asset_url=EXCLUDED.asset_url,
 rarity=EXCLUDED.rarity, active=TRUE;
