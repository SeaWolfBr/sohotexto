# Justext → Creator Repurpose Tool: Estudo Completo de Produto

**Branch:** `feature/creator-repurpose-mvp`
**Data:** 2026-04-10
**Versão do estudo:** 1.0

---

## Resumo Executivo

O Justext hoje é uma ferramenta funcional, limpa e rápida que extrai transcrições de vídeos do YouTube. A base técnica é sólida (Node.js puro, ~294 linhas de servidor, fallback duplo de extração, i18n automático, rate limiting por IP) e a interface é elegante no estilo DeepMind/Gemini — minimalista, centrada no input, sem ruído.

A proposta é evoluir de **"ferramenta de transcrição"** para **"ferramenta que transforma vídeos em conteúdo reaproveitável"** — mantendo a simplicidade radical como diferencial competitivo.

As três novas funcionalidades (resumo estruturado, conteúdo para redes, títulos/hooks/ângulos) serão alimentadas por um LLM (Claude API) a partir da transcrição já extraída. A transcrição continua sendo a base do pipeline, mas o valor percebido sobe dramaticamente: de "texto limpo" para "conteúdo pronto para usar".

O modelo de monetização recomendado é **freemium com créditos**: transcrição gratuita ilimitada (aquisição), funcionalidades de IA com 3-5 usos grátis/dia (conversão), plano pago por uso ou mensal (receita). A funcionalidade com maior potencial de monetização é **conteúdo pronto para redes sociais**.

---

## FASE 0 — Diagnóstico da Aplicação Atual

### Estrutura Geral do Projeto

```
sohotexto-repo/
├── server.mjs              # Servidor HTTP puro (294 linhas)
├── lib/
│   └── youtube-transcript.mjs  # Extração de transcrição (389 linhas)
├── static/
│   ├── index.html          # Página única (91 linhas)
│   ├── app.css             # Estilos (435 linhas)
│   └── app.js              # Lógica cliente (209 linhas)
├── deploy/
│   ├── nginx/sohotexto.conf
│   └── systemd/sohotexto.service
├── docs/preview.svg
├── package.json            # 1 dependência: youtube-transcript
├── Dockerfile
├── railway.json
└── render.yaml
```

**Total de código próprio: ~1.418 linhas.** Projeto extremamente enxuto.

### Fluxo Principal Atual

1. Usuário abre a página → vê hero com título + input de URL
2. Cola URL do YouTube → clica "transcrever"
3. Frontend POST `/api/transcribe` com `{ url }`
4. Backend: valida URL → extrai videoId → busca transcrição (library fallback + HTML scraping) → limpa texto → retorna JSON
5. Frontend: exibe título do vídeo, metadados (idioma, segmentos), transcrição limpa em textarea
6. Usuário pode copiar ou exportar .txt

### O Que Está Bem Resolvido (MANTER)

| Aspecto | Detalhe |
|---------|---------|
| **Extração de transcrição** | Fallback duplo robusto (library + HTML scraping de ytInitialPlayerResponse) |
| **Limpeza de texto** | Dedup, normalização, quebra inteligente em parágrafos (3 sentenças ou 320+ chars) |
| **Design visual** | Estilo DeepMind: tipografia Manrope, tokens de espaço, pill inputs, botões com micro-animações, paleta neutra com boa legibilidade |
| **Simplicidade do fluxo** | 1 input, 1 ação, 1 resultado — zero distração |
| **i18n** | Detecção automática por navigator.language (pt/en), sem dependências |
| **Rate limiting** | Sliding window por IP, in-memory, sem deps externas |
| **Arquitetura de servidor** | Zero framework, zero middleware, AppError tipado, JSON response padronizado |
| **Export** | Nomes de arquivo com data + slug do título, download direto de .txt |
| **Footer discreto** | Crédito de autor sem poluir |

### O Que Está Limitado (AJUSTAR)

| Aspecto | Limitação | Evolução necessária |
|---------|-----------|---------------------|
| **Resultado único** | Só transcrição — alto esforço de input para pouco output | Múltiplos outputs a partir do mesmo input |
| **Sem processamento inteligente** | Texto limpo mas "bruto" — sem interpretação | LLM para resumo, extração, geração |
| **Sem persistência** | Resultado existe só na sessão do navegador | Para monetização, será preciso algum estado |
| **Uma rota API** | Só `/api/transcribe` | Novas rotas para resumo, social posts, hooks |
| **Sem autenticação** | Removida por design — mas monetização exigirá identificação | Token anônimo ou conta leve |
| **package.json desatualizado** | Ainda menciona bcryptjs no script hash:password, description diz "Private" | Limpar |
| **CSS residual** | `.auth-card` ainda no media query | Limpar |
| **brand-subtitle** | Diz "youtube transcript" — posicionamento antigo | Atualizar para novo posicionamento |

### Análise de Reaproveitamento

