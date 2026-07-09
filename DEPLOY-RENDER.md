# تعليقات رفع تطبيق WhatsApp على Render

**الرابط الحي:** https://whatsapp1-7sdw.onrender.com

> **مهم:** Render اقترح **Static Site** لأن المجلد فيه ملفات HTML/CSS/JS — لكن هذا **ليس** موقعاً ثابتاً.  
> التطبيق خادم **Python (FastAPI)** يحتاج API + Webhook + جدولة + قاعدة بيانات SQLite.

---

## ❌ لا تستخدم: New Static Site

| الحقل في Render | ما كتبه Render تلقائياً | لماذا خطأ |
|-----------------|-------------------------|-----------|
| Build Command | (فارغ) | لا يوجد build — يحتاج `pip install` |
| Publish Directory | `.` | ينشر HTML فقط بدون Python |
| النتيجة | صفحات بدون API | Webhook والجدولة لن تعمل |

**إذا نشرت Static Site:** الصفحات قد تفتح لكن `/api/*` و `/api/webhook/green` **لن يعملا**.

---

## ✅ الصح: New Web Service (Python)

### الطريقة 1 — Blueprint (الأسهل)

1. في Render: **New → Blueprint**
2. اربط المستودع `Nfyuji/whatsapp` (فرع `main`)
3. Render يقرأ `render.yaml` تلقائياً وينشئ:
   - Web Service اسمه `whatsapp-reports`
   - قرص دائم `/data` لحفظ SQLite

### الطريقة 2 — يدوياً (Web Service)

اذهب إلى: **New → Web Service** (وليس Static Site)

| الحقل | القيمة |
|-------|--------|
| **Name** | `whatsapp` أو `whatsapp-reports` |
| **Repository** | `Nfyuji/whatsapp` |
| **Branch** | `main` |
| **Root Directory** | *(اتركه فارغاً إذا المستودع = مجلد whatsapp فقط)* |
| **Runtime** | `Python 3` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `python server.py` |
| **Instance Type** | Free (للتجربة) |

---

## متغيرات البيئة (Environment Variables)

| NAME | VALUE | ملاحظة |
|------|-------|--------|
| `PORT` | *(لا تضعه يدوياً)* | Render يحقنه تلقائياً — `server.py` يقرأه |
| `DATABASE_PATH` | `/data/app.db` | **مطلوب** مع القرص الدائم |

> **Green API** لا تضعه في Environment Variables — يُحفظ من صفحة الإعدادات `/settings.html` داخل `config.json` على القرص.

---

## القرص الدائم (Disk) — ضروري

بدون قرص، بيانات الموظفين والردود **تُمسح** عند كل إعادة تشغيل.

| الإعداد | القيمة |
|---------|--------|
| **Name** | `whatsapp-data` |
| **Mount Path** | `/data` |
| **Size** | 1 GB |

---

## بعد النشر — خطوات الإعداد

1. افتح رابط التطبيق:  
   `https://whatsapp1-7sdw.onrender.com`

2. اذهب إلى **الإعدادات**:  
   `https://whatsapp1-7sdw.onrender.com/settings.html`

3. أضف:
   - **Green API** — `instance_id` + `api_token` + `api_host`
   - **رقم المدير** — لاستلام التقرير اليومي
   - **الموظفين** — الاسم + رقم WhatsApp
   - **الرسائل** — سؤال 7 مساءً، شكراً، ترويسة التقرير
   - **الجدولة** — 19:00 سؤال، 00:00 تقرير، UTC+3

4. في حقل **رابط السيرفر العام** ضع:  
   `https://whatsapp1-7sdw.onrender.com`

5. اضغط **ضبط Webhook** — يسجل في Green API:  
   `https://whatsapp1-7sdw.onrender.com/api/webhook/green`

6. فعّل **تشغيل الأتمتة** واحفظ.

---

## اختبار سريع

| الرابط | المتوقع |
|--------|---------|
| `/api/health` | `{"ok":true}` |
| `/analysis.html` | صفحة التحليل |
| `/reports.html` | إصدار التقارير |
| `/settings.html` | الإعدادات |

---

## ملاحظات Render (Free Plan)

- **Cold start:** السيرفر ينام بعد ~15 دقيقة بدون طلبات — أول فتح قد يأخذ 30–60 ثانية.
- **Webhook:** Green API يرسل POST للسيرفر — إذا كان نائماً قد تتأخر الردود التلقائية حتى يستيقظ.
- **الحل للإنتاج:** خطة مدفوعة (Always On) أو Cron خارجي يعمل ping كل 10 دقائق.
- **HTTPS:** Render يوفّره تلقائياً — استخدم `https://` في Webhook وليس `http://`.

---

## هيكل المستودع المتوقع

```
whatsapp/
├── server.py          ← نقطة التشغيل
├── requirements.txt
├── render.yaml        ← Blueprint
├── config.example.json
├── web/               ← HTML/JS (يُخدم عبر FastAPI StaticFiles)
│   ├── analysis.html
│   ├── reports.html
│   └── settings.html
└── data/              ← محلي فقط — على Render يُستخدم /data
```

---

## ملخص سريع

```
❌ Static Site  →  HTML فقط، بدون API
✅ Web Service  →  python server.py + Disk /data
✅ بعد النشر    →  settings.html → Green API → Webhook → تفعيل
```

---

## روابط مفيدة

- [Render Web Services](https://render.com/docs/web-services)
- [Render Persistent Disks](https://render.com/docs/disks)
- [Green API Webhook](https://green-api.com/en/docs/api/receiving/technology-webhook-endpoint/)
