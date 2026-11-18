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

O APK atual não tem como alcançar este servidor local de desenvolvimento. Para usar o backend no Android ou em vários dispositivos, hospede a API com HTTPS, configure a URL-base no cliente Capacitor e gere um novo APK. Não instale este modo local como serviço público.

## Preparação de hospedagem de teste (Render)

O arquivo `render.yaml` descreve um serviço Node.js com verificação em `/api/health` e disco persistente para o banco SQLite. Ele usa o plano `starter`, pois o armazenamento em disco persistente não está disponível no plano gratuito do Render. A criação do serviço pode gerar cobrança na conta; revise o plano e os valores exibidos no painel antes de confirmar.

Para publicar, coloque esta pasta do projeto em um repositório Git privado, sem incluir `backend/data`, `.env`, APKs ou segredos; conecte o repositório ao Render e crie o serviço usando o Blueprint `render.yaml`. Quando o deploy terminar, teste a URL HTTPS acrescentando `/api/health`. O site e a API serão servidos pelo mesmo domínio. O APK ainda requer configuração de URL e autenticação para chamar esse domínio com segurança; este manifesto não resolve essa etapa móvel.

Esta configuração é apenas para demonstração controlada. Antes de armazenar dados reais, é necessário revisar proteção/backup do SQLite, política de privacidade e LGPD, recuperação de conta e controles operacionais.

## Dados

O banco está em `backend/data/psychohealth.sqlite` e é ignorado pelo Git. Faça backup protegido antes de atualizações. Remover esse arquivo apaga as contas e registros persistidos no servidor.

## Configuração local e proteção de segredos

1. Copie `.env.example` para um arquivo chamado `.env`.
2. Troque `ADMIN_API_KEY` por uma chave longa e aleatória. Não compartilhe esse valor.
3. Execute `npm start`. O comando carrega as variáveis do `.env` automaticamente no Node.js 22.13+.
4. No Render ou em outro serviço de hospedagem, cadastre `ADMIN_API_KEY` nas configurações de variáveis de ambiente do serviço. Não envie o `.env` ao repositório.

O `.env.example` contém apenas nomes e valores de exemplo. O `.gitignore` impede o envio do `.env`, do banco SQLite, de arquivos de assinatura Android e de arquivos gerados.

Antes de enviar ao GitHub, confira com `git status`. Se algum segredo já tiver sido enviado anteriormente, remova/revogue a chave no serviço que a emitiu; apagar o arquivo em um commit novo não apaga o histórico.

