# FundCompare — הוראות התקנה והפעלה

## דרישות מוקדמות
- Docker מותקן על המחשב
  - Windows: https://docs.docker.com/desktop/install/windows-install/
  - Mac: https://docs.docker.com/desktop/install/mac-install/

## התקנה (פעם אחת)

פתח Terminal / Command Prompt, נווט לתיקייה הזו והרץ:

```bash
docker build -t fundcompare .
```

ההתקנה תיקח כמה דקות.

## הפעלה

```bash
docker run -p 8000:8000 -v fundcompare_data:/app/data fundcompare
```

הפקודה `-v fundcompare_data:/app/data` שומרת את נתוני הקהילה בין הפעלות — כך שהנתונים לא יימחקו כשעוצרים את התוכנה.

## שימוש

פתח את הדפדפן בכתובת:

**http://localhost:8000**

## עצירה

לחץ `Ctrl+C` בטרמינל

## הפעלה מחדש

פשוט הרץ שוב:
```bash
docker run -p 8000:8000 -v fundcompare_data:/app/data fundcompare
```

## בעיות?
צור קשר: amos.atia@tashkif1.co.il

## רישיון
גרסה זו בתוקף עד 30/04/2026
