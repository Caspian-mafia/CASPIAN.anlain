# CASPIAN — بازی آنلاین چندنفره

این مخزن، مرجع اصلی سورس نسخه آنلاین CASPIAN است.

## تصمیم‌های قطعی
- تنها موتور بازی، موتور آنلاین سمت سرور Node.js + Express + Socket.IO + PostgreSQL است.
- وب/PWA و Android فقط کلاینت همین سرورند؛ هیچ نقش، رأی، کنش شب، نتیجه، کیف پول یا جایزه‌ای در کلاینت تعیین نمی‌شود.
- موتور بازی آفلاین و بازی با ربات‌ها لغو شده است و در این مخزن/نسخه انتشار وجود ندارد.
- Android یک WebView امن از رابط آنلاین `public/` است و فقط به HTTPS origin سرور وصل می‌شود.
- بدون سرور عمومی سالم و PostgreSQL، APK آنلاین ساخته نمی‌شود و نسخه فعال اعلام نمی‌گردد.

## ساختار
- `server.js`, `rules-engine.js`, `scenario-runtime.js`: سرور و موتور authoritative.
- `public/`: رابط بازیکن، PWA، صدا، فروشگاه و دارایی‌ها.
- `database/`: schema و migrationها.
- `data/scenarios.json`: داده سناریوها (بدون موتور آفلاین).
- `android-native/`: پوسته Android آنلاین.
- `docs/PROJECT-DECISIONS.fa.md`: مرجع تصمیم‌های قطعی.
- `.github/workflows/`: آزمون‌ها و ساخت APK آنلاین.

## توسعه سرور
نیازمند Node.js 20+ و PostgreSQL است. مقادیر واقعی فقط در محیط امن میزبانی قرار می‌گیرند.

```sh
npm install
npm test
DATABASE_URL='postgresql://…' npm start
```

سلامت سرویس باید از مسیر `/health` با `ok: true` و `storage: "postgresql"` تأیید شود.

## Android
ساخت APK فقط با `CASPIAN_SERVER_URL` (origin عمومی HTTPS سالم) انجام می‌شود. مقدار را در GitHub → Settings → Secrets and variables → Actions → Variables تعریف کنید. workflow قبل از ساخت APK سلامت سرور و PostgreSQL را بررسی می‌کند.

## وضعیت انتشار
وجود سورس یا فایل Render blueprint به معنی استقرار سرور نیست. دامنه/DNS/TLS، PostgreSQL، SMS، پرداخت، امضای release و آزمون چنددستگاهی باید جداگانه پیکربندی و تأیید شوند. APK debug با نسخه release امضاشده فروشگاه متفاوت است.
