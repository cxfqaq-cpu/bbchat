@echo off
cd /d "%~dp0server"

where npm >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装: https://nodejs.org/
  pause
  exit /b 1
)

if not exist node_modules (
  echo 正在安装依赖...
  call npm install
  if errorlevel 1 (
    echo 依赖安装失败
    pause
    exit /b 1
  )
)

echo.
echo ========================================
echo   bbchat 服务器
echo   浏览器打开: http://localhost:3000/index.html
echo   演示账号: demo / 123456
echo ========================================
echo.
call npm start
