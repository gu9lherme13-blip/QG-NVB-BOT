# NVB QG v3

## O que foi corrigido nesta versão
- 46 comandos atuais; comandos removidos não são registrados nem aparecem em /ajuda.
- /jogatina abre painel com título, tema, descrição e foto do jogo.
- /resenha abre painel com título, tema, descrição e usuário que anunciou.
- /chamada abre painel com título, tema, descrição e horário; envia para o canal de chamadas.
- /presenca abre resposta curta; atualiza a lista da chamada e registra a resposta.
- Encerramento da chamada salva a lista final no canal de chamadas.
- /boasvindas é apenas configuração; a mensagem de entrada é automática.
- Boas-vindas com card NVB, nome Roblox, avatar Roblox, data/hora e tema vampírico.
- /avatar-roblox-ia recebe nick Roblox + estilo e usa os 38 estilos oficiais.
- /criar-skin, /editar-skin, /melhorar-skin, /skin-nvb e /salvar-skin usam imagens reais.
- /perfil, /cargos, /cargo-consultar, /conquistas, /status e /historico retornam dados reais.
- Candidaturas do site têm botões de aprovação e usam os cargos Discord existentes; não criam cargos novos.
- Aprovação de recrutamento gera código e envia o convite principal do Discord.
- QG mantém login, recrutamento, ranking, comunicação, suporte e navegação inferior no mobile.

## Variáveis já usadas
DISCORD_TOKEN
CLIENT_ID
GUILD_ID
OPENAI_API_KEY
OPENAI_IMAGE_MODEL (gpt-image-2)
ROLE_LDR, ROLE_SB_LDR, ROLE_ADM, ROLE_CMDT, ROLE_MOD, ROLE_SUP, ROLE_ORG, ROLE_REC
ROLE_INF, ROLE_EDT, ROLE_BSTR, ROLE_PCR, ROLE_MBRS, ROLE_NVT, ROLE_TRN_STAFF

## Canais
WELCOME_CHANNEL_ID
CALLS_CHANNEL_ID
RECRUT_CHANNEL_ID
CANDIDATURA_CHANNEL_ID
CHAT_GERAL_CHANNEL_ID
ANUNCIOS_CHANNEL_ID
ENQUETES_CHANNEL_ID
OPINIOES_CHANNEL_ID
SUPPORT_CHANNEL_ID

Os IDs de canal devem ser os IDs reais do seu servidor. Não foram inventados neste pacote.

## Cloudflare Workers AI

Para `/skin`, configure no Render:
- `CLOUDFLARE_ACCOUNT_ID` = seu Account ID da Cloudflare
- `CLOUDFLARE_API_TOKEN` = seu token Workers AI (não compartilhe)
- `CLOUDFLARE_IMAGE_MODEL` = `@cf/black-forest-labs/flux-1-schnell` (opcional; esse é o padrão)

O `/skin` usa a REST API do Workers AI e envia a imagem gerada diretamente ao Discord.
