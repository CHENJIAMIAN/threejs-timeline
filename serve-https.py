#!/usr/bin/env python3
"""
局域网 HTTPS 静态服务（本工程专用）
------------------------------------------------------------------
为什么需要它：Chrome 只把 https:// 和 localhost 当作**安全上下文**，
局域网 IP 走 http:// 时 navigator.gpu 直接不存在 → WebGPU 拿不到，
three 只能退回 WebGL2 后端（能跑，但不是这份工程的完整形态）。

用法：
    python serve-https.py            # → https://<局域网IP>:8443/
    python serve-https.py 9443       # 换端口

证书是本目录 .certs/dev.crt（自签），浏览器会提示「不安全」，
点「高级 → 继续前往」即可；自签 HTTPS 仍然是安全上下文，WebGPU 正常可用。
"""
import http.server
import os
import socket
import ssl
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8443
CERT = os.path.join(".certs", "dev.crt")
KEY = os.path.join(".certs", "dev.key")


class Handler(http.server.SimpleHTTPRequestHandler):
    """开发用：禁缓存（改完 src/*.js 刷新即可见），日志精简。"""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))


def lan_ips():
    ips = []
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith(("127.", "169.254.")) and ip not in ips:
                ips.append(ip)
    except Exception:
        pass
    if not ips:
        # 兜底：连一下外网看默认出口 IP（不会真的发数据）
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("223.5.5.5", 80))
            ips.append(s.getsockname()[0])
        except Exception:
            pass
        finally:
            s.close()
    return ips


if __name__ == "__main__":
    if not (os.path.exists(CERT) and os.path.exists(KEY)):
        sys.exit(f"缺少证书：{CERT} / {KEY}（用 openssl req -x509 ... 生成，SAN 要含本机局域网 IP）")

    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(certfile=CERT, keyfile=KEY)

    httpd = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)

    print("=" * 58)
    print("  立体时间轴 · HTTPS（WebGPU 可用）")
    print("-" * 58)
    print(f"  本机:     https://localhost:{PORT}/index.html")
    for ip in lan_ips():
        print(f"  局域网:   https://{ip}:{PORT}/index.html")
    print(f"  性能面板: 地址后加 ?bench=1")
    print("-" * 58)
    print("  自签证书会提示「不安全」→ 高级 → 继续前往（之后 WebGPU 正常）")
    print("  Ctrl+C 停止")
    print("=" * 58)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