**Técnico — 100% reaproveitável:**
- `lib/youtube-transcript.mjs` inteiro (é o motor do produto)
- `server.mjs`: estrutura HTTP, rate limiter, body parser, static serving, AppError
- `app.js`: sistema de i18n, helpers (parseJson, setStatus, downloadContent), padrão de elementos

**Visual — 95% reaproveitável:**
- Tokens CSS (cores, espaçamento, sombras)
- Tipografia (Manrope, clamp sizes, letter-spacing)
- Componentes: botões (.primary, .ghost), input pill, status indicator, topbar/brand
- Layout: hero centrado, result section below
- **Único ajuste:** adicionar sistema de tabs/sections para múltiplos outputs

### Lista Consolidada

**MANTER:**
- Motor de extração de transcrição inteiro
- Estilo visual DeepMind/minimalista
- Fluxo single-input (cola URL, clica 1 botão)
- i18n por navigator.language
- Rate limiting por IP
- Arquitetura sem framework
- Hero centrado como entry point

**AJUSTAR:**
- brand-subtitle: de "youtube transcript" para novo posicionamento
- Headline e copy do hero: expandir proposta de valor
- Resultado: de textarea única para múltiplas seções de output
- API: adicionar rota(s) para processamento via LLM
- package.json: limpar description e scripts legados
- CSS: remover `.auth-card` residual

**CRIAR:**
- Integração com LLM (Claude API) no backend
- Endpoint `/api/process` ou expansão do `/api/transcribe`
- UI de tabs/sections para outputs múltiplos
- Sistema de créditos/uso (para monetização)
- Strings de i18n para novas funcionalidades

**ADIAR:**
- Autenticação/contas de usuário
- Payment gateway (BTC Lightning ou Stripe)
- Histórico de transcrições
- Suporte a outras plataformas (Spotify, podcasts)
- Dashboard de uso

---

## FASE 1 — Posicionamento Estratégico

### De "transcrição" para "reaproveitamento"

**Posicionamento atual:**
> "Ferramenta que extrai transcrições limpas de vídeos do YouTube"

**Posicionamento proposto:**
> "Ferramenta que transforma vídeos do YouTube em conteúdo pronto para usar"

A diferença é sutil mas poderosa:
- **Antes:** o output é texto. Você ainda precisa fazer algo com ele.
- **Depois:** o output é conteúdo utilizável. O trabalho já foi feito.

### Promessa Central

> **"Cole uma URL. Receba conteúdo pronto."**

A transcrição passa a ser infraestrutura invisível (como o motor de um carro — está lá, funciona, mas ninguém compra o carro pelo motor). O que o usuário vê são os outputs finais: resumo, posts, hooks.

### Proposta de Headline e Subheadline

**PT:**
- **Headline:** "Transforme vídeos do YouTube em conteúdo pronto"
- **Subheadline:** "Resumo, posts para redes sociais e ideias de conteúdo — tudo extraído automaticamente de qualquer vídeo."

**EN:**
- **Headline:** "Turn YouTube videos into ready-to-use content"
- **Subheadline:** "Summary, social media posts and content ideas — all extracted automatically from any video."

### Justificativa Estratégica

1. **Mercado de transcrição é comoditizado.** YouTube já oferece transcrição nativa. O valor não está no texto bruto — está na interpretação.
2. **Creators são o público com maior disposição a pagar.** Eles produzem conteúdo diariamente e precisam de volume. Economia de tempo tem valor monetário direto.
3. **O custo marginal do upgrade é baixo.** A transcrição já é extraída — passar pelo LLM adiciona custo de API (~$0.01-0.05 por vídeo) mas multiplica o valor percebido em 10x.
4. **Simplicidade como diferencial.** Descript, Castmagic, OpusClip são complexos e caros. Existe espaço para "a ferramenta que faz isso rápido e sem complicação".

---

## FASE 2 — Encaixe das Novas Funcionalidades

### Princípio de Design

**O fluxo de input não muda.** O usuário continua colando uma URL e clicando um botão. A mágica acontece no output: em vez de uma textarea com texto bruto, ele recebe múltiplas seções de conteúdo processado.

### Padrão de Interface Recomendado: Seções Empilhadas com Tabs Leves

Não tabs pesadas (que escondem conteúdo), não accordions (que exigem cliques extras), não cards soltos (que dispersam). A recomendação é:

**Tab bar horizontal simples** no topo da área de resultado, com 4 abas:
1. **Transcrição** (ícone: texto) — o que existe hoje
2. **Resumo** (ícone: lista) — resumo estruturado
3. **Social** (ícone: compartilhar) — posts prontos
4. **Ideias** (ícone: lâmpada) — títulos, hooks, ângulos

Cada tab mostra seu conteúdo na mesma área, sem scroll lateral. O tab ativo é a aba que o usuário clicou por último, com **"Resumo" como default** (maior valor percebido imediato).

**Por que este padrão:**
- Preserva a verticalidade limpa do layout atual
- Não polui — mesma área, mesmo espaço
- Progressive disclosure natural: o conteúdo está lá, o usuário navega quando quiser
- Familiar: é o padrão de ferramentas como Notion, Linear, Arc

