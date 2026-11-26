# راه‌اندازی آزمایشی رایگان CASPIAN

این راهنما برای آزمایش آنلاین است، نه تضمین سرویس production. سرویس رایگان Render ممکن است در زمان بی‌کاری متوقف شود و شروع مجدد آن تأخیر داشته باشد.

## اجزای لازم
- یک Web Service رایگان Render از همین مخزن.
- یک PostgreSQL رایگان/آزمایشی بیرونی مانند Neon؛ Render blueprint عمداً رمز دیتابیس را داخل GitHub قرار نمی‌دهد.
- HTTPS عمومی Render؛ دامنه اختصاصی را بعد از فعال‌شدن ثبت و DNS متصل کنید.

## ۱. ساخت PostgreSQL
1. در ارائه‌دهنده PostgreSQL یک پروژه و دیتابیس بسازید.
2. connection string مخصوص Node/PostgreSQL را بردارید؛ باید SSL را پشتیبانی کند.
3. آن را فقط در بخش Environment سرویس Render با نام `DATABASE_URL` قرار دهید.
4. مقدار `PGSSLMODE=require` را تنظیم کنید.

## ۲. ساخت سرویس Render
1. وارد Render شوید و New → Blueprint انتخاب کنید.
2. مخزن عمومی `Caspian-mafia/CASPIAN.anlain` را متصل کنید.
3. فایل `render.yaml` را تأیید کنید.
4. سرویس `caspian-mafia-game` را ایجاد کنید.
5. متغیرهای لازم را در داشبورد Render تکمیل کنید:
   - `DATABASE_URL`: connection string دیتابیس.
   - `PGSSLMODE=require`.
   - `CASPIAN_ADMIN_KEY`: یک مقدار تصادفی قوی که فقط در داشبورد ذخیره می‌شود.
6. منتظر پایان Deploy بمانید و URL ساخته‌شده `onrender.com` را بردارید.

## ۳. آزمون سلامت
آدرس زیر را باز کنید:

`https://YOUR-SERVICE.onrender.com/health`

پاسخ مورد انتظار:
- `ok: true`
- `storage: "postgresql"`

اگر خطا دیدید، APK نسازید؛ ابتدا لاگ Render و اتصال PostgreSQL را اصلاح کنید.

## ۴. اتصال APK آنلاین
در مخزن GitHub:
1. Settings → Secrets and variables → Actions → Variables.
2. متغیر `CASPIAN_SERVER_URL` را بسازید.
3. مقدار آن فقط origin HTTPS سرویس سالم باشد؛ مثلاً `https://YOUR-SERVICE.onrender.com`، بدون مسیر `/health`.
4. Actions → Build CASPIAN online Android APK → Run workflow.
5. فقط پس از موفقیت workflow، artifact `CASPIAN-Online-Android-APK` را دریافت کنید.

## ۵. دامنه اختصاصی
پس از فعال‌شدن و پرداخت دامنه، DNS را طبق مقصدی که Render نمایش می‌دهد تنظیم و TLS را فعال کنید. سپس `CASPIAN_SERVER_URL` را به origin دامنه تغییر دهید و APK تازه بسازید.

## نکات امنیتی
- رمز دیتابیس، کلید مدیر، کلید پیامک، کلید پرداخت و کلید امضای Android را در چت یا GitHub commit نکنید.
- پرداخت واقعی و SMS تا زمان دریافت اعتبارنامه‌های رسمی و آزمون end-to-end غیرفعال بمانند.
- سرویس رایگان خواب‌دار، نسخه تست است؛ برای انتشار عمومی پایدار باید میزبان و پایگاه داده پایدار و backup داشته باشید.
