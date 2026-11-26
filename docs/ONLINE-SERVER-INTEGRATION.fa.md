# مرکز اتصال مخزن آنلاین CASPIAN به سرور

این سند نقطه ورود واحد برای استقرار نسخه آنلاین در مخزن `Caspian-mafia/CASPIAN.anlain` و شاخه `main` است.

## اجزای یکپارچه‌شده در مخزن
1. سرور authoritative: `server.js` با Node.js، Express و Socket.IO.
2. ذخیره‌سازی پایدار: `persistence.js` و PostgreSQL؛ در نبود `DATABASE_URL` سرور از اجرا خودداری می‌کند.
3. تنظیمات میزبانی: `railway.json` با فرمان `npm start` و health check روی `/health`.
4. استقرار خودکار دستی: `.github/workflows/railway-deploy.yml`.
5. ساخت کلاینت Android آنلاین: `.github/workflows/android-online-apk.yml`.
6. راهنمای قدم‌به‌قدم: [DEPLOY-RAILWAY.fa.md](DEPLOY-RAILWAY.fa.md).

## ترتیب فعال‌سازی
- در Railway یک Project به نام CASPIAN بسازید.
- سرویس PostgreSQL را به همان Project اضافه کنید.
- سرویس برنامه را از همین مخزن و ریشه مخزن بسازید؛ نام سرویس باید دقیقاً `caspian-mafia-game` باشد.
- در Variables سرویس برنامه، `DATABASE_URL` را به متغیر داخلی PostgreSQL متصل کنید (نام مرجع مطابق نام واقعی سرویس دیتابیس باشد).
- مقدار محرمانه تصادفی حداقل ۳۲ نویسه‌ای برای `CASPIAN_ADMIN_KEY` تنظیم کنید.
- در Railway برای سرویس برنامه دامنه عمومی HTTPS ایجاد کنید.
- در GitHub مخزن → Settings → Secrets and variables → Actions:
  - Secret: `RAILWAY_TOKEN` = Project Token پروژه Railway.
  - Variable: `RAILWAY_SERVICE_NAME` = `caspian-mafia-game`.
- از Actions، گردش‌کار **Deploy CASPIAN server to Railway** را دستی اجرا کنید.
- دامنه را با `/health` بررسی کنید. تنها پاسخ `ok: true` و `storage: "postgresql"` به معنی آماده‌بودن سرور است.
- پس از موفقیت health check، GitHub Variable با نام `CASPIAN_SERVER_URL` و مقدار origin خالص HTTPS دامنه Railway را تنظیم کنید.
- سپس گردش‌کار **Build CASPIAN online Android APK** را اجرا کنید.

## متغیرهای محیطی
| نام | محل | توضیح |
|---|---|---|
| `DATABASE_URL` | Railway service | اتصال داخلی PostgreSQL |
| `CASPIAN_ADMIN_KEY` | Railway service | کلید محرمانه مدیر، حداقل ۳۲ نویسه |
| `PORT` | Railway | توسط پلتفرم تخصیص داده می‌شود |
| `RAILWAY_TOKEN` | GitHub Actions Secret | Project Token؛ هرگز در سورس ثبت نشود |
| `RAILWAY_SERVICE_NAME` | GitHub Actions Variable | باید `caspian-mafia-game` باشد |
| `CASPIAN_SERVER_URL` | GitHub Actions Variable | origin عمومی HTTPS برای APK |

## وضعیت واقعی
فایل‌های کد و گردش‌کار در مخزن ثبت شده‌اند؛ این موضوع به‌تنهایی به معنی ساخت Project، ایجاد دیتابیس، Deploy یا فعال‌شدن سرور نیست. تا زمانی که حساب Railway منابع را ایجاد کند، Secret/Variables تنظیم شوند و `/health` پاسخ سالم بدهد، سرور فعال اعلام نمی‌شود. نسخه Free Railway خوابیدن سرویس و محدودیت اعتبار دارد و برای بازی زنده دائمی تضمین uptime نیست.

## امنیت و آزمون پذیرش
توکن‌ها، رمز دیتابیس و کلید مدیر را در GitHub files، Issue یا چت قرار ندهید. قبل از انتشار عمومی، بازی هم‌زمان ۱۶ نفره، قطع و اتصال مجدد بازیکن، بازیابی اتاق از PostgreSQL، مجوز نقش‌ها، کنترل میزبان و رفتار Socket.IO باید آزمایش شوند.
