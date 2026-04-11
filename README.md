# Justext

Aplicacao web privada para extrair transcricoes limpas de videos do YouTube, sem timestamps, com autenticacao simples e interface minimalista.

![Preview](docs/preview.svg)

## O que o produto entrega

- cola uma URL do YouTube
- busca a transcricao/legenda disponivel
- remove timestamps e junta o texto em blocos mais legiveis
- copia o texto com um clique
- exporta o resultado em `.txt`
- protege o acesso com login privado

## Arquitetura da V1

- frontend estatico servido pelo proprio backend
- backend em Node.js
- autenticacao por usuario e senha com `bcrypt`
- sessao em memoria com cookie `HttpOnly`
- rate limit basico para login e transcricao
- sem banco de dados nesta fase

Essa versao foi pensada para ser o mais simples e segura possivel antes de evoluir para uma arquitetura maior.

## Stack

- Node.js
- `bcryptjs`
- `youtube-transcript`

## Rodar localmente

```powershell
npm install
npm run start
```

Abra:

```text
http://127.0.0.1:3217
```

## Credenciais locais padrao

- usuario: `admin`
- senha: `welp`

Use isso apenas para desenvolvimento local. Em producao, troque tudo por variaveis de ambiente.

## Variaveis de ambiente

- `JUSTEXT_HOST`
- `JUSTEXT_PORT`
- `ANTHROPIC_API_KEY`
- `YOUTUBE_COOKIE`
- `YTDLP_ENABLED`
- `YTDLP_PATH`
- `YTDLP_COOKIE_FILE`
- `YTDLP_EXTRACTOR_ARGS`
- `YTDLP_TIMEOUT_MS`

Exemplo em `.env.example`.

## Extracao de transcricao em VPS/datacenter

O extrator tenta, nesta ordem:

1. biblioteca `youtube-transcript`
2. leitura da pagina `watch` e parsing de `ytInitialPlayerResponse`
3. fallback opcional via `yt-dlp`

### Por que existe fallback via `yt-dlp`

IPs de datacenter podem receber um `playerResponse` sem `captionTracks`, mesmo quando o video tem legenda disponivel no navegador. Nesses cenarios, `yt-dlp` costuma ser mais resiliente porque tenta clientes e fluxos do YouTube mais maduros do que um scraper caseiro.

### Limite importante

A YouTube Data API v3 nao resolve o caso de legendas de videos de terceiros. O endpoint oficial de captions exige OAuth e e voltado ao gerenciamento das proprias faixas do canal autenticado.

### Configuracao recomendada na VPS

Instale `yt-dlp` no servidor:

```bash
python3 -m pip install -U yt-dlp
```

Se preferir, use o script do proprio repositorio:

```bash
bash deploy/vps/install-yt-dlp.sh
```

Ou use o binario standalone e aponte com:

```text
YTDLP_PATH=/usr/local/bin/yt-dlp
```

Se quiser testar clientes alternativos do YouTube no fallback, configure por ambiente:

```text
YTDLP_EXTRACTOR_ARGS=youtube:player_client=android,ios,tv_embedded,web
```

Se voce tiver um arquivo de cookies exportado para uso no servidor:

```text
YTDLP_COOKIE_FILE=/opt/justext/youtube-cookies.txt
```

Para `yt-dlp`, prefira `YTDLP_COOKIE_FILE` em vez de injetar um header `Cookie` cru. O fallback novo ainda consegue transformar `YOUTUBE_COOKIE` em arquivo temporario quando necessario, mas o caminho mais estavel em VPS costuma ser um cookies.txt exportado corretamente do navegador.

Mesmo com `yt-dlp`, alguns videos ainda podem falhar em IP de datacenter. Se isso continuar acontecendo em escala, o proximo passo tende a ser melhorar o egress da VPS (proxy/residencial ou outra estrategia de saida), nao apenas trocar headers.

### Logs uteis na VPS

O backend registra qual estrategia conseguiu extrair a transcricao:

- `source=library`
- `source=watch_html`
- `source=yt_dlp`

Exemplo de acompanhamento:

```bash
sudo journalctl -u justext -f
```

### Passo a passo rapido na Hostinger KVM

```bash
cd /opt/justext
git pull
bash deploy/vps/install-yt-dlp.sh
sudo nano .env
sudo systemctl restart justext
sudo journalctl -u justext -f
```

Bloco sugerido para o `.env`:

```env
JUSTEXT_HOST=127.0.0.1
JUSTEXT_PORT=3217
ANTHROPIC_API_KEY=SEU_TOKEN
YOUTUBE_COOKIE=
YTDLP_ENABLED=true
YTDLP_PATH=
YTDLP_COOKIE_FILE=
YTDLP_EXTRACTOR_ARGS=youtube:player_client=android,ios,tv_embedded,web
YTDLP_TIMEOUT_MS=45000
```

## Gerar hash de senha

```powershell
node -e "const bcrypt=require('bcryptjs'); console.log(bcrypt.hashSync('sua-senha-aqui', 10))"
```

## Deploy rapido

### VPS

Arquivos incluidos:

- `deploy/systemd/justext.service`
- `deploy/nginx/justext.conf`

Fluxo sugerido:

1. clonar o repo em `/opt/justext`
2. rodar `npm install`
3. configurar variaveis de ambiente
4. habilitar o service no `systemd`
5. apontar `nginx` para `127.0.0.1:3217`
6. ativar HTTPS com Let's Encrypt

### Render

Arquivo incluido:

- `render.yaml`

Defina no painel:

- `JUSTEXT_USER`
- `JUSTEXT_PASSWORD_HASH`
- `JUSTEXT_SESSION_SECRET`

### Railway

Arquivo incluido:

- `railway.json`

Defina as mesmas variaveis de ambiente no dashboard do Railway.

## Iniciadores locais

- `start-justext.cmd`
- `tools/start-justext.ps1`

## Limites conhecidos

- depende da disponibilidade de transcricao/legenda do proprio YouTube
- alguns videos podem falhar por restricoes, captcha ou indisponibilidade temporaria
- o principal ponto sensivel da solucao e a camada de captura da transcricao em ambiente publico

## Roadmap natural

- melhorar observabilidade e logs
- adicionar auditoria minima de acesso
- evoluir a sessao de memoria para store persistente se o produto crescer

## Licenca

MIT
