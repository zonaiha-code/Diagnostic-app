@echo off
echo Creating Diagnostic System Backend Project...

cd C:\Users\Admin\Desktop
mkdir diagnostic-system-backend 2>nul
cd diagnostic-system-backend

echo {
echo   "name": "diagnostic-system-backend",
echo   "version": "1.0.0",
echo   "description": "Complete Backend API for Diagnostic System Web App",
echo   "main": "server.js",
echo   "scripts": {
echo     "start": "node server.js",
echo     "dev": "nodemon server.js",
echo     "test": "jest --coverage"
echo   },
echo   "dependencies": {
echo     "express": "^4.18.2",
echo     "sqlite3": "^5.1.6",
echo     "sqlite": "^5.1.1",
echo     "bcryptjs": "^2.4.3",
echo     "jsonwebtoken": "^9.0.2",
echo     "cors": "^2.8.5",
echo     "dotenv": "^16.3.1"
echo   },
echo   "devDependencies": {
echo     "nodemon": "^3.0.1",
echo     "jest": "^29.7.0"
echo   }
echo } > package.json

echo.
echo Project created successfully at: C:\Users\Admin\Desktop\diagnostic-system-backend
echo.
echo Next steps:
echo 1. cd C:\Users\Admin\Desktop\diagnostic-system-backend
echo 2. npm install
echo 3. npm run dev
pause