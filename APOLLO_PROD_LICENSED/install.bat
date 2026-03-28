@echo off
echo Installing FundCompare...
docker build -t fundcompare .
echo.
echo Installation complete!
echo To start, run: start.bat
pause
