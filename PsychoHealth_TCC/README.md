# PsychoHealth — backend local

Aplicativo acadêmico com interface web/Capacitor e API local em Node.js + SQLite.

## Executar para desenvolvimento

1. Instale Node.js 22.13+ (o projeto usa o módulo `node:sqlite`).
2. Nesta pasta, rode `npm start`.
3. Abra `http://127.0.0.1:4173` no navegador.

O servidor cria `backend/data/psychohealth.sqlite` automaticamente. O arquivo contém dados pessoais/emocionais e não deve ser compartilhado nem enviado ao Git. Para parar, use Ctrl+C.

## Persistência implementada

- Cadastro com senha (hash scrypt) e sessão em cookie HttpOnly.
- Perfil e avatar, registros de humor, diário, metas, autocuidado, lembretes de agenda e mensagens de chat.
- Avaliações são persistidas com estado pendente e exigem moderação antes de publicação.
- Dados pessoais são separados por conta no SQLite e não são apagados do `localStorage` legado durante a migração.
- A primeira entrada importa dados locais apenas quando o e-mail corresponde ao perfil local legado. O endpoint é idempotente por conta.
- Conversas antigas ligadas aos nomes fictícios não são migradas nem enviadas a ninguém; conversas novas só podem começar com um profissional verificado.
- Sem conta conectada, não é possível acessar as telas principais; dados legados continuam preservados no navegador até serem importados.

## Limites e configuração pendente

Esta configuração é para desenvolvimento em um único computador. O SQLite fica no disco deste servidor: outros celulares não conseguem sincronizar pela internet até o backend ser hospedado e a URL da API ser configurada no app. Não exponha este servidor à internet. Registros de bem-estar são dados sensíveis; uso real exige HTTPS, backups protegidos, política de privacidade/consentimento, controles de acesso, gestão de segredos e revisão de segurança/LGPD.

O cadastro verifica a senha localmente, mas ainda não verifica o endereço de e-mail nem oferece recuperação de senha.

O diretório público lista somente profissionais cujo registro foi verificado administrativamente. O servidor oferece candidatura em `POST /api/professional/application`, lista de pendências em `GET /api/admin/professionals/pending` e verificação em `POST /api/admin/professionals/verify`. Avaliações aguardando análise usam `GET /api/admin/reviews` e podem ser moderadas em `POST /api/admin/reviews/moderate`. Essas rotas exigem uma conta conectada e a variável secreta `ADMIN_API_KEY`; ainda falta uma área administrativa e um processo de verificação documental. Enquanto não houver profissionais cadastrados e verificados, chat e pedidos reais de consulta não ficam disponíveis. Lembretes pessoais na agenda não são reservas.

A candidatura profissional coleta CPF, contato, abordagem, cidade, horários, valor e apresentação. O CPF só aparece na fila administrativa e não é retornado pelo diretório público; nesta versão local, porém, ele fica sem criptografia no arquivo SQLite. Use dados fictícios durante a apresentação. Antes de coletar CPFs reais, é necessário implementar criptografia e controles de privacidade adequados.

Google Meet ainda não cria chamadas automaticamente; isso depende de projeto Google Cloud, OAuth e integração apropriada. Mapas continua abrindo a busca do Google Maps, sem diretório geográfico próprio. Notificações Android existentes são locais ao aparelho.

## APK e uso em outros aparelhos

O cliente Capacitor usa a API hospedada em `https://psychohealth-tcc-demo.onrender.com` no Android. O app habilita cookies de sessão para a origem nativa `https://localhost`; o servidor limita CORS a essa origem. O navegador continua usando a API de mesma origem. Recompile o APK após alterações na interface ou nessa URL.

## Preparação de hospedagem de teste (Render)

O arquivo `render.yaml` descreve um serviço Node.js no plano gratuito, com verificação em `/api/health`. Como o plano gratuito não oferece disco persistente, o SQLite fica em armazenamento temporário: os dados podem sumir quando o serviço reinicia, é publicado de novo ou hiberna. O serviço também pode levar cerca de um minuto para responder quando acorda. Use somente dados fictícios e descartáveis nesta configuração.

O serviço de teste está em `https://psychohealth-tcc-demo.onrender.com`. Após atualizar o código no GitHub, publique o novo commit no Render e teste a URL HTTPS acrescentando `/api/health`. Não inclua `backend/data`, `.env`, APKs ou segredos no Git.

Esta configuração é apenas para demonstração controlada com dados descartáveis. Não armazene dados reais de saúde nela. Antes de qualquer uso real, é necessário migrar para armazenamento persistente e revisar proteção/backup, política de privacidade e LGPD, recuperação de conta e controles operacionais.

## Dados

O banco está em `backend/data/psychohealth.sqlite` e é ignorado pelo Git. Faça backup protegido antes de atualizações. Remover esse arquivo apaga as contas e registros persistidos no servidor.
