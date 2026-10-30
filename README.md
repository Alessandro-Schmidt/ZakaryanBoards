# Belvedere

Editor de vision boards feito para **imprimir de verdade** — A4, A3, pôster — e também para wallpaper de celular, iPad e desktop. Visual inspirado no Liquid Glass da Apple, com 8 paletas de cores para escolher em **Aparência** (Aurora é a padrão).

## O que dá para fazer

- **Formatos reais**: A4, A3, A5, Carta, Pôster 50×70, Quadrado 30×30, iPhone, Android, iPad, Desktop, Instagram 4:5, Stories 9:16 ou tamanho personalizado (mm ou px), em retrato ou paisagem.
- **Cor de fundo** com paleta pronta ou qualquer cor.
- **Arrastar imagens de outra aba** (ou do computador) direto para a página. Elas também entram na biblioteca **Imagens**, que é compartilhada entre todos os boards.
  - Se algum site bloquear o arrasto, clique com o botão direito → *Copiar imagem* e cole com `⌘V` / `Ctrl+V`.
- **Editar imagens** sem perder a original (cada edição vira uma nova versão):
  - **Cortar**: livre ou nas proporções 1:1, 4:5, 3:4, 2:3, 3:2, 16:9, 9:16 e original.
  - **Laço**: contorne só o objeto (por exemplo, só o carro) para mantê-lo ou apagá-lo.
  - **Remover fundo (IA)**: separa o objeto do fundo automaticamente, direto no navegador.
  - **Apagar / Restaurar**: pincel para refinar o recorte.
- **Montar o board**: mover, redimensionar, girar (com encaixe nos ângulos), encaixe no centro e nas bordas, camadas, opacidade, cantos arredondados, sombra, espelhar, preencher a página, textos com fontes elegantes.
- **Exportar**: PDF no tamanho exato da página (150 ou 300 dpi), PNG ou JPG. O botão **Imprimir** abre o PDF pronto para a impressora.
- **Galeria** com todos os boards: abrir, renomear, duplicar, apagar. Tudo é salvo automaticamente.
- Desfazer/refazer (`⌘Z` / `⇧⌘Z`), duplicar (`⌘D`), apagar (`⌫`), mover com as setas (`⇧` = 10 px).

## Rodando localmente

```bash
npm install
npm run dev
```

Abra http://localhost:5173.

## Publicando (GitHub Pages)

O workflow `.github/workflows/deploy.yml` publica o site a cada push na `main`. Para ativar uma vez: **Settings → Pages → Source: GitHub Actions**.

## Onde ficam os dados

Boards e imagens ficam salvos **no navegador** (IndexedDB) do dispositivo em que foram criados — nada vai para servidor. Limpar os dados do site apaga os boards.

## Tecnologia

React + TypeScript + Vite, [Konva](https://konvajs.org/) para o canvas, [jsPDF](https://github.com/parallax/jsPDF) para PDF e [@imgly/background-removal](https://github.com/imgly/background-removal-js) para a remoção de fundo (o modelo de IA é baixado da CDN da IMG.LY no primeiro uso e fica em cache). Atenção: essa biblioteca é AGPL-3.0, o que não é problema para uso pessoal, mas pede cuidado se o projeto virar produto.
