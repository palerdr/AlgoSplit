@echo off
echo Starting Split.AI API Server...
echo.
echo The server will be available at:
echo http://localhost:8000
echo.
echo Interactive API docs:
echo http://localhost:8000/docs
echo.
cd backend
..\venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
