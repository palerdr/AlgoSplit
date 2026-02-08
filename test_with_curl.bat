@echo off
echo Testing Split.AI API with your custom split...
echo.
echo Make sure the server is running first (run start_server.bat)
echo.

curl -X POST http://localhost:8000/api/analyze-split ^
  -H "Content-Type: application/json" ^
  -d @my_split.json

echo.
echo.
echo Test complete! Check the output above.
pause
