# Teleprompter — app pessoal

Teleprompter profissional para gravar vídeos olhando para a câmera enquanto lê o
roteiro de forma natural. Feito para uso pessoal, **mobile-first (iPhone / Safari)**,
funciona offline depois de instalado e guarda tudo no próprio aparelho.

Sem cadastro, sem login, sem servidor, sem envio de dados para fora.

---

## O que já está pronto e funcionando

| Área | Recursos |
|---|---|
| **Roteiros** | criar, colar texto, editar, salvar automático (nunca perde o texto), buscar, duplicar, excluir, backup anti‑perda (rascunho) |
| **Marcações** | `**negrito**`, `*itálico*`, `==destaque==`, `[PAUSA 1s]` (0,5 / 1 / 1,5 / 2 / 3 / personalizada), `[RESPIRAR]`, `[SORRIR]`, `[ÊNFASE]`, `[OLHAR PARA A CÂMERA]`, `[MAIS DEVAGAR]`, `[MAIS RÁPIDO]`, `[TOM DE PERGUNTA]` e qualquer `[INSTRUÇÃO]` livre |
| **Contagem** | palavras (ignora marcações e pausas), duração estimada (inclui as pausas), ppm configurável (130–170 ou personalizado) |
| **Teleprompter** | tela cheia, zona de leitura ajustável (olhos perto da câmera), fonte/peso/espaçamento/largura/alinhamento/contraste, tema claro/escuro |
| **Ritmo** | presets 0,5×–1,5×, slider fino, mudança de velocidade ao vivo, contagem regressiva ao iniciar |
| **Pausas** | quando o texto chega em `[PAUSA]`, a rolagem congela pelo tempo exato e mostra a contagem, depois continua sozinha |
| **Controles ao vivo** | ▶/⏸, voltar/avançar **frase**, voltar/avançar **5s** e **10s**, voltar/avançar **parágrafo**, −/+ velocidade, recomeçar |
| **Gestos** | toque = mostra/oculta controles · toque duplo = play/pause · deslizar ↑/↓ = velocidade · deslizar ←/→ = frase. Controles somem sozinhos após alguns segundos |
| **Modo ensaio** | tempo decorrido, restante, progresso, ppm em tempo real, palavras; ao terminar mostra Duração / Palavras / ppm médio |
| **Modo espelho** | inverte o texto na horizontal para vidro de teleprompter |
| **Câmera** | pré‑visualização da câmera frontal atrás do texto (opcional); gravação com áudio **quando o navegador suporta** (ver limitações) |
| **Acompanhar a voz** | *experimental* — o texto tenta seguir a sua fala; se não for confiável, volta sozinho para o modo velocidade |
| **PWA** | instalável na Tela de Início, ícone próprio, standalone, funciona offline |
| **Configurações** | tudo acima é salvo e reaplicado automaticamente em todos os roteiros |

Não há botão falso: se aparece na tela, funciona. Recursos que dependem do
aparelho/navegador só aparecem quando o navegador realmente os oferece.

---

## Como instalar no iPhone (recomendado)

O app precisa estar disponível por um endereço **HTTPS**. Escolha uma opção:

### Opção A — Hospedar de graça (mais simples e definitivo)

1. Crie um repositório no GitHub e envie a pasta `teleprompter/`.
2. Em **Settings → Pages**, ative o Pages apontando para a branch (`/root`).
3. Abra o endereço gerado (algo como `https://SEU-USUARIO.github.io/teleprompter/`) no **Safari** do iPhone.
4. Toque em **Compartilhar** (ícone de caixa com seta) → **Adicionar à Tela de Início** → **Adicionar**.
5. Abra pelo ícone novo. Ele abre em tela cheia, sem a barra do Safari.

Alternativas equivalentes: Netlify Drop (arraste a pasta em `app.netlify.com/drop`),
Cloudflare Pages, Vercel. Qualquer hospedagem de site estático serve.

### Opção B — Testar na mesma rede (temporário, sem instalar)

No seu computador (Windows), dentro da pasta `teleprompter/`:

```bash
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Isso abre `http://localhost:8080`. No computador funciona tudo, **menos** o modo
offline (o Service Worker exige HTTPS ou localhost). Para abrir no iPhone pela
rede local use o IP do PC (`http://192.168.x.x:8080`) — porém o iOS **não instala
como PWA nem funciona offline** por HTTP simples; use a Opção A para o uso real.

> Depois de instalado pela Opção A, o app **abre e funciona sem internet**:
> lista de roteiros, edição, teleprompter, ensaio, pausas, espelho — tudo local.

---

## Fluxo de uso

1. Abrir o app → **+ Novo roteiro** (ou escolher um salvo).
2. Escrever/colar o texto. Inserir pausas e marcações pela barra do editor. Salva sozinho.
3. Voltar e tocar no roteiro → entra direto no **teleprompter** em tela cheia.
4. Ajustar a **zona de leitura** para a linha destacada ficar bem embaixo da câmera frontal.
5. Tocar em ▶ (com contagem regressiva). Começar a falar.
6. O texto sobe no seu ritmo; nas `[PAUSA]` ele espera; nas marcações aparece a instrução discreta.
7. Errou uma frase? **Voltar frase** (botão, ou deslizar o dedo para a esquerda) e continuar.
8. Ao final: **Vídeo finalizado — Duração / Palavras / ppm médio**.