### Funcionalidade 1: Resumo Estruturado

**Onde aparece:** Tab "Resumo" (default após processamento)
**Como é ativado:** Automaticamente junto com a transcrição (single click = tudo processado)
**Formato de exibição:**
```
📌 Pontos principais
• [bullet 1]
• [bullet 2]
• [bullet 3-5]

📝 Resumo
[2-3 parágrafos com o conteúdo condensado]

🏷️ Tópicos abordados
tag1 · tag2 · tag3 · tag4
```
**Reutilização:** área de resultado (.result), botões copiar/exportar, eyebrow + title
**Novo:** formatação com markdown leve (bullets, headers), área de tags

### Funcionalidade 2: Conteúdo para Redes Sociais

**Onde aparece:** Tab "Social"
**Como é ativado:** Junto com tudo (mesmo clique)
**Formato de exibição:**
```
𝕏 Twitter/X
[Post 1 - até 280 chars]
[Post 2 - thread opener]
                                        [copiar]

📸 Instagram
[Caption com emojis e hashtags]
                                        [copiar]

💼 LinkedIn
[Post profissional, 3-4 parágrafos]
                                        [copiar]
```
**Reutilização:** botão copiar (já existe a lógica), container de texto
**Novo:** sub-seções por rede social, botão copiar individual por bloco

### Funcionalidade 3: Títulos, Hooks e Ângulos

**Onde aparece:** Tab "Ideias"
**Como é ativado:** Junto com tudo
**Formato de exibição:**
```
🎯 Títulos alternativos
1. [título 1]
2. [título 2]
3. [título 3]

🪝 Hooks de abertura
• [hook 1 — frase de impacto para os primeiros 3 segundos]
• [hook 2]
• [hook 3]

🔄 Ângulos de conteúdo
• [ângulo 1: "esse vídeo pode virar um post sobre X"]
• [ângulo 2: "esse vídeo pode virar uma thread sobre Y"]
• [ângulo 3]
```
**Reutilização:** container, botões
**Novo:** lista numerada/bullets formatados, sensação de "brainstorm automático"

### Hierarquia de Informação

| Prioridade | Tab | Justificativa |
|------------|-----|---------------|
| 1ª (default) | Resumo | Maior valor imediato — "entendi o vídeo em 10 segundos" |
| 2ª | Social | Maior valor comercial — "já tenho posts prontos" |
| 3ª | Ideias | Valor de diferenciação — "nunca vi isso em outro lugar" |
| 4ª | Transcrição | Base técnica — creators usam pouco diretamente |

### Fluxo Pós-processamento

```
[Usuário cola URL] → [Clica "transformar"] → [Loading: "analisando vídeo..."]
                                                        ↓
                                            [Resultados aparecem]
                                            [Tab bar: Resumo | Social | Ideias | Transcrição]
                                            [Tab Resumo ativo por default]
                                                        ↓
                                            [Usuário navega entre tabs]
                                            [Cada tab tem botão copiar/exportar próprio]
```

**Tempo percebido:** A transcrição é rápida (~2-5s). O processamento LLM adiciona ~5-15s. Para mitigar:
- Mostrar a transcrição imediatamente (já funciona hoje)
- Processar resumo/social/hooks em paralelo via LLM
- Usar streaming se possível (mostrar texto aparecendo)
- Loading state por tab: "gerando resumo..." com animação sutil

---

## FASE 3 — Benchmark e Tendências Aplicáveis

### 1. Descript (descript.com)

| Aspecto | Análise |
|---------|---------|
| **Proposta** | Editor de vídeo/podcast text-first — "edite mídia como edita um documento" |
| **Comunicação** | Hero com headline bold + demo em vídeo. Social proof pesado (logos de empresas). |
| **Organização** | Mega-produto: editor, transcrição, screen recording, IA, publicação. Navegação complexa com mega-menus. |
| **Fluxo** | Upload → transcrição automática → edição no texto = edição no vídeo |
| **Multi-features** | Tabs por feature no site, mas o produto em si é um editor completo — tudo numa tela |
| **Upgrade** | Free tier generoso → limite de horas de transcrição → planos $24-33/mês |
| **Inspiração** | A ideia de "texto como interface principal" é poderosa. |
| **NÃO copiar** | Complexidade. Descript é um editor profissional — o oposto do que Justext deve ser. |

### 2. Castmagic (castmagic.io)

