"""
Exporta o encoder e o decoder do TrustMark (modelo Q) para ONNX, para rodar no navegador.
Roda uma vez so; os .onnx gerados vao em ../modelos e sao publicados junto com a pagina.

    pip install trustmark onnx onnxruntime   (no Windows: PYTHONUTF8=1 antes do pip)
    python exportar_onnx.py
"""
from pathlib import Path

import torch
from trustmark import TrustMark

SAIDA = Path(__file__).resolve().parent.parent / "modelos"


class Encoder(torch.nn.Module):
    """capa (1,3,256,256) em [-1,1] + segredo (1,100) -> residuo (1,3,256,256) sem desvio de cor.
    Mesmo calculo do TrustMark.encode() antes de redimensionar o residuo para o tamanho da foto."""

    def __init__(self, enc):
        super().__init__()
        self.enc = enc

    def forward(self, capa, segredo):
        stego, _ = self.enc(capa, segredo)
        residuo = stego.clamp(-1, 1) - capa
        return residuo - residuo.mean(dim=(2, 3), keepdim=True)


class Decoder(torch.nn.Module):
    """imagem (1,3,245,245) em [-1,1] -> logits (1,100); bit = logit > 0"""

    def __init__(self, dec):
        super().__init__()
        self.dec = dec

    def forward(self, imagem):
        return self.dec.decoder(imagem)


tm = TrustMark(verbose=False, model_type="Q", loadRemover=False)
SAIDA.mkdir(exist_ok=True)
torch.onnx.export(Encoder(tm.encoder).eval(), (torch.zeros(1, 3, 256, 256), torch.zeros(1, 100)),
                  SAIDA / "encoder_Q.onnx", input_names=["capa", "segredo"], output_names=["residuo"],
                  opset_version=17, dynamo=False)
torch.onnx.export(Decoder(tm.decoder).eval(), (torch.zeros(1, 3, 245, 245),),
                  SAIDA / "decoder_Q.onnx", input_names=["imagem"], output_names=["bits"],
                  opset_version=17, dynamo=False)
for f in SAIDA.glob("*.onnx"):
    print(f.name, round(f.stat().st_size / 1e6, 1), "MB")


# ---------------------------------------------------------------- pesos em fp16
# Os .ckpt originais ja sao fp16; o export sai em fp32 (130 MB). Guardamos os pesos em fp16 com um
# Cast para fp32 na frente: o calculo continua em fp32 (o WASM do navegador nao roda conv em fp16)
# e o download cai pela metade.
import numpy as np
import onnx
from onnx import helper, numpy_helper

for nome in ("encoder_Q.onnx", "decoder_Q.onnx"):
    m = onnx.load(SAIDA / nome)
    g = m.graph
    novos_ini, casts = [], []
    for ini in g.initializer:
        if ini.data_type == onnx.TensorProto.FLOAT and len(ini.dims) > 0 and np.prod(ini.dims) > 16:
            arr = numpy_helper.to_array(ini).astype(np.float16)
            novos_ini.append(numpy_helper.from_array(arr, ini.name + "_f16"))
            casts.append(helper.make_node("Cast", [ini.name + "_f16"], [ini.name], to=onnx.TensorProto.FLOAT))
        else:
            novos_ini.append(ini)
    del g.initializer[:]
    g.initializer.extend(novos_ini)
    nos = list(g.node)
    del g.node[:]
    g.node.extend(casts + nos)
    onnx.save(m, SAIDA / nome)
    print(nome, "fp16:", round((SAIDA / nome).stat().st_size / 1e6, 1), "MB")
