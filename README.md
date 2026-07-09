# WhatsApp Daily Reports — نظام مستقل

تطبيق منفصل لإرسال سؤال يومي للموظفين عبر WhatsApp (Green API) وجمع الردود وإرسال تقرير للمدير.

## الصفحات

| الصفحة | الرابط |
|--------|--------|
| التحليل | `/analysis.html` |
| إصدار التقارير | `/reports.html` |
| الإعدادات | `/settings.html` |

## التشغيل المحلي

```bash
cd whatsapp
copy config.example.json config.json   # Windows
# عدّل config.json — Green API

start.bat
# أو: python server.py
```

يفتح على: **http://localhost:8090**

**الإنتاج (Render):** https://whatsapp1-7sdw.onrender.com

## الرفع على Render

1. ارفع مجلد `whatsapp/` كمستودع أو subdirectory
2. استخدم `render.yaml` المرفق
3. بعد النشر: افتح `/settings.html`
4. أضف Green API + رابط السيرفر العام
5. اضغط **ضبط Webhook**

Webhook: `https://whatsapp1-7sdw.onrender.com/api/webhook/green`

## الجدولة

- **19:00** — سؤال «ماذا أنجزت اليوم؟»
- **عند الرد** — «شكراً لكم» تلقائياً
- **00:00** — تقرير المدير

## المتطلبات

- Python 3.10+
- حساب Green API
- رقم WhatsApp لكل موظف