| Aspecto | Análise |
|---------|---------|
| **Proposta** | "Turn media into ready-to-use content" — upload áudio/vídeo, recebe posts, newsletters, show notes |
| **Comunicação** | Hero direto: headline de transformação + lista de outputs. CTA "Try free". |
| **Organização** | Home limpa → demo do workflow → lista de outputs possíveis → pricing |
| **Fluxo** | Upload/URL → transcrição → IA gera N outputs customizáveis |
| **Multi-features** | Outputs como "magic outputs" — templates que o usuário pode customizar |
| **Upgrade** | Free com limites → Starter $23/mês → Pro $49/mês. Limite por horas de áudio. |
| **Inspiração** | **O mais próximo do que Justext quer ser.** A ideia de "outputs mágicos" a partir de uma fonte é exatamente o conceito. Simplicidade do input → riqueza do output. |
| **NÃO copiar** | Dashboard complexo, sistema de templates custom, onboarding pesado. |

### 3. Flowjin (flowjin.com)

| Aspecto | Análise |
|---------|---------|
| **Proposta** | Repurposing de podcasts/vídeos em clips curtos e posts sociais |
| **Comunicação** | Hero focado em resultado: "Turn episodes into clips and posts" |
| **Organização** | Mais nichado — focado em podcasters. Home → exemplos de output → pricing. |
| **Fluxo** | URL → IA identifica momentos-chave → gera clips + textos |
| **Multi-features** | Separação clara: Clips | Quotes | Posts. Cada output com preview. |
| **Upgrade** | Free tier limitado → planos por episódios/mês |
| **Inspiração** | Separação visual clara de outputs diferentes. Preview do resultado antes de copiar. |
| **NÃO copiar** | Foco em vídeo/clips (Justext é texto-first). Complexidade de editor de clips. |

### 4. OpusClip (opus.pro)

| Aspecto | Análise |
|---------|---------|
| **Proposta** | "Turn long videos into viral shorts" — IA seleciona melhores momentos |
| **Comunicação** | Hero com campo de URL (!) — muito similar ao Justext. "Paste a link. Get clips." |
| **Organização** | Extremamente focado: input → output. Home é basicamente o app. |
| **Fluxo** | Cola URL → IA processa → galeria de clips gerados com scores de viralidade |
| **Multi-features** | Não tenta ser multi-feature. Faz uma coisa bem. |
| **Upgrade** | Free: 3 vídeos/mês → Creator $15/mês → Pro $29/mês |
| **Inspiração** | **Hero = App.** O campo de URL NA home é a experiência. Não há separação entre "landing page" e "produto". Isso é exatamente o que Justext já faz. Validação do padrão. |
| **NÃO copiar** | Foco em vídeo/clips (Justext é texto). Score de viralidade (overengineering para MVP). |

### Síntese do Benchmark

| Aprendizado | Fonte | Aplicação no Justext |
|-------------|-------|---------------------|
| Input = URL, sem upload | OpusClip | ✅ Já fazemos isso |
| Home = App (sem landing separada) | OpusClip | ✅ Já fazemos isso |
| Múltiplos outputs de uma fonte | Castmagic | Implementar com tabs |
| Outputs por rede social | Castmagic, Flowjin | Tab "Social" com sub-seções |
| Free → paid por volume de uso | Todos | Créditos de IA / uso diário |
| Headline de transformação | Todos | "Transforme vídeos em conteúdo pronto" |
| Simplicidade radical como diferencial | Nenhum faz tão bem | **É nosso diferencial** |

### Tendências UX/UI Aplicáveis

1. **Progressive Disclosure:** Tabs revelam conteúdo sob demanda sem poluir a tela inicial. O resultado começa no resumo (mais digestível) e o usuário explora se quiser.

2. **Single-Action Focus:** Um input, um botão. O processamento é um clique. Não há seleção de opções, menus, configurações. Tudo é automático.

3. **Multiple Outputs sem ruído:** Tab bar horizontal mínima (text labels, sem ícones pesados). Conteúdo muda na mesma área. Sem scroll horizontal, sem carrossel.

4. **Fast I/O:** Mostrar transcrição imediata enquanto IA processa o resto. Skeleton loading ou texto streaming nas tabs de IA.

5. **Minimalist Productivity:** Fundo branco, tipografia limpa, zero decoração. O conteúdo é a interface. Inspiração: Notion, Linear, Arc.

6. **Monetização Embutida:** Soft paywall — "Você usou 3 de 3 resumos grátis hoje. Desbloqueie uso ilimitado." Dentro do fluxo, não popup. Cor suave, não vermelho/urgente.

---

## FASE 4 — Análise de Monetização

### O Produto Tem Potencial de Monetização?

**Sim, com ressalvas:**
- Transcrição pura = commodity (YouTube já dá de graça). Não monetizável isoladamente.
- Resumo + Social + Hooks = valor real para creators que produzem diariamente.
- O público-alvo (creators, social media managers, estudantes de conteúdo) tem disposição moderada a pagar ($5-20/mês).
- O custo por uso é baixo (API do LLM ~$0.01-0.05 por vídeo), permitindo margem saudável.

### Análise Individual

#### Resumo Estruturado

