# Fatal Cam: contexto do projeto

> Projeto para o Hackathon da Atlas (empresa do Fatal Model), outubro de 2026.
> Este arquivo é o contexto central do projeto. Leia antes de mexer no código.

## Em uma frase

A Fatal Cam é uma câmera que grava, dentro dos pixels da foto, o perfil verificado de onde ela saiu. Mesmo depois de um print.

## O desafio da Atlas

O diretor de produto da Atlas pediu soluções para aumentar a confiança de que a pessoa do anúncio é realmente a pessoa prometida. O mercado adulto já parte de baixa confiança por causa do estigma, então o problema é maior que em marketplaces comuns (OLX, Mercado Livre, Amazon).

**O que a Atlas já tem:** documentoscopia no cadastro, autenticação facial e vídeo de verificação (a prestadora grava um vídeo mostrando o corpo).

**Regras da entrega:**
- Protótipo funcionando, não pitch.
- Qualquer ferramenta (Claude, Lovable etc.).
- A solução precisa ser embasada no que a equipe viu e ouviu (conversas com acompanhantes).

## O problema que atacamos

A Atlas verifica a pessoa. Ninguém verifica a foto. Depois do cadastro, qualquer imagem pode entrar no anúncio: foto gerada com IA ou foto real roubada de outra prestadora.

Detector de IA sozinho não resolve: perde precisão em imagem comprimida ou printada, vive atrás dos geradores novos e não pega foto real roubada. Por isso a Fatal Cam prova a **origem** no momento da captura.

## Escopo

**A Fatal Cam é só uma câmera.** Ela tira a foto (ou recebe uma foto da galeria), grava a marca d'água invisível (TrustMark) com o ID do perfil e o nível do selo, e devolve a foto marcada. Nada mais.

### Níveis do selo

| Nível | Origem | Como entra |
|---|---|---|
| **1** | Foto tirada na hora pela câmera da Fatal Cam | `/cam?perfil=<ID>` |
| **2** | Foto que a prestadora já tinha, enviada da galeria | `/cam?perfil=<ID>&nivel=2` |

A Fatal Cam só grava o nível. A prioridade no ranking (nível 1 acima do 2) é decisão da Atlas.

Fica com a Atlas (fora do nosso código):
- Análise do conteúdo das fotos da galeria (duplicadas, IA, C2PA/SynthID). A Fatal Cam só marca a foto e recusa a que já tem selo de outro perfil
- Banco de mídias, perfis, ranking por nível e selo no anúncio
- Bloqueio de upload quando o ID lido não bate com o perfil
- Proteção contra remoção da marca

**LGPD:** nenhuma imagem é armazenada. Nada em disco, nada em banco. A foto existe só em memória durante a requisição.

## Fluxo

1. A Atlas abre a Fatal Cam com o ID do perfil na URL: `/cam?perfil=<ID>`.
2. Sem `perfil` válido na URL: tela "Abra a Fatal Cam pelo seu anúncio" e a câmera não abre.
3. Nível 1: a câmera abre (`<input capture>` no celular), sem opção de galeria. Nível 2 (`&nivel=2`): abre a galeria.
4. A foto vai para `POST /marcar` (perfil_id + nivel + foto). Antes de marcar, o backend lê a foto:
   - selo de **outro** perfil: recusa com 409 "Esta foto já tem selo do perfil X" (foto roubada);
   - selo do **mesmo** perfil: também recusa com 409 ("Use a foto que você já baixou"). Foto com selo já foi usada;
   - sem selo: grava nível + ID com TrustMark e devolve a foto marcada em JPEG, sem salvar.
   O bloqueio vale para foto inteira e para print dela.
5. Tela final: prévia da foto marcada, botão "Baixar foto" e o selo "Selo nível 1 · Foto tirada na hora" ou "Selo nível 2 · Foto da galeria".

Para provar a marca: `POST /ler` recebe uma imagem (pode ser print) e devolve `{"perfil": "<ID>", "nivel": 1|2}` ou `{"perfil": null, "nivel": null}`.

## A marca d'água por dentro

- Ferramenta: **Adobe TrustMark**, open-source, licença MIT, uso comercial liberado. Roda em CPU. Modelo `Q`.
- O payload é **nível + ID do perfil**, nada pessoal. Ex.: `1A01`. Modo texto guarda 61 bits = 8 caracteres: 1 para o nível e **até 7 para o ID** (letras maiúsculas e números, `^[A-Z0-9]{1,7}$`).
- Fotos marcadas antes do nível existir (payload só `A01`) não são mais lidas.
- O formato fixo também filtra falso positivo: no teste da fase 1, uma foto sem marca "achou" texto lixo. O `/ler` só devolve o ID se o payload estiver no formato `^[12][A-Z0-9]{1,7}$`.
- Validado na fase 1: um print de tela cheia no celular devolveu o ID certo.
- Sobrevive (segundo a Adobe): print, compressão JPEG, redimensionamento, corte de até ~20% da área, ruído, blur, mudança de cor.- A foto sai em **resolução cheia** (limite de 4096 px só para arquivos gigantes) e em **JPEG qualidade 95** sem subamostragem de cor: ~1-2 MB, contra ~20 MB em PNG. A marca continua legível, inclusive em print. A redução antiga para 2048 px era a principal perda de qualidade.
- A foto sai sem EXIF, então a localização GPS não vaza.

