#!/bin/bash
echo "מתקין FundCompare..."
docker build -t fundcompare .
echo ""
echo "ההתקנה הושלמה!"
echo "להפעלה הרץ: ./start.sh"
