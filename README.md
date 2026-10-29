# Fatal Cam

Câmera que grava, dentro dos pixels da foto, um selo invisível de origem verificada. Mesmo depois de um print.

Projeto para o Hackathon da Atlas (Fatal Model), outubro de 2026.

## Pastas

| Pasta / arquivo | O que é |
|---|---|
| [`fatalcam_web/`](fatalcam_web/) | **Demo da apresentação.** Página estática: tirar foto com selo e testar se uma foto tem o selo. Tudo roda no navegador do celular, nada é enviado. |
| [`fatalcam_api/`](fatalcam_api/) | Protótipo anterior, com servidor Python (FastAPI) e ID do perfil + nível do selo. |
| [`CONTEXTO.md`](CONTEXTO.md) | Contexto completo do projeto e decisões. |
| [`PITCH-RESUMO.md`](PITCH-RESUMO.md) | Resumo da ideia para montar os slides. |

## Como funciona a marca

Usa o [Adobe TrustMark](https://github.com/adobe/trustmark) (MIT), modelo Q. Na demo web, os modelos foram exportados para ONNX ([`exportar_onnx.py`](fatalcam_web/ferramentas/exportar_onnx.py)) e a lógica do TrustMark foi portada para JavaScript ([`marca.js`](fatalcam_web/marca.js)), rodando com o onnxruntime-web.

## Rodar a demo localmente

```
python fatalcam_web/ferramentas/servir.py
```

Abra `https://localhost:8443` no PC, ou `https://<IP do PC>:8443` no celular (mesma rede; aceite o aviso de certificado de teste). A câmera só funciona em HTTPS.

## Publicar

A pasta `fatalcam_web/` é um site estático, sem build:

- **Vercel:** `cd fatalcam_web` e `npx vercel --prod`
- **GitHub Pages:** publicar a pasta `fatalcam_web/` (por exemplo, via GitHub Actions ou num repositório só com ela).