| Dimensão | Avaliação |
|----------|-----------|
| **Valor percebido** | Alto — "entender um vídeo de 1h em 30 segundos" é poderoso |
| **Perfil de usuário** | Estudantes, pesquisadores, profissionais que consomem conteúdo para se atualizar |
| **Potencial de aquisição** | ⭐⭐⭐⭐⭐ — É o hook. "Veja o resumo de qualquer vídeo" atrai cliques. |
| **Potencial de retenção** | ⭐⭐⭐ — Útil mas não cria dependência diária |
| **Potencial de monetização** | ⭐⭐ — Existem alternativas grátis (ChatGPT + copiar transcrição). Difícil cobrar isolado. |

#### Conteúdo Pronto para Redes Sociais

| Dimensão | Avaliação |
|----------|-----------|
| **Valor percebido** | Muito alto — economia direta de 30-60 minutos de trabalho por vídeo |
| **Potencial comercial** | Alto — social media managers processam 5-20 vídeos/semana |
| **É a principal função pagável?** | **Sim.** É a que mais diretamente economiza tempo profissional. |
| **Deve ser eixo central premium?** | **Sim.** É tangível: o usuário vê o post, copia, cola no Instagram. Valor imediato. |
| **Potencial de aquisição** | ⭐⭐⭐⭐ — Atrai creators ativos |
| **Potencial de retenção** | ⭐⭐⭐⭐⭐ — Uso recorrente (cada vídeo novo = novo processamento) |
| **Potencial de monetização** | ⭐⭐⭐⭐⭐ — Maior willingness to pay |

#### Títulos, Hooks e Ângulos

| Dimensão | Avaliação |
|----------|-----------|
| **Valor percebido** | Médio-alto — "brainstorm automático" é atraente |
| **Poder de diferenciação** | Alto — poucos tools fazem isso especificamente |
| **Utilidade prática** | Média — os hooks gerados por IA são ponto de partida, não produto final |
| **Papel na percepção** | Transforma o produto de "ferramenta utilitária" em "assistente criativo" |
| **Potencial de aquisição** | ⭐⭐⭐ — Curioso mas não é o que traz o clique |
| **Potencial de retenção** | ⭐⭐⭐ — Útil mas não essencial |
| **Potencial de monetização** | ⭐⭐⭐ — Funciona melhor como "bonus" do plano pago |

### Ranking por Potencial

| Rank | Aquisição | Retenção | Monetização |
|------|-----------|----------|-------------|
| 1º | Resumo | Social Posts | **Social Posts** |
| 2º | Social Posts | Resumo | Hooks/Ângulos |
| 3º | Hooks/Ângulos | Hooks/Ângulos | Resumo |

### Modelo Comercial Recomendado

**Freemium com limite diário de processamentos IA:**

| Aspecto | Grátis | Pro (~R$19,90/mês ou ~$4,90/mês) |
|---------|--------|------|
| Transcrição | ✅ Ilimitada | ✅ Ilimitada |
| Resumo | 3/dia | Ilimitado |
| Social Posts | 1/dia | Ilimitado |
| Hooks/Ângulos | 1/dia | Ilimitado |
| Exportar .txt | ✅ | ✅ |
| Copiar texto | ✅ | ✅ |

**Por que este modelo:**
1. **Transcrição grátis = aquisição.** Ninguém paga por transcrição. Mas atrai gente pro site.
2. **Resumo com limite generoso = demonstração de valor.** 3/dia é suficiente para testar, insuficiente para uso profissional.
3. **Social Posts limitado = conversão.** 1 grátis mostra o valor. O creator que processa 5 vídeos/dia vai querer pagar.
4. **Preço baixo = barreira mínima.** R$19,90/mês é impulsivo para profissionais. Menos que um café por dia.

**Implementação técnica da monetização no MVP:**
- Não precisa de payment gateway agora
- Basta um contador local (localStorage) que mostra "X de Y usos restantes hoje"
- O paywall é um soft-wall: mostra a mensagem, sugere o upgrade, mas não impede a transcrição
- Payment real (Stripe/BTC Lightning) pode ser adicionado depois, quando validar demanda

### Métricas de Validação

| Métrica | Sinal positivo |
|---------|---------------|
| % de usuários que clicam em tab Social/Ideias | >40% = alta demanda |
| % que tentam usar >3 resumos/dia | >15% = potencial de conversão |
| Mensagem de "limite atingido" exibida/dia | >50/dia = hora de ativar pagamento |
| Tempo médio na página após resultado | >60s = engajamento real |

---

## FASE 5 — Arquitetura de Telas e Fluxo

### Estrutura: Home = App (mantida)

Não há landing page separada. A home É o produto. Isso é validado pelo benchmark (OpusClip faz o mesmo) e é o diferencial de simplicidade.

### Wireframe Textual: Home / Tela Principal

