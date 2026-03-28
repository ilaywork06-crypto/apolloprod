@echo off
echo Starting FundCompare...
echo Open browser at: http://localhost:8000
echo Press Ctrl+C to stop
docker run -p 8000:8000 -v fundcompare_data:/app/data fundcompare
