# Fatal Cam: resumo para o pitch

Hackathon Atlas (Fatal Model), outubro de 2026.

## 1. Em uma frase

A Fatal Cam é uma câmera que grava, dentro dos pixels da foto, um selo invisível de origem verificada. Mesmo depois de um print.

## 2. O desafio

O diretor de produto da Atlas pediu soluções para aumentar a confiança de que a pessoa do anúncio é realmente a pessoa prometida.

- O mercado adulto já começa com pouca confiança por causa do estigma.
- O problema é maior que em marketplaces comuns (OLX, Mercado Livre, Amazon).

## 3. O que a Atlas já tem

- Documentoscopia no cadastro
- Autenticação facial
- Vídeo de verificação

## 4. O problema que atacamos

**A Atlas verifica a pessoa. Ninguém verifica a foto.**

Depois do cadastro, qualquer imagem pode entrar no anúncio:
- foto gerada com IA;
- foto real roubada de outra prestadora.

> [Inserir aqui uma fala real de acompanhante sobre foto roubada ou anúncio duplicado]

## 5. Por que não só um detector de IA?

- Perde precisão em imagem comprimida ou printada.
- Está sempre atrás dos geradores novos.
- Não pega foto real roubada.

A Fatal Cam prova a **origem** da foto no momento da captura, em vez de tentar adivinhar depois.

## 6. A solução

1. A prestadora tira a foto pela Fatal Cam.
2. A câmera grava um código invisível nos pixels da foto.
3. A foto sai com o selo: a olho nu, é igual à original.
4. Qualquer foto pode ser testada: se tem o código, aparece **"Verificado com segurança"**; se não tem, **"Código não encontrado"**.

O selo continua na foto mesmo depois de um print de tela.

## 7. Como funciona por dentro

- Marca d'água invisível **Adobe TrustMark**: open-source, licença MIT, uso comercial liberado.
- Grava até 8 caracteres nos pixels, com correção de erros.
- Segundo a Adobe, sobrevive a print, compressão JPEG, redimensionamento, corte de até ~20%, ruído, blur e mudança de cor.
- Na versão completa, o código gravado é o **ID do perfil verificado**: a foto carrega de qual perfil ela saiu.

## 8. Privacidade (LGPD)

- Na demo, tudo roda no navegador do celular.
- Nenhuma foto é enviada para servidor.
- Nada é guardado.
- A foto sai sem dados de localização (GPS).

## 9. Demo ao vivo

Página web: qualquer pessoa testa pelo celular, sem instalar nada.

1. **Tirar foto:** abre a câmera, grava o selo e baixa a foto.
2. **Testar foto:** escolhe uma foto da galeria e vê o resultado.
   - Foto da Fatal Cam (ou print dela): ✅ **Verificado com segurança**
   - Qualquer outra foto: ❌ **Código não encontrado**

> [Inserir QR code com o link publicado]

## 10. Fotos sem rosto: rastreabilidade, não identificação

Foto de corpo, de costas ou de detalhe não tem rosto para comparar, e não precisamos identificar quem está na foto.

- O selo significa **"origem verificada"**, não "corpo verificado".
- A verificação fica no perfil (documento + facial que a Atlas já faz), e a foto herda essa confiança.
- Fraude ganha responsável: se um perfil publicar o corpo de outra pessoa, não é golpe anônimo.

## 11. O que fica com a Atlas

A Fatal Cam é só a câmera. A Atlas decide o que fazer com o selo:
- mostrar o selo no anúncio;
- dar mais destaque para fotos com selo;
- bloquear foto com selo de outro perfil (foto roubada).

## 12. Limites (respostas prontas para o júri)

- **"Dá para remover a marca?"** Sim, com esforço e a ferramenta certa. Para o golpista comum, que só dá print, funciona.
- **"E se a pessoa fotografar outra pessoa?"** A foto fica atrelada ao perfil verificado dela. Tem documento e responsável.
- **"Foto sem selo é falsa?"** Não. Só não veio da Fatal Cam.
- **"Vocês guardam as fotos?"** Não. Tudo roda no celular da pessoa.

## 13. Fechamento

**A Atlas já verifica a pessoa. A Fatal Cam verifica a foto.**
