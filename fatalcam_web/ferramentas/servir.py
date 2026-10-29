"""
Serve a pagina em HTTPS na rede local, para testar no celular (a camera so abre em HTTPS).

    python servir.py            -> https://<IP do PC>:8443

O certificado e autoassinado: o celular mostra um aviso, e preciso tocar em "Avancado > Continuar"
(Chrome) ou "Mostrar detalhes > visitar este site" (Safari). So para teste; na demo use o link
publicado (GitHub Pages ou Vercel), que ja tem HTTPS de verdade.
"""
import http.server
import shutil
import socket
import ssl
import subprocess
from functools import partial
from pathlib import Path

PORTA = 8443
PASTA = Path(__file__).resolve().parent.parent      # fatalcam_web/
CERT = Path(__file__).resolve().parent / "cert"     # fora da pasta publicada


def ip_local():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))  # nao envia nada, so descobre a interface da rede
        return s.getsockname()[0]
    finally:
        s.close()


def gerar_certificado():
    if (CERT / "cert.pem").exists():
        return
    openssl = shutil.which("openssl") or next(
        (p for p in [r"C:\Program Files\Git\usr\bin\openssl.exe", r"C:\Program Files\Git\mingw64\bin\openssl.exe"] if Path(p).exists()), None)
    if not openssl:
        raise SystemExit("Preciso do openssl para gerar o certificado (vem com o Git for Windows).")
    CERT.mkdir(exist_ok=True)
    subprocess.run([openssl, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "30",
                    "-keyout", str(CERT / "key.pem"), "-out", str(CERT / "cert.pem"),
                    "-subj", "/CN=fatalcam-local"], check=True, capture_output=True)


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".onnx": "application/octet-stream"}


gerar_certificado()
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(CERT / "cert.pem", CERT / "key.pem")
servidor = http.server.ThreadingHTTPServer(("0.0.0.0", PORTA), partial(Handler, directory=str(PASTA)))
servidor.socket = ctx.wrap_socket(servidor.socket, server_side=True)
print(f"No PC:      https://localhost:{PORTA}")
print(f"No celular: https://{ip_local()}:{PORTA}   (mesma rede Wi-Fi; aceite o aviso de certificado)")
servidor.serve_forever()
