@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "LANIP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } ^| Select-Object -First 1).IPAddress"`) do set "LANIP=%%i"

echo ==================================================
echo   立体时间轴 · HTTPS 服务
echo --------------------------------------------------
echo   本机:     https://localhost:8443/index.html
if defined LANIP echo   局域网:   https://%LANIP%:8443/index.html
echo   性能面板: 地址后面加 ?bench=1
echo --------------------------------------------------
echo   自签证书 -> 浏览器提示「不安全」时点 高级 - 继续前往
echo   只有 HTTPS 才是安全上下文，WebGPU 才会启用
echo   关闭本窗口即停止服务
echo ==================================================
start "" "https://localhost:8443/index.html"
python serve-https.py
