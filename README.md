# SohoTexto

Aplicacao standalone para transcricao limpa de videos do YouTube, com login privado, sessao por cookie e exportacao em `.txt`.

## Arquitetura da V1

- frontend estatico servido pelo proprio backend
- backend em Node.js
- autenticacao por usuario e senha
- sessao em memoria com cookie `HttpOnly`
- rate limit basico para login e transcricao
- sem banco de dados nesta fase

## Variaveis de ambiente

- `SOHOTEXTO_HOST`
- `SOHOTEXTO_PORT`
- `SOHOTEXTO_USER`
- `SOHOTEXTO_PASSWORD_HASH`
- `SOHOTEXTO_SESSION_SECRET`
- `SOHOTEXTO_SECURE_COOKIE`

## Gerar hash de senha

```powershell
node -e "const bcrypt=require('bcryptjs'); console.log(bcrypt.hashSync('sua-senha-aqui', 10))"
```

## Rodar localmente

```powershell
npm install
npm run start
```

## Iniciador rapido

- `start-sohotexto.cmd`
- `tools/start-sohotexto.ps1`

## Credenciais locais padrao

- usuario: `admin`
- senha: `welp`

Para producao, troque sempre por valores definidos em variaveis de ambiente.
