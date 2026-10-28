@echo off
chcp 65001 >nul
cd /d "%~dp0"
:: 取本机局域网 IPv4（跳过 127.* 和 169.254.*）
set "LANIP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } ^| Select-Object -First 1).IPAddress"`) do set "LANIP=%%i"

echo ==================================================
echo   立体时间轴 (Three.js r186 + TSL)
echo --------------------------------------------------
echo   本机:     http://localhost:8123/index.html
if defined LANIP echo   局域网:   http://%LANIP%:8123/index.html
echo   性能面板: 上面地址后面加 ?bench=1
echo --------------------------------------------------
echo   监听 0.0.0.0:8123（同一 Wi-Fi 下的手机/其他电脑可直接打开）
echo   关闭本窗口即停止服务
echo ==================================================
start "" http://localhost:8123/index.html
python -m http.server 8123 --bind 0.0.0.0
