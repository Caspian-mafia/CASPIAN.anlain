# استقرار آنلاین CASPIAN روی Railway

این مسیر جایگزین Render/Neon است و هر دو سرویس برنامه و PostgreSQL را در یک پروژه Railway نگه می‌دارد. تنظیمات مخزن برای Railway آماده است، اما ایجاد منابع ابری نیازمند ورود صاحب حساب Railway و تأیید هزینه/سهمیه است.

## محدودیت هزینه و پایداری
طبق صفحه رسمی قیمت Railway، پلن Free ماهانه فقط ۱ دلار اعتبار مصرف دارد؛ سرویس پس از چند دقیقه بی‌کاری می‌خوابد و درخواست بعدی آن را بیدار می‌کند. دیتابیس PostgreSQL نیز قابل ایجاد است، اما فضای ذخیره‌سازی رایگان محدود است. برای بازی زنده با Socket.IO و ۱۶ بازیکن، این پلن فقط آزمایش اولیه است و تضمین uptime یا ظرفیت تولیدی نیست. پیش از مصرف اعتبار، سقف مصرف/هشدار هزینه را تنظیم کنید.
منابع: https://railway.com/pricing و https://docs.railway.com/databases/postgresql

## ۱) ایجاد پروژه و PostgreSQL
1. وارد https://railway.com شوید و از مخزن GitHub، پروژه‌ای به نام CASPIAN بسازید یا یک پروژه خالی ایجاد کنید.
2. در Project Canvas روی **New** بزنید و **Database → PostgreSQL** را اضافه کنید.
3. در بخش Variables سرویس PostgreSQL، مقدار داخلی `DATABASE_URL` را بررسی کنید.
4. سرویس برنامه را از مخزن `Caspian-mafia/CASPIAN.anlain` اضافه کنید؛ Root Directory خالی و Build از ریشه مخزن باشد.
5. در Variables سرویس برنامه، `DATABASE_URL` را به متغیر مرجع PostgreSQL متصل کنید (معمولاً `${{Postgres.DATABASE_URL}}`؛ نام سرویس را مطابق نام واقعی دیتابیس جایگزین کنید).
6. این متغیرها را تنظیم کنید:
   - `PGSSLMODE=require` فقط اگر اتصال دیتابیس انتخابی SSL می‌خواهد؛ در Railway داخلی، ابتدا تنظیمات اتصال خود Railway را ملاک قرار دهید.
   - `CASPIAN_ADMIN_KEY`: یک مقدار تصادفی بلند و محرمانه.
7. نام سرویس برنامه را دقیقاً `caspian-mafia-game` بگذارید تا گردش‌کار آماده با آن منطبق باشد.
8. در Settings → Networking برای سرویس برنامه، یک دامنه عمومی Railway بسازید.

## ۲) اتصال GitHub Actions به Railway
1. در Railway به Project → Settings → Tokens بروید و یک **Project Token** برای محیط Production بسازید.
2. در GitHub مخزن → Settings → Secrets and variables → Actions → New repository secret، نام `RAILWAY_TOKEN` و مقدار Project Token را ثبت کنید.
3. در همان بخش Variables یک متغیر `RAILWAY_SERVICE_NAME` با مقدار `caspian-mafia-game` بسازید.
4. Actions → **Deploy CASPIAN server to Railway** → Run workflow را اجرا کنید.
5. گردش‌کار `railway up --ci` را اجرا می‌کند. لاگ و وضعیت را در Actions و Railway Deployments بررسی کنید.

## ۳) آزمون سلامت و ساخت APK
1. دامنه عمومی Railway را باز کنید و انتهای آن `/health` بگذارید.
2. فقط وقتی پاسخ JSON شامل `ok: true` و `storage: "postgresql"` بود ادامه دهید.
3. در GitHub → Settings → Secrets and variables → Actions → Variables، مقدار `CASPIAN_SERVER_URL` را برابر origin خالص HTTPS دامنه Railway قرار دهید؛ بدون `/health`.
4. Actions → **Build CASPIAN online Android APK** → Run workflow را اجرا کنید.
5. APK فقط پس از تأیید سلامت سرور PostgreSQL ساخته می‌شود و artifact با نام `CASPIAN-Online-Android-APK` قابل دریافت خواهد بود.

## امنیت
- هیچ توکن، رمز دیتابیس یا کلید مدیر را در کد، Issue، چت یا commit قرار ندهید.
- Project Token فقط در GitHub Secret ذخیره شود.
- پرداخت واقعی، پیامک و دامنه اختصاصی تا زمان تنظیم اعتبارنامه‌های رسمی و آزمون مستقل فعال تلقی نمی‌شوند.
- قبل از انتشار عمومی، آزمون هم‌زمان ۱۶ بازیکن، قطع/اتصال مجدد، بازیابی داده از PostgreSQL، مجوز نقش‌ها و کنترل میزبان الزامی است.
