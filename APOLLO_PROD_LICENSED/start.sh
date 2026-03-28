#!/bin/bash
echo "מפעיל FundCompare..."
echo "פתח את הדפדפן בכתובת: http://localhost:8000"
echo "לעצירה לחץ Ctrl+C"
docker run -p 8000:8000 -v fundcompare_data:/app/data fundcompare
