# FundCompare

## דרישות
- Docker מותקן על המחשב

## הפעלה ראשונה

```bash
docker build -t fundcompare .
docker run -p 8000:8000 fundcompare
```

פתח דפדפן בכתובת: **http://localhost:8000**

## הפעלות חוזרות

```bash
docker run -p 8000:8000 fundcompare
```

## שמירת נתוני קהילה בין הפעלות (אופציונלי)

```bash
docker run -p 8000:8000 -v "$(pwd)/community.json:/app/community.json" fundcompare
```

## עצירה

Ctrl+C בטרמינל