```
┌─────────────────────────────────────────────────────────────┐
│  [●] justext                                                │
│      content from youtube                                   │
│                                                             │
│                                                             │
│         Transforme vídeos do YouTube                        │
│           em conteúdo pronto                                │
│                                                             │
│    Resumo, posts para redes sociais e ideias de             │
│    conteúdo — tudo extraído automaticamente.                │
│                                                             │
│    ┌──────────────────────────────────────────┐             │
│    │  https://www.youtube.com/watch?v=...     │             │
│    └──────────────────────────────────────────┘             │
│                                                             │
│           [ transformar ]   [ limpar ]                      │
│                                                             │
│         cole uma URL e clique em transformar                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
│                                                             │
│              built by SeaWolfBr                              │
└─────────────────────────────────────────────────────────────┘
```

**Mudanças em relação ao atual:**
- brand-subtitle: "youtube transcript" → "content from youtube"
- Headline: atualizada para novo posicionamento
- Botão: "transcrever" → "transformar" / "transform"
- Status: "cole a URL e clique em transformar"

### Wireframe Textual: Tela de Resultado

```
┌─────────────────────────────────────────────────────────────┐
│  [●] justext                                                │
│      content from youtube                                   │
│                                                             │
│    ┌──────────────────────────────────────────┐             │
│    │  https://www.youtube.com/watch?v=dQw4... │             │
│    └──────────────────────────────────────────┘             │
│           [ transformar ]   [ limpar ]                      │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  OUTPUT                                                     │
│  Título do Vídeo Aqui                                       │
│  Legendas em Português (auto-gerada) · 847 segmentos        │
│                                                             │
│  ┌──────────┬──────────┬──────────┬──────────────┐          │
│  │ Resumo ● │  Social  │  Ideias  │ Transcrição  │          │
│  └──────────┴──────────┴──────────┴──────────────┘          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                                                     │    │
│  │  📌 Pontos principais                               │    │
│  │  • O vídeo aborda estratégias de marketing...       │    │
│  │  • O autor argumenta que o foco deve ser em...      │    │
│  │  • A conclusão aponta para tendências de 2026...    │    │
│  │                                                     │    │
│  │  📝 Resumo                                          │    │
│  │  Neste vídeo, [autor] explora as principais...      │    │
│  │  O argumento central é que...                       │    │
│  │                                                     │    │
│  │  🏷️ Tópicos: marketing · IA · redes sociais        │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│              [ copiar resumo ]   [ exportar .txt ]           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Wireframe Textual: Tab "Social" Ativa

```
│  ┌──────────┬──────────┬──────────┬──────────────┐          │
│  │  Resumo  │ Social ● │  Ideias  │ Transcrição  │          │
│  └──────────┴──────────┴──────────┴──────────────┘          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                                                     │    │
│  │  𝕏 Twitter / X                          [copiar]    │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │ Acabei de assistir um vídeo incrível sobre  │    │    │
│  │  │ estratégias de marketing com IA em 2026.    │    │    │
│  │  │ 3 insights que me marcaram: 🧵              │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  │                                                     │    │
│  │  📸 Instagram                           [copiar]    │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │ Se você trabalha com conteúdo digital,      │    │    │
│  │  │ precisa saber disso 👇                      │    │    │
│  │  │ ...                                         │    │    │
│  │  │ #marketing #ia #conteudo #creators          │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  │                                                     │    │
│  │  💼 LinkedIn                            [copiar]    │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │ A inteligência artificial está mudando a    │    │
│  │  │ forma como criamos conteúdo...              │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│              [ copiar tudo ]   [ exportar .txt ]             │
```

### Fluxo Principal Completo

```
1. CHEGADA
   Usuário acessa justext.com
   → Vê hero com input de URL
   → Tudo em um idioma (pt ou en, automático)

2. INPUT
   Cola URL do YouTube
   → Clica "transformar"
   → Botão fica disabled, status "analisando vídeo..."

3. PROCESSAMENTO (backend)
   a) Extrai transcrição (2-5s) — método existente
   b) Em paralelo, envia transcrição ao LLM para:
      - Resumo estruturado
      - Posts para 3 redes sociais
      - 3 títulos + 3 hooks + 3 ângulos

4. RESULTADO
   → Hero comprime (input fica menor, sem headline)
   → Resultado aparece com tab bar
   → Tab "Resumo" ativa por default
   → Status: "conteúdo pronto ✓"

5. NAVEGAÇÃO
   Usuário clica entre tabs livremente
   Cada tab tem botão copiar próprio
   Tab "Transcrição" mostra textarea como hoje

6. EXPORT
   Copiar: copia conteúdo da tab ativa
   Exportar: baixa .txt com TODOS os outputs consolidados

7. NOVO VÍDEO
   Clica "limpar" → volta ao estado inicial
   Cola nova URL → repete o fluxo