---

## Limitações reais do iPhone / Safari (sem enrolação)

| Recurso | Situação no iPhone |
|---|---|
| **Tela cheia total** | O iPhone **não tem** API de fullscreen no Safari. A “tela cheia” real vem de instalar como PWA (modo standalone). Por isso a Opção A é importante. |
| **Manter a tela acesa** | Funciona no iOS **16.4+** (Wake Lock), pedido ao tocar em ▶. Em versões antigas a tela pode apagar — aí deixe o *Bloqueio automático* do iPhone em “Nunca” durante a gravação. |
| **Travar orientação** | O Safari do iPhone **não** deixa o site travar a orientação. A interface se adapta a retrato e paisagem, mas quem trava é você (Central de Controle). |
| **Acompanhar a voz** | O reconhecimento de voz da Web no Safari/iOS é **instável**: exige internet, pede permissão de microfone, corta sozinho com frequência e às vezes não funciona dentro do PWA. Por isso é **experimental** e **opcional** — o teleprompter funciona 100% sem ele, no modo velocidade. Se falhar, o app volta sozinho para o modo velocidade. |
| **Câmera + gravação juntas** | A pré‑visualização da câmera frontal atrás do texto **funciona** no iOS 15+. A **gravação** (`MediaRecorder`) só aparece se o Safari da sua versão suportar; quando grava, a qualidade é menor que a do app Câmera nativo e o arquivo sai em `.mp4`/`.webm` para você salvar manualmente. |
| **Salvar o vídeo gravado** | O PWA não salva direto no Rolo da Câmera. O app te dá o arquivo para salvar em Arquivos/Fotos. |
| **Recomendação para vídeo profissional** | Use **dois aparelhos**: grave com a câmera do iPhone (ou câmera dedicada) e use este app em outro aparelho como teleprompter na frente da lente. Ou use o modo espelho com um vidro de teleprompter. O modo câmera embutido é ótimo para Reels/TikTok rápidos. |

### O que funciona offline
Tudo o que é local: abrir o app, lista de roteiros, criar/editar/salvar, buscar,
teleprompter, pausas, ensaio, espelho, todas as configurações.

### O que depende do navegador / precisa de permissão ou internet
- **Acompanhar a voz** — microfone + internet (experimental).
- **Modo câmera / gravação** — permissão de câmera (e microfone ao gravar).
- **Manter a tela acesa** — Wake Lock (iOS 16.4+).
- **Instalação e modo offline** — precisam de HTTPS (hospedagem).

---

## Armazenamento e privacidade

- Roteiros: **IndexedDB** no aparelho, com queda automática para `localStorage` se o
  IndexedDB não estiver disponível.
- Preferências: `localStorage`.
- O app pede **armazenamento persistente** para o iOS não apagar os dados.
- Nada é enviado para servidores. Nenhuma API externa é usada.
- **Backup manual:** Configurações → *Exportar roteiros* gera um arquivo `.json`.
  *Importar roteiros* lê esse arquivo de volta. Faça isso de vez em quando — o iOS
  pode limpar o armazenamento de um PWA que fica semanas sem ser aberto.

---

## Estrutura do código (modular, fácil de manter)

```
index.html            # shell + registro do service worker
manifest.webmanifest  # PWA: nome, ícones, standalone
sw.js                 # cache offline do app
serve.ps1             # servidor local só para testar no computador
css/app.css           # todo o estilo (tema claro/escuro, safe areas, prompter)
js/store.js           # armazenamento (IndexedDB + fallback) e preferências
js/parse.js           # interpretação do roteiro: pausas, marcações, contagem, duração
js/app.js             # rotas + telas: início, editor, configurações
js/prompter.js        # motor do teleprompter, ensaio, câmera, voz
icons/                # ícones do app (PNG + SVG)
```

Sem build, sem dependências, sem framework. É só copiar a pasta para qualquer
hospedagem estática.

---

## Se um dia quiser virar app nativo iOS

O caminho mais direto é **empacotar este mesmo código** com Capacitor
(`@capacitor/ios`): a interface e a lógica continuam iguais, e você ganha:

- tela cheia e **travar orientação** de verdade;
- **manter a tela acesa** sem depender da versão do iOS;
- reconhecimento de voz nativo (`SFSpeechRecognizer`), muito mais confiável que o da Web,
  inclusive **offline** em português — resolveria de vez o “acompanhar a voz”;
- gravação de vídeo em qualidade nativa e **salvar direto no Rolo da Câmera**;
- distribuição via TestFlight (sem precisar publicar na App Store).

O que precisaria ser trocado: a camada `js/store.js` (opcionalmente para SQLite),
e adicionar plugins nativos para voz/câmera/orientação. O resto (`parse.js`,
`prompter.js`, `app.js`, CSS) é reaproveitado como está.

Uma reescrita 100% nativa (SwiftUI) só compensa se o teleprompter virar produto —
para uso pessoal, o PWA (ou PWA + Capacitor) entrega a mesma experiência.
