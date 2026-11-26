# معماری قطعی نسخه آنلاین CASPIAN

## مرجع واحد
این مخزن تنها خط توسعه آنلاین است. سرور Node.js + Express + Socket.IO همراه PostgreSQL مرجع قطعی بازی است. کلاینت‌ها هیچ وضعیت بازی یا کیف پولی را به‌صورت مستقل تولید نمی‌کنند.

## کلاینت وب
- فایل‌های بازیکن در `public/` قرار دارند.
- Socket.IO و REST API از همان origin صفحه بارگیری می‌شوند.
- مسیرهای API نسبی `/api` و اتصال realtime از همان origin استفاده می‌کنند.
- Service Worker فقط پوسته عمومی را cache می‌کند؛ API و Socket.IO نباید cache شوند.

## Android
- پروژه native در `android-native/` فقط WebView امن دارد.
- `MainActivity` مقصد را از BuildConfig.CASPIAN_SERVER_URL می‌خواند.
- Gradle بدون یک origin تمیز HTTPS build را رد می‌کند.
- دسترسی file/content و mixed-content خاموش است؛ فقط host سرور اصلی در WebView مجاز است.
- در نبود اینترنت، فقط پیام خطای اتصال نمایش داده می‌شود؛ موتور بازی آفلاین/ربات وجود ندارد.

## داده و پایداری
- PostgreSQL اجباری است؛ server.js باید بدون DATABASE_URL از شروع سرویس خودداری کند.
- `persistence.js` migrationهای schema اصلی، پلتفرم، مدیریت و امکانات اجتماعی/تولد را اجرا می‌کند.
- هیچ secret واقعی در مخزن قرار نمی‌گیرد.

## استقرار
- Render blueprint در `render.yaml` نمونه استقرار آزمایشی است؛ ایجاد سرویس، افزودن PostgreSQL و secrets باید در حساب میزبانی انجام شود.
- دامنه باید DNS و TLS معتبر داشته باشد.
- `/health` باید `ok: true` و `storage: "postgresql"` برگرداند.
- متغیر GitHub Actions: `CASPIAN_SERVER_URL` فقط origin عمومی HTTPS.
- workflow ساخت APK ابتدا سلامت سرور و PostgreSQL را بررسی می‌کند، سپس تست‌ها و Gradle build را اجرا می‌کند.

## معیار پذیرش قبل از فعال‌سازی
1. CI تست‌های Node موفق باشد.
2. PostgreSQL پایدار و migrationها موفق باشند.
3. endpoint سلامت از اینترنت عمومی تأیید شود.
4. APK آنلاین با origin واقعی ساخته و روی Android نصب شود.
5. دو دستگاه با اینترنت مستقل وارد یک اتاق شوند و تغییر فاز/رأی/پیام را همگام ببینند.
6. reconnect، احراز هویت، مجوز نقش و میزبان، و عدم افشای نقش آزمایش شوند.
7. فروشگاه، کیف پول، جایزه و پرداخت جداگانه با محیط sandbox و سپس credentials production آزموده شوند.

تا وقتی این شواهد موجود نیست، مخزن آماده استقرار می‌تواند باشد، اما سرویس عمومی و نسخه نهایی آنلاین فعال اعلام نمی‌شود.