```

### Como Gratuito e Premium Convivem

- O fluxo é idêntico. Não há tela separada para premium.
- Quando o limite diário é atingido:
  - As tabs de IA (Resumo, Social, Ideias) mostram um card suave:
    ```
    ┌─────────────────────────────────────────┐
    │  Você usou seus 3 resumos grátis hoje.  │
    │  Volte amanhã ou desbloqueie acesso     │
    │  ilimitado.                              │
    │                                         │
    │         [ ver plano pro ]                │
    └─────────────────────────────────────────┘
    ```
  - A tab "Transcrição" continua funcionando (nunca bloqueada)
  - O design do card é suave (fundo --surface, sem vermelho, sem urgência)

---

## FASE 6 — Plano de Implementação do MVP

### Roadmap Técnico

#### Etapa 1: Infraestrutura de LLM (Backend)
**Prioridade: CRÍTICA | Esforço: Médio | Risco: Baixo**

- Adicionar dependência: `@anthropic-ai/sdk` no package.json
- Criar `lib/ai-processor.mjs` com funções:
  - `generateSummary(transcript, lang)` → retorna resumo estruturado
  - `generateSocialPosts(transcript, lang)` → retorna posts por rede
  - `generateContentIdeas(transcript, lang)` → retorna títulos/hooks/ângulos
- Criar prompts otimizados para cada função (em pt e en)
- Variável de ambiente: `ANTHROPIC_API_KEY`
- Novo endpoint: `POST /api/process` que recebe `{ url }` e retorna:
  ```json
  {
    "ok": true,
    "result": {
      "transcript": { ... },        // igual ao atual
      "summary": { ... },           // novo
      "socialPosts": { ... },       // novo
      "contentIdeas": { ... }       // novo
    }
  }
  ```
- OU: expandir `/api/transcribe` para aceitar `{ url, features: ["summary", "social", "ideas"] }`

**Depende de:** nada (pode começar imediato)

#### Etapa 2: UI de Tabs e Resultado Expandido (Frontend)
**Prioridade: CRÍTICA | Esforço: Médio | Risco: Baixo**

- Adicionar tab bar no CSS (`.tab-bar`, `.tab-item`, `.tab-item.active`)
- Adicionar containers para cada tab no HTML (`.tab-panel`)
- JavaScript: lógica de switch entre tabs, render de cada tipo de output
- Expandir strings de i18n para novos textos
- Botão copiar individual por seção no tab "Social"
- Adaptar export .txt para consolidar todos os outputs

**Depende de:** Etapa 1 (precisa dos dados para renderizar)

#### Etapa 3: Atualização de Copy e Posicionamento
**Prioridade: ALTA | Esforço: Baixo | Risco: Zero**

- Atualizar headline, subheadline, brand-subtitle
- Atualizar label do botão principal ("transcrever" → "transformar")
- Atualizar strings de status
- Limpar package.json (description, scripts)
- Remover CSS residual (.auth-card)

**Depende de:** nada (pode rodar em paralelo com Etapa 1)

#### Etapa 4: Loading States e Polish
**Prioridade: MÉDIA | Esforço: Baixo | Risco: Zero**

- Skeleton loading nas tabs enquanto IA processa
- Animação de fade-in no conteúdo que aparece
- Mostrar transcrição imediatamente, outras tabs com "gerando..."
- Ajuste de responsividade das tabs em mobile

**Depende de:** Etapas 1 e 2

#### Etapa 5: Sistema de Limites (Soft Paywall)
**Prioridade: MÉDIA | Esforço: Baixo | Risco: Baixo**

- Contador em localStorage: `aiUsesToday`, `aiUsesDate`
- Reseta diariamente
- Quando limite atingido, mostra card de upgrade (sem bloquear transcrição)
- Sem payment gateway ainda — apenas o placeholder visual

**Depende de:** Etapa 2 (precisa da UI de tabs)

#### Etapa 6 (Futuro): Payment Gateway
**ADIAR para depois da validação**

- Stripe Checkout ou BTCPay Server (Lightning)
- Account system leve (email + magic link ou token anônimo)
- Webhook para liberar acesso
- Dashboard mínimo de assinatura

### Riscos e Trade-offs

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| **Custo de API do LLM** | Cada processamento custa ~$0.01-0.05. Se viralizar sem paywall, custo pode subir rápido. | Limite diário obrigatório. Rate limit no backend. Cacheamento de resultados por videoId. |
| **Latência do LLM** | 5-15s adicionais de espera. Pode frustrar quem está acostumado com 2-5s. | Mostrar transcrição imediata. Processar IA em background. Streaming se possível. |
| **Qualidade dos outputs** | LLM pode gerar conteúdo genérico ou impreciso. | Prompts muito bem elaborados. Contexto rico (título + idioma + transcrição completa). Iteração nos prompts. |
| **YouTube IP blocking** | Já aconteceu no Railway. VPS com IP limpo resolve. | Hostinger KVM (já planejado). Monitoramento de falhas. |
| **Chave de API exposta** | ANTHROPIC_API_KEY precisa estar segura no servidor. | Variável de ambiente, nunca no código. .env no .gitignore. |
| **Scope creep** | Tentação de adicionar features antes de validar. | MVP rigoroso: 4 tabs, 3 outputs de IA, 1 botão. Depois iterar. |

### Dependências Entre Etapas

```
Etapa 1 (LLM backend) ─────────────┐
                                    ├──→ Etapa 2 (UI tabs) ──→ Etapa 4 (polish)
