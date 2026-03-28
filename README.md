# Apollo - מדריך Docker

---

## לבעל התוכנה (אתה) — בנייה וייצוא

### שלב 1 — בנה את ה-Image

פתח **Terminal / PowerShell** בתיקייה זו:

```bash
docker build -t apollo .
```

הבנייה לוקחת כ-3-5 דקות (מורידה Node + Python, מקמפלת React + Python).

### שלב 2 — ייצא ל-קובץ לשיתוף

```bash
docker save apollo -o apollo-image.tar
```

נוצר קובץ `apollo-image.tar` — **שלח רק את הקובץ הזה לחבר**, לא את תיקיית הקוד.

---

## לחבר (מקבל התוכנה) — הרצה

### דרישות: Docker Desktop מותקן ופעיל

הורד מ: https://www.docker.com/products/docker-desktop/

### שלב 1 — טען את ה-Image (פעם אחת בלבד)

```bash
docker load -i apollo-image.tar
```

### שלב 2 — הפעל

```bash
docker run -d --name apollo-app -p 8000:8000 -v apollo-data:/app/community.json apollo
```

### שלב 3 — פתח בדפדפן

```
http://localhost:8000
```

---

## פקודות שימושיות

| פעולה | פקודה |
|--------|---------|
| הפסק | `docker stop apollo-app` |
| הפעל מחדש | `docker start apollo-app` |
| לוגים | `docker logs apollo-app` |
| מחק ובנה מחדש | `docker rm -f apollo-app && docker run -d --name apollo-app -p 8000:8000 -v apollo-data:/app/community.json apollo` |

---

## הערות

- התוכנה פעילה עד **30 באפריל 2026** (גרסת ניסיון)
- לאחר תאריך זה תוצג הודעה ברורה על פקיעת הרישיון
- לרכישת רישיון מלא — פנה לבעל התוכנה