## Fotos sem rosto: rastreabilidade, não identificação

Foto de corpo, de costas ou de detalhe não tem rosto para comparar, e **não precisamos identificar quem está na foto**. A Fatal Cam registra de qual perfil verificado a foto saiu. A verificação fica no perfil (documento + facial que a Atlas já faz) e a foto herda essa confiança.

- O selo significa **"origem verificada"**, não "corpo verificado".
- Foto marcada com o perfil A não pode ser reaproveitada no perfil B sem que a Atlas saiba, mesmo se for print.
- Fraude ganha responsável: se o perfil A publicar o corpo de outra pessoa, não é golpe anônimo.

## Arquitetura do protótipo

Um único servidor FastAPI serve a API e as páginas (HTML puro, sem build).

```
fatalcam_api/
  main.py              POST /marcar, POST /ler, páginas
  paginas/atlas.html   MOCK do anúncio da Atlas (será substituído pela Atlas)
  paginas/cam.html     câmera (nível 1) ou galeria (nível 2) + download
  paginas/ler.html     upload de print, ID e nível lidos
```

| Peça | Na demo | Observação |
|---|---|---|
| Marca d'água (TrustMark) | Real | Precisa funcionar com print de verdade |
| Captura pela câmera | Real | `input capture`; no computador cai no seletor de arquivos (não dá para bloquear) |
| Nível do selo | Real, mas declarado pelo navegador | O servidor não consegue provar que uma foto de nível 1 veio da câmera; num app nativo dá |
| Página da Atlas (`/atlas`) | Mock | Perfil fake "Prestadora A", ID `A01`, botões de nível 1 e nível 2 |

## Como rodar

```
cd fatalcam_api
pip install -r requirements.txt        # no Windows: PYTHONUTF8=1 antes do pip
uvicorn main:app --host 0.0.0.0 --port 8000
```

No celular, na mesma rede Wi-Fi do PC: `http://<IP do PC>:8000/atlas`.

Modo dev sem TrustMark: `FATALCAM_FAKE=1`. A "marca" vai nos metadados do PNG e **não sobrevive a print**. Nunca usar na demo.

## Critério de pronto

Abrir `/atlas`, clicar no botão, tirar a foto, baixar, tirar print do arquivo no celular, subir o print em `/ler` e ver `A01`.

**Validado em 28/10/2026** com foto e print reais no celular, usando o TrustMark de verdade. Isso foi antes dos níveis; o formato novo (`1A01`) foi testado só com print simulado no PC. Falta repetir no celular.

## Limites (respostas prontas para o júri)

- **"Dá para remover a marca?"** Sim, com esforço e a ferramenta certa. Para o golpista comum, que só dá print, funciona. Proteção contra remoção fica com a Atlas.
- **"E se a pessoa fotografar outra pessoa?"** A foto fica atrelada ao perfil verificado dela. Tem documento e responsável. O selo é de origem, não de corpo.
- **"Foto sem marca é falsa?"** Não. Só não veio da Fatal Cam.
- **"Vocês guardam as fotos?"** Não. A foto passa pela memória do servidor e volta marcada. Nada em disco, nada em banco.
- **"Por que não só um detector de IA?"** Perde precisão em imagem comprimida, vive atrás dos geradores novos e não pega foto real roubada.

## Pendências

- Embasamento: pelo menos uma fala real de acompanhante sobre foto roubada ou anúncio duplicado.

## Decisões

- **A marca grava o ID do perfil**, não um ID aleatório por foto. Decidido em 28/10/2026.
- **Foto que já tem selo é bloqueada**, inclusive do próprio perfil. Decidido em 28/10/2026.
- **Dois níveis de selo:** 1 = câmera na hora, 2 = galeria. Nível gravado no 8º caractere da marca; ID com até 7. Sem hash perceptual. Decidido em 28/10/2026.
- **Sem prova de vida na Fatal Cam.** A câmera abre direto. Decidido em 28/10/2026.
- **Testes extras de robustez ficam fora** (WhatsApp, foto pequena dentro de outra tela, foto da tela). O critério de pronto com print real no celular basta para a demo.

## Fontes

- TrustMark FAQ: https://opensource.contentauthenticity.org/docs/tm-faq
- Configuring TrustMark: https://opensource.contentauthenticity.org/docs/trustmark/python/config
- Fala do diretor de produto da Atlas na abertura do hackathon
