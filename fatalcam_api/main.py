"""
Fatal Cam: a camera que grava na foto o perfil de onde ela saiu.

Rodar:
    pip install -r requirements.txt
    uvicorn main:app --host 0.0.0.0 --port 8000
    No celular (mesma rede Wi-Fi): http://<IP do PC>:8000/atlas

Paginas:
    GET  /atlas           MOCK do anuncio da Atlas (sera substituido pela Atlas)
    GET  /cam?perfil=ID           camera ao vivo -> selo nivel 1
    GET  /cam?perfil=ID&nivel=2   foto da galeria -> selo nivel 2
    GET  /ler             upload de um print para mostrar o ID lido

Rotas:
    POST /marcar   perfil_id + nivel + foto  -> JPEG marcado em resolucao cheia, direto na resposta
    POST /ler      imagem                    -> {"perfil": "<ID>", "nivel": 1|2} ou {"perfil": null, "nivel": null}

Niveis do selo (a prioridade no ranking e decisao da Atlas):
    1 = foto tirada na hora pela camera da Fatal Cam
    2 = foto ja existente, enviada da galeria

Nada e salvo: nem imagem, nem banco. A foto existe so em memoria durante a requisicao.

Modo sem TrustMark (para quem vai mexer so no front e nao quer baixar o modelo):
    FATALCAM_FAKE=1 uvicorn main:app --reload
    A "marca" vai nos metadados do PNG. NAO sobrevive a print. Nunca usar na demo.
"""
import io
import os
import re
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse, Response
from PIL import Image, ImageOps, PngImagePlugin

PAGINAS = Path(__file__).parent / "paginas"
FAKE = os.getenv("FATALCAM_FAKE") == "1"

# O modo texto do TrustMark guarda 61 bits = 8 caracteres no maximo.
# Payload = nivel (1 caractere) + ID do perfil (ate 7). Ex: "1A01".
# O formato fixo tambem filtra falso positivo: foto sem marca as vezes "acha" texto lixo.
ID_VALIDO = re.compile(r"^[A-Z0-9]{1,7}$")
PAYLOAD_VALIDO = re.compile(r"^([12])([A-Z0-9]{1,7})$")
# Foto de celular (12 MP, 4000 px) passa em resolucao cheia; o limite so barra arquivos gigantes.
MAX_LADO = 4096
# JPEG 95 sem subamostragem de cor: ~1-2 MB em resolucao cheia (PNG daria ~20 MB) e a marca
# continua legivel, inclusive em print. Sai sem EXIF, entao a localizacao GPS da foto nao vaza.
QUALIDADE_JPEG = 95


# ---------------------------------------------------------------- marca d'agua
class MarcaTrustMark:
    def __init__(self):
        from trustmark import TrustMark
        self.tm = TrustMark(verbose=False, model_type="Q")

    def gravar(self, im: Image.Image, payload: str) -> Image.Image:
        return self.tm.encode(im, payload)

    def ler(self, im: Image.Image):
        segredo, achou, _ = self.tm.decode(im)
        return segredo if achou else None


class MarcaFake:
    """Simula a marca nos metadados do PNG. So para desenvolver o front."""

    def gravar(self, im, payload):
        im = im.copy()
        im.info["fatalcam"] = payload
        return im

    def ler(self, im):
        return im.info.get("fatalcam")


marca = MarcaFake() if FAKE else MarcaTrustMark()


def foto_em_memoria(im: Image.Image) -> tuple[bytes, str]:
    """Devolve (bytes, media_type) da foto marcada."""
    buf = io.BytesIO()
    if FAKE:
        # a marca fake mora nos metadados do PNG; JPEG a perderia
        meta = PngImagePlugin.PngInfo()
        meta.add_text("fatalcam", im.info.get("fatalcam", ""))
        im.save(buf, "PNG", pnginfo=meta)
        return buf.getvalue(), "image/png"
    im.save(buf, "JPEG", quality=QUALIDADE_JPEG, subsampling=0)
    return buf.getvalue(), "image/jpeg"


async def abrir_imagem(arquivo: UploadFile) -> Image.Image:
    try:
        im = Image.open(io.BytesIO(await arquivo.read()))
        info = dict(im.info)
        im = ImageOps.exif_transpose(im).convert("RGB")  # foto de celular vem deitada sem isso
        im.info.update(info)  # preserva metadado do modo fake
        return im
    except Exception:
        raise HTTPException(400, "arquivo nao e uma imagem valida")


# ---------------------------------------------------------------- app
app = FastAPI(title="Fatal Cam API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def ler_selo(im: Image.Image):
    """Devolve (perfil, nivel) gravados na foto, ou (None, None)."""
    m = PAYLOAD_VALIDO.match((marca.ler(im) or "").strip())
    return (m.group(2), int(m.group(1))) if m else (None, None)


@app.post("/marcar")
async def marcar(perfil_id: str = Form(...), nivel: int = Form(1), foto: UploadFile = File(...)):
    """Grava nivel + ID do perfil nos pixels e devolve a foto marcada. Nao salva nada."""
    if not ID_VALIDO.match(perfil_id):
        raise HTTPException(400, "perfil_id invalido: use ate 7 letras maiusculas ou numeros")
    if nivel not in (1, 2):
        raise HTTPException(400, "nivel invalido: use 1 (camera) ou 2 (galeria)")
    im = await abrir_imagem(foto)

    # foto que ja tem selo ja foi usada: bloqueia, seja de outro perfil ou do proprio
    dono, _ = ler_selo(im)
    if dono and dono != perfil_id:
        raise HTTPException(409, f"Esta foto já tem selo do perfil {dono}. Ela não pode ser usada de novo.")
    if dono:
        raise HTTPException(409, "Esta foto já tem selo do seu perfil. Use a foto que você já baixou.")

    im.thumbnail((MAX_LADO, MAX_LADO))
    dados, tipo = foto_em_memoria(marca.gravar(im, f"{nivel}{perfil_id}"))
    return Response(dados, media_type=tipo)


@app.post("/ler")
async def ler(imagem: UploadFile = File(...)):
    """Le o perfil e o nivel gravados na foto (funciona com print). Nao salva nada."""
    perfil, nivel = ler_selo(await abrir_imagem(imagem))
    return {"perfil": perfil, "nivel": nivel}


# ---------------------------------------------------------------- paginas
@app.get("/")
def inicio():
    return RedirectResponse("/atlas")


@app.get("/atlas")
def pagina_atlas():
    return FileResponse(PAGINAS / "atlas.html")


@app.get("/cam")
def pagina_cam():
    return FileResponse(PAGINAS / "cam.html")


@app.get("/ler")
def pagina_ler():
    return FileResponse(PAGINAS / "ler.html")