Etapa 3 (copy/positioning) ────────┘                      ──→ Etapa 5 (limites)
                                                                     │
                                                                     ↓
                                                          Etapa 6 (payment) [FUTURO]
```

---

## Conclusão Objetiva

O Justext tem uma base técnica excelente e um design visual que já está no patamar certo. A evolução proposta **não é uma reescrita** — é uma expansão controlada que adiciona uma camada de IA sobre o motor de transcrição existente.

O investimento principal é:
1. **Um arquivo novo** (`lib/ai-processor.mjs`) com a lógica de LLM
2. **Expansão da UI** com tab bar para múltiplos outputs
3. **Prompts bem escritos** para cada tipo de conteúdo

O diferencial competitivo é claro: **simplicidade radical**. Enquanto Descript é um editor complexo, Castmagic exige onboarding, e OpusClip foca em vídeo — Justext será a ferramenta que faz uma coisa simples extraordinariamente bem: colar uma URL e receber conteúdo pronto em 10 segundos.

---

## Apêndices

### A. Nome da Branch
```
feature/creator-repurpose-mvp
```

### B. Nome da Pasta de Trabalho
```
creator-repurpose-v2/
```
(Será criada como subfolder com cópia da base quando a implementação iniciar)

### C. Estrutura Inicial de Diretórios da Nova Versão

```
sohotexto-repo/
├── server.mjs                    # Expandido: +/api/process
├── lib/
│   ├── youtube-transcript.mjs    # Inalterado
│   └── ai-processor.mjs          # NOVO: integração com Claude API
├── static/
│   ├── index.html                # Expandido: tabs, novos containers
│   ├── app.css                   # Expandido: tabs, panels, soft-paywall card
│   └── app.js                    # Expandido: tab logic, render múltiplo, i18n
├── prompts/                       # NOVO: templates de prompt para LLM
│   ├── summary.md
│   ├── social-posts.md
│   └── content-ideas.md
├── docs/
│   ├── product-study.md           # Este documento
│   ├── monetization-analysis.md
│   └── mvp-implementation-plan.md
└── package.json                   # +@anthropic-ai/sdk
```

### D. Ordem Recomendada de Implementação

1. **Etapa 1** — Backend LLM (`lib/ai-processor.mjs` + endpoint)
2. **Etapa 3** — Copy e posicionamento (pode rodar em paralelo com Etapa 1)
3. **Etapa 2** — UI de tabs e resultado expandido
4. **Etapa 4** — Loading states e polish
5. **Etapa 5** — Sistema de limites (soft paywall)
6. **Etapa 6** — Payment gateway (ADIAR)

### E. Ranking das Funcionalidades por Potencial de Monetização

| Rank | Funcionalidade | Score |
|------|---------------|-------|
| 🥇 1º | Conteúdo para Redes Sociais | ⭐⭐⭐⭐⭐ |
| 🥈 2º | Títulos, Hooks e Ângulos | ⭐⭐⭐ |
| 🥉 3º | Resumo Estruturado | ⭐⭐ |

(Resumo é o melhor para aquisição, Social é o melhor para monetização)

### F. Lista Final

**MANTER:**
- Motor de extração de transcrição (lib/youtube-transcript.mjs)
- Estilo visual DeepMind/minimalista
- Fluxo single-input (cola URL → 1 clique)
- i18n automático por navigator.language
- Rate limiting por IP
- Arquitetura Node.js puro sem framework
- Hero centrado como entry point
- Home = App (sem landing page separada)
- Footer discreto com crédito

**AJUSTAR:**
- brand-subtitle → "content from youtube"
- Headline e subheadline → novo posicionamento
- Label do botão → "transformar" / "transform"
- Resultado → múltiplas seções com tab bar
- API → novo endpoint ou expansão do existente
- package.json → limpar description e scripts legados
- CSS → remover `.auth-card` residual
- Status messages → novos estados de loading para IA
- Export .txt → consolidar todos os outputs

**CRIAR:**
- lib/ai-processor.mjs (integração Claude API)
- Tab bar UI (Resumo | Social | Ideias | Transcrição)
- Render de resumo estruturado
- Render de posts por rede social com copiar individual
- Render de títulos/hooks/ângulos
- Prompts otimizados para cada output (pt/en)
- Loading states específicos para processamento IA
- Contador de uso diário (localStorage)
- Card de soft paywall
- Strings de i18n para todos os novos textos

**ADIAR:**
- Payment gateway (Stripe/BTC Lightning)
- Sistema de contas (login/registro)
- Histórico de transcrições/processamentos
- Cache de resultados por videoId
- Suporte a outras plataformas (Spotify, TikTok, podcasts)
- Dashboard de uso/métricas
- API pública para terceiros
- Customização de prompts pelo usuário
- Dark mode
- PWA / app mobile
