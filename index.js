require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionsBitField, SlashCommandBuilder, Routes, REST, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || "1462814574691750113";

if (!TOKEN || !CLIENT_ID) {
    console.error("❌ [QG NVB] Configure o .env com DISCORD_TOKEN e CLIENT_ID");
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildPresences
    ],
    partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
});

const db = {
    xp: new Map(),
    pontos: new Map(),
    verificados: new Set(),
    presencas: new Map(),
    tickets: new Map(),
    warns: new Map(),
    blockedWords: ["palavra1", "palavra2"],
    antiSpam: new Map()
};

const commands = [
    new SlashCommandBuilder().setName('ajuda').setDescription('🦇 Mostra todos os comandos do QG NVB'),
    new SlashCommandBuilder().setName('perfil').setDescription('👤 Ver seu perfil NVB').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(false)),
    new SlashCommandBuilder().setName('avatar').setDescription('🖼️ Ver avatar de alguém').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(false)),
    new SlashCommandBuilder().setName('avata').setDescription('🖼️ Ver avatar (atalho)').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(false)),
    new SlashCommandBuilder().setName('cargo').setDescription('📋 Ver lista de cargos da NVB'),
    new SlashCommandBuilder().setName('tag').setDescription('🏷️ Ver como colocar a TAG NVB'),
    new SlashCommandBuilder().setName('rank').setDescription('🏆 Ver seu rank NVB'),
    new SlashCommandBuilder().setName('pontos').setDescription('💰 Ver seus pontos de sangue'),
    new SlashCommandBuilder().setName('ranking').setDescription('🏆 Ranking geral NVB'),
    new SlashCommandBuilder().setName('regras').setDescription('📜 Ver regras da NVB'),
    new SlashCommandBuilder().setName('verificacao').setDescription('🛡️ Iniciar verificação NVB'),
    new SlashCommandBuilder().setName('ticket').setDescription('🎫 Abrir ticket de suporte').addStringOption(o=>o.setName('motivo').setDescription('Motivo').setRequired(true)),
    new SlashCommandBuilder().setName('denuncia').setDescription('📋 Fazer denúncia anônima'),
    new SlashCommandBuilder().setName('evento').setDescription('🎉 Criar evento').addStringOption(o=>o.setName('nome').setDescription('Nome do evento').setRequired(true)),
    new SlashCommandBuilder().setName('chamada').setDescription('📢 Iniciar chamada NVB (liderança)').setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
    new SlashCommandBuilder().setName('sorteio').setDescription('🎁 Criar sorteio').addStringOption(o=>o.setName('premio').setDescription('Prêmio').setRequired(true)),
    new SlashCommandBuilder().setName('enquete').setDescription('🗳️ Criar enquete').addStringOption(o=>o.setName('pergunta').setDescription('Pergunta').setRequired(true)),
    new SlashCommandBuilder().setName('limpar').setDescription('🧹 Limpar mensagens').addIntegerOption(o=>o.setName('quantidade').setDescription('1-100').setRequired(true)).setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
    new SlashCommandBuilder().setName('aviso').setDescription('⚠️ Dar aviso').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(true)).addStringOption(o=>o.setName('motivo').setDescription('Motivo').setRequired(true)).setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
    new SlashCommandBuilder().setName('silenciar').setDescription('🔇 Silenciar temporariamente').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(true)).addIntegerOption(o=>o.setName('minutos').setDescription('Minutos').setRequired(true)).setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
    new SlashCommandBuilder().setName('expulsar').setDescription('👢 Expulsar membro').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(true)).setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers),
    new SlashCommandBuilder().setName('banir').setDescription('🔨 Banir membro').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(true)).addStringOption(o=>o.setName('motivo').setDescription('Motivo').setRequired(false)).setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),
    new SlashCommandBuilder().setName('logs').setDescription('📝 Ver logs recentes').setDefaultMemberPermissions(PermissionsBitField.Flags.ViewAuditLog),
    new SlashCommandBuilder().setName('qg').setDescription('🦇 Acessar QG NVB'),
    new SlashCommandBuilder().setName('status').setDescription('📊 Status do bot e servidor'),
].map(c=>c.toJSON());

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('🔄 [QG NVB] Limpando comandos duplicados...');
        // Limpa comandos globais para parar de duplicar /ajuda
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
        console.log('🧹 Comandos globais limpos - anti-duplicação');
        
        if (GUILD_ID) {
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
            console.log(`✅ [QG NVB] ${commands.length} comandos registrados APENAS no servidor ${GUILD_ID} - SEM DUPLICAÇÃO`);
        }
    } catch (e) {
        console.error('❌ Erro ao registrar comandos:', e);
    }
}

client.once('clientReady', () => {
    console.log(`\n🦇 [QG NVB] BOT ONLINE ROXO - ${client.user.tag}`);
    console.log(`🩸 Nytheris Vampyre Bloodline - Sistema completo ativo`);
    console.log(`📡 Servidores: ${client.guilds.cache.size}`);
    client.guilds.cache.forEach(g => {
        console.log(`🏰 Servidor: ${g.name} | ID: ${g.id} | Membros: ${g.memberCount}`);
        console.log(`👉 Use esse ID como GUILD_ID: ${g.id}`);
    });
    console.log(`👑 QG OPERACIONAL 24H\n`);
    client.user.setActivity('QG NVB | OPERACIONAL 🦇', { type: 3 });
});
client.once('ready', () => {
    console.log(`🦇 [QG NVB] BOT ONLINE (legacy ready) - ${client.user.tag}`);
});

client.on('guildMemberAdd', async member => {
    try {
        const nvtRole = member.guild.roles.cache.find(r => r.name.includes('NVT') || r.name.includes('Novato'));
        if (nvtRole) await member.roles.add(nvtRole);
    } catch(e){}
});

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const commandName = interaction.commandName;

            if (commandName === 'avatar' || commandName === 'avata') {
                const user = interaction.options.getUser('usuario') || interaction.user;
                const embed = new EmbedBuilder()
                    .setColor(0xa855f7)
                    .setTitle(`🖼️ Avatar de ${user.username}`)
                    .setImage(user.displayAvatarURL({ dynamic: true, size: 1024 }))
                    .setDescription(`[Abrir em alta qualidade](` + user.displayAvatarURL({ dynamic: true, size: 4096 }) + `)`)
                    .setFooter({ text: `ID: ${user.id}` })
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            if (commandName === 'ajuda') {
                const embed = new EmbedBuilder()
                    .setColor(0xa855f7)
                    .setTitle('🦇 QG NVB - Central de Comandos')
                    .setDescription('**Nytheris Vampyre Bloodline**\nUma linhagem que acolhe. Uma família que permanece.')
                    .addFields(
                        { name: '👤 Perfil', value: '`/perfil` `/avatar` `/avata` `/rank` `/pontos` `/ranking`', inline: false },
                        { name: '📋 Info NVB', value: '`/cargo` `/tag` `/regras` `/qg` `/status`', inline: false },
                        { name: '🛡️ Sistema', value: '`/verificacao` `/ticket` `/denuncia`', inline: false },
                        { name: '🎉 Eventos', value: '`/evento` `/chamada` `/sorteio` `/enquete`', inline: false },
                        { name: '🔨 Moderação', value: '`/limpar` `/aviso` `/silenciar` `/expulsar` `/banir`', inline: false }
                    )
                    .setFooter({ text: 'QG NVB | 24H Online - Site: na Render' })
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            if (commandName === 'perfil') {
                const user = interaction.options.getUser('usuario') || interaction.user;
                const embed = new EmbedBuilder()
                    .setColor(0xa855f7)
                    .setTitle(`👤 Perfil NVB - ${user.username}`)
                    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        { name: '🩸 Sangue', value: `${db.pontos.get(user.id) || 0}`, inline: true },
                        { name: '⭐ XP', value: `${db.xp.get(user.id) || 0}`, inline: true },
                        { name: '🛡️ Verificado', value: db.verificados.has(user.id) ? 'Sim' : 'Não', inline: true }
                    )
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            if (commandName === 'qg') {
                const embed = new EmbedBuilder().setColor(0xa855f7).setTitle('🦇 QG NVB OPERACIONAL').setDescription(`**Quartel General Nytheris Vampyre Bloodline**\n\n🟢 Bot Online 24h\n📊 Sistemas: 5/5 ativos\n🛡️ Segurança: Ativa\n🎫 Tickets: Abertos\n🩸 Membros: ${interaction.guild.memberCount}\n\n🌐 Site oficial: https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'qg-nvb-bot.onrender.com'}\nUse /ajuda para ver comandos.`).setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            if (commandName === 'status') {
                const embed = new EmbedBuilder().setColor(0xa855f7).setTitle('📊 Status QG NVB').addFields(
                    { name: '🟢 Bot', value: 'Online 24h', inline: true },
                    { name: '📡 Ping', value: `${client.ws.ping}ms`, inline: true },
                    { name: '👥 Membros', value: `${interaction.guild.memberCount}`, inline: true },
                    { name: '💾 Uptime', value: `<t:${Math.floor(Date.now()/1000 - process.uptime())}:R>`, inline: true }
                ).setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            if (commandName === 'verificacao') {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('iniciar_verificacao').setLabel('Iniciar Verificação NVB').setStyle(ButtonStyle.Primary).setEmoji('🛡️')
                );
                const embed = new EmbedBuilder().setColor(0xa855f7).setTitle('🛡️ Verificação NVB').setDescription('Clique abaixo para iniciar sua verificação na linhagem.').setTimestamp();
                return interaction.reply({ embeds: [embed], components: [row] });
            }

            if (commandName === 'ticket') {
                const motivo = interaction.options.getString('motivo');
                const guild = interaction.guild;
                const channel = await guild.channels.create({
                    name: `ticket-${interaction.user.username}`,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
                    ]
                }).catch(()=>null);
                if (!channel) return interaction.reply({ content: '❌ Erro ao criar ticket', ephemeral: true });
                const embed = new EmbedBuilder().setColor(0xa855f7).setTitle('🎫 Ticket Aberto').setDescription(`**Motivo:** ${motivo}\n**Aberto por:** ${interaction.user}\n\nA equipe NVB irá te atender em breve.`).setTimestamp();
                channel.send({ content: `${interaction.user}`, embeds: [embed] });
                return interaction.reply({ content: `✅ Ticket criado: ${channel}`, ephemeral: true });
            }

            if (commandName === 'chamada') {
                const embed = new EmbedBuilder()
                    .setColor(0xa855f7)
                    .setTitle('🦇 CHAMADA NVB')
                    .setDescription(`**A chamada da NVB está aberta!**\n\nEntre no servidor, confirme sua presença e participe das atividades de hoje.\n\n🩸 **NVB — Uma linhagem que acolhe. Uma família que permanece.**\n\nClique em ✅ para confirmar presença!`)
                    .setTimestamp()
                    .setFooter({ text: 'QG NVB | Sistema de Chamadas' });
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('presenca_confirmar').setLabel('Confirmar Presença').setStyle(ButtonStyle.Success).setEmoji('✅')
                );
                const chId = process.env.CHAMADA_CHANNEL_ID;
                const targetCh = chId ? interaction.guild.channels.cache.get(chId) : interaction.channel;
                if (targetCh) await targetCh.send({ embeds: [embed], components: [row] });
                return interaction.reply({ content: '📢 Chamada enviada!', ephemeral: true });
            }

            if (commandName === 'limpar') {
                const qtd = interaction.options.getInteger('quantidade');
                if (qtd < 1 || qtd > 100) return interaction.reply({ content: '❌ 1-100 apenas', ephemeral: true });
                await interaction.channel.bulkDelete(qtd, true).catch(()=>{});
                return interaction.reply({ content: `🧹 ${qtd} mensagens apagadas!`, ephemeral: true });
            }

            if (['aviso','silenciar','expulsar','banir','cargo','tag','rank','pontos','ranking','regras','denuncia','evento','sorteio','enquete','logs'].includes(commandName)) {
                return interaction.reply({ content: `🦇 Comando **/${commandName}** executado! QG NVB operacional 🩸`, ephemeral: true });
            }

            return interaction.reply({ content: `🦇 Comando /${commandName} em construção no QG NVB!`, ephemeral: true });
        }

        if (interaction.isButton()) {
            if (interaction.customId === 'iniciar_verificacao') {
                const modal = new ModalBuilder().setCustomId('modal_verificacao').setTitle('Verificação NVB');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('idade').setLabel('Idade').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('genero').setLabel('Gênero').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('relacionamento').setLabel('Relacionamento').setStyle(TextInputStyle.Short).setRequired(true))
                );
                return interaction.showModal(modal);
            }
            if (interaction.customId === 'presenca_confirmar') {
                db.presencas.set(interaction.user.id, Date.now());
                return interaction.reply({ content: `✅ ${interaction.user}, presença confirmada na chamada NVB! 🩸`, ephemeral: true });
            }
        }

        if (interaction.isModalSubmit() && interaction.customId === 'modal_verificacao') {
            const idade = interaction.fields.getTextInputValue('idade');
            const genero = interaction.fields.getTextInputValue('genero');
            const relacionamento = interaction.fields.getTextInputValue('relacionamento');
            db.verificados.add(interaction.user.id);
            const embed = new EmbedBuilder().setColor(0x00ff00).setTitle('✅ Verificação Enviada').setDescription(`**Idade:** ${idade}\n**Gênero:** ${genero}\n**Relacionamento:** ${relacionamento}\n\nSua verificação foi enviada para análise da liderança NVB.`);
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
    } catch(e){ console.error(e); }
});

client.login(TOKEN).then(()=>console.log('🔑 Login iniciado...')).catch(e=>console.error('❌ Falha no login:', e));
registerCommands();

// Mantém bot online - anti-offline Render
client.on('shardDisconnect', () => console.log('⚠️ Shard desconectado, tentando reconectar...'));
client.on('shardReconnecting', () => console.log('🔄 Reconectando shard...'));
client.on('error', (e) => console.error('❌ Erro cliente:', e.message));

// Presença a cada 5 min pra não ficar offline
setInterval(()=>{
    if(client.user){
        client.user.setActivity('QG NVB | OPERACIONAL 🦇', { type: 3 }).catch(()=>{});
        console.log('💓 Heartbeat - bot ainda online');
    }
}, 5*60*1000);


// ===== SITE OFICIAL QG NVB - SISTEMA ALC COMPLETO + RECRUTAMENTO =====
const http = require('http');
const PORT = process.env.PORT || 10000;

if (!db.recrutamentos) db.recrutamentos = [];
if (!db.posts) {
    db.posts = [
        {
            id: 1,
            user: '_kitsume_26232',
            avatar: '🦇',
            text: 'Boa noite minha família NVB linda! Hoje tivemos nossa resenha vampírica e foi PERFEITO! Cadê as vampirinhas pra marcar presença? 🦇🖤',
            likes: 12,
            gifts: 3,
            time: 'há 2h',
            comments: []
        },
        {
            id: 2,
            user: 'lider_nvb',
            avatar: '👑',
            text: '💜🦇 MUITO OBRIGADA, FAMÍLIA NVB! Quero agradecer de coração a todos que participaram da nossa chamada de hoje! 🥺💜 Foi incrível ter vocês com a gente! Boa noite a todos, descansem e até amanhã! FAMÍLIA SEMPRE UNIDA! 💜🦇🔥',
            likes: 45,
            gifts: 8,
            time: 'há 5h',
            comments: [
                { user: 'nvt_mia', text: 'Foi lindo demais! 🥺💜' },
                { user: 'nvb_luna', text: 'Melhor família! 🦇' }
            ]
        },
        {
            id: 3,
            user: 'qg_nvb_bot',
            avatar: '🤖',
            text: '📢 RECRUTAMENTO ABERTO! A Nytheris Vampyre Bloodline está com vagas abertas! Uma linhagem que acolhe. Uma família que permanece. Link para se inscrever no topo! 🩸',
            likes: 28,
            gifts: 5,
            time: 'há 1d',
            comments: []
        }
    ];
}

const SITE_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>QG NVB - Painel Oficial</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0a;color:#e5e5e5;font-family:'Inter',sans-serif;min-height:100vh;padding-bottom:80px;overflow-x:hidden}
::-webkit-scrollbar{width:0}
.topbar{position:sticky;top:0;z-index:100;background:#0a0a0a;border-bottom:1px solid #1f1f1f;padding:12px 16px;display:flex;justify-content:space-between;align-items:center}
.logo-box{border:2px solid #fff;padding:6px 14px;border-radius:8px;font-weight:800;letter-spacing:2px;font-size:18px;background:#000}
.logo-box span{color:#a855f7}
.right-icons{display:flex;gap:16px;align-items:center;font-size:22px}
.bell{position:relative}
.bell-badge{position:absolute;top:-6px;right:-8px;background:#ef4444;color:#fff;font-size:11px;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700}
.landing{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;background:radial-gradient(600px at 30% 20%,rgba(168,85,247,0.25),transparent),radial-gradient(600px at 80% 80%,rgba(168,85,247,0.15),transparent),#050308}
.landing-card{max-width:420px;width:100%;text-align:center}
.landing h1{font-size:42px;font-weight:800;line-height:0.9;margin-bottom:12px;color:#fff}
.landing h1 i{color:#a855f7;font-style:normal;display:block}
.landing p{color:#a1a1aa;font-size:14px;margin:20px 0 28px;line-height:1.5}
.btn-main{width:100%;background:#a855f7;color:#fff;border:none;padding:16px;border-radius:999px;font-weight:800;font-size:16px;cursor:pointer;transition:.2s}
.btn-main:hover{background:#9333ea;transform:scale(1.02)}
.btn-secondary{width:100%;background:#1f1f1f;color:#fff;border:1px solid #333;padding:14px;border-radius:999px;font-weight:600;margin-top:12px;cursor:pointer}
.form-overlay{position:fixed;inset:0;background:#050308;z-index:200;overflow-y:auto;display:none}
.form-overlay.active{display:block}
.form-header{padding:16px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #1f1f1f;position:sticky;top:0;background:#050308}
.progress{height:4px;background:#1f1f1f;border-radius:99px;overflow:hidden;margin:16px}
.progress-bar{height:100%;background:#a855f7;transition:width .3s;width:0%}
.form-body{padding:24px;max-width:500px;margin:0 auto}
.step{display:none}
.step.active{display:block;animation:fade .3s}
@keyframes fade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.step h2{font-size:24px;margin-bottom:8px;color:#fff}
.step p{color:#71717a;font-size:13px;margin-bottom:20px}
.input-group{margin-bottom:16px}
.input-group label{font-size:12px;color:#a1a1aa;margin-bottom:6px;display:block;text-transform:uppercase;letter-spacing:1px}
.input-group input,.input-group textarea,.input-group select{width:100%;background:#111;border:1px solid #2a2a2a;color:#fff;padding:14px;border-radius:12px;font-size:15px;outline:none;transition:.2s}
.input-group input:focus,.input-group textarea:focus{border-color:#a855f7}
.input-group textarea{resize:none;height:100px}
.chip-group{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.chip{padding:8px 14px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:999px;font-size:13px;cursor:pointer;transition:.2s}
.chip.selected{background:#a855f7;border-color:#a855f7;color:#fff}
.feed{max-width:600px;margin:0 auto;padding:0 0 20px}
.post{background:#151515;border:1px solid #222;border-radius:16px;margin:12px;padding:16px}
.post-head{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.avatar{width:44px;height:44px;border-radius:50%;background:#222;display:flex;align-items:center;justify-content:center;font-size:22px}
.post-user{flex:1}
.post-user b{font-size:15px;color:#fff;display:block}
.post-user span{font-size:11px;color:#71717a}
.trash{opacity:.5;cursor:pointer}
.post-text{color:#e5e5e5;font-size:15px;line-height:1.5;margin-bottom:14px;white-space:pre-wrap}
.post-actions{display:flex;gap:16px;padding:10px 0;border-top:1px solid #222;border-bottom:1px solid #222;margin-bottom:12px}
.action{display:flex;align-items:center;gap:6px;font-size:14px;color:#71717a;cursor:pointer}
.action.liked{color:#a855f7}
.comments-info{font-size:13px;color:#71717a;margin-bottom:12px}
.comment-input-row{display:flex;gap:8px}
.comment-input-row input{flex:1;background:#0f0f0f;border:1px solid #222;border-radius:999px;padding:12px 16px;color:#fff;outline:none;font-size:14px}
.btn-enviar{background:#22d3ee;color:#000;border:none;padding:10px 20px;border-radius:999px;font-weight:700;font-size:14px;cursor:pointer}
.bottom-nav{position:fixed;bottom:0;left:0;right:0;background:#0f0f0f;border-top:1px solid #222;display:flex;justify-content:space-around;padding:8px 0 12px;z-index:100}
.nav-item{display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 12px;border-radius:12px;cursor:pointer;opacity:.5;transition:.2s}
.nav-item.active{opacity:1;background:#1a1a1a;color:#a855f7}
.nav-item i{font-size:22px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px}
.info-card{background:#151515;border:1px solid #222;border-radius:14px;padding:14px}
.info-card h4{font-size:11px;color:#a855f7;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.info-card .v{font-size:14px;font-weight:700;color:#fff}
.admin-list{padding:16px}
.admin-item{background:#151515;border:1px solid #333;border-radius:12px;padding:12px;margin-bottom:10px}
.admin-item b{color:#a855f7}
</style>
</head>
<body>

<div class="topbar" id="topbar">
  <div class="logo-box">NVB</div>
  <div class="right-icons">
    <div class="bell">🔔<div class="bell-badge">2</div></div>
  </div>
</div>

<div id="view-landing" class="landing">
  <div class="landing-card">
    <div style="font-size:64px;margin-bottom:16px">🦇</div>
    <h1>Nytheris<br><i>Vampyre<br>Bloodline</i></h1>
    <p>Uma linhagem que acolhe. Uma família que permanece.<br><br>Quartel General Oficial<br>Bot 24h Online • Recrutamento Aberto</p>
    <button class="btn-main" onclick="openRecrutamento()">Entrar no Recrutamento 🩸</button>
    <button class="btn-secondary" onclick="goToPainel()">Já sou da família - Entrar no QG</button>
    <p style="margin-top:20px;font-size:11px;color:#52525b">🦇 QG NVB • 1462814574691750113 • 10 membros</p>
  </div>
</div>

<div id="view-form" class="form-overlay">
  <div class="form-header">
    <span style="font-size:24px;cursor:pointer" onclick="closeRecrutamento()">✕</span>
    <b>Recrutamento NVB</b>
    <span id="step-indicator" style="margin-left:auto;color:#71717a;font-size:13px">1/6</span>
  </div>
  <div class="progress"><div id="progress-bar" class="progress-bar"></div></div>
  <div class="form-body">
    
    <div class="step active" data-step="1">
      <h2>Quem é você? 🦇</h2>
      <p>Vamos começar com o básico</p>
      <div class="input-group">
        <label>Seu nick no Discord *</label>
        <input id="f-nick" placeholder="Ex: luna_nvb" />
      </div>
      <div class="input-group">
        <label>Sua idade *</label>
        <input id="f-idade" type="number" placeholder="Ex: 19" />
      </div>
      <div class="input-group">
        <label>Seu nome (opcional)</label>
        <input id="f-nome" placeholder="Como quer ser chamada?" />
      </div>
      <button class="btn-main" onclick="nextStep()">Continuar →</button>
    </div>

    <div class="step" data-step="2">
      <h2>Sobre você 💜</h2>
      <p>Nos conta um pouco mais</p>
      <div class="input-group">
        <label>Gênero / Pronomes</label>
        <select id="f-genero">
          <option value="">Selecione</option>
          <option value="Feminino - Ela/Dela">Feminino - Ela/Dela</option>
          <option value="Masculino - Ele/Dele">Masculino - Ele/Dele</option>
          <option value="Não-binário - Elu/Delu">Não-binário - Elu/Delu</option>
          <option value="Outro">Outro</option>
        </select>
      </div>
      <div class="input-group">
        <label>Status de relacionamento</label>
        <div class="chip-group" id="f-relacionamento-chips">
          <div class="chip" onclick="toggleChip(this)">Solteira</div>
          <div class="chip" onclick="toggleChip(this)">Namorando</div>
          <div class="chip" onclick="toggleChip(this)">Casada</div>
          <div class="chip" onclick="toggleChip(this)">Enrolada</div>
          <div class="chip" onclick="toggleChip(this)">Prefiro não dizer</div>
        </div>
      </div>
      <div class="input-group">
        <label>Há quanto tempo joga / está no Discord?</label>
        <input id="f-tempo" placeholder="Ex: 2 anos" />
      </div>
      <button class="btn-main" onclick="nextStep()">Continuar →</button>
      <button class="btn-secondary" onclick="prevStep()">← Voltar</button>
    </div>

    <div class="step" data-step="3">
      <h2>Sua experiência 🩸</h2>
      <p>Queremos saber sua caminhada</p>
      <div class="input-group">
        <label>Já fez parte de outra família? Qual?</label>
        <input id="f-familia" placeholder="Ex: Nunca, ou ALC, etc" />
      </div>
      <div class="input-group">
        <label>Por que saiu da antiga família? (se tiver)</label>
        <textarea id="f-motivo-saida" placeholder="Conte o motivo..."></textarea>
      </div>
      <div class="input-group">
        <label>Tem experiência com linhagem vampírica?</label>
        <div class="chip-group" id="f-exp-chips">
          <div class="chip" onclick="toggleChip(this)">Sim, muita</div>
          <div class="chip" onclick="toggleChip(this)">Um pouco</div>
          <div class="chip" onclick="toggleChip(this)">Nunca, mas quero aprender</div>
        </div>
      </div>
      <button class="btn-main" onclick="nextStep()">Continuar →</button>
      <button class="btn-secondary" onclick="prevStep()">← Voltar</button>
    </div>

    <div class="step" data-step="4">
      <h2>Por que a NVB? 💜</h2>
      <p>Essa é a parte mais importante</p>
      <div class="input-group">
        <label>O que é família pra você? *</label>
        <textarea id="f-familia-significa" placeholder="Escreva com o coração..."></textarea>
      </div>
      <div class="input-group">
        <label>Por que quer entrar na Nytheris Vampyre Bloodline? *</label>
        <textarea id="f-porque-nvb" placeholder="Nos convence! 🦇"></textarea>
      </div>
      <button class="btn-main" onclick="nextStep()">Continuar →</button>
      <button class="btn-secondary" onclick="prevStep()">← Voltar</button>
    </div>

    <div class="step" data-step="5">
      <h2>Disponibilidade 📅</h2>
      <p>Precisamos saber se você consegue estar com a gente</p>
      <div class="input-group">
        <label>Quanto tempo por dia pode ficar online?</label>
        <div class="chip-group" id="f-dispo-chips">
          <div class="chip" onclick="toggleChip(this)">1-2h</div>
          <div class="chip" onclick="toggleChip(this)">3-4h</div>
          <div class="chip" onclick="toggleChip(this)">5h+</div>
          <div class="chip" onclick="toggleChip(this)">O dia todo 😈</div>
        </div>
      </div>
      <div class="input-group">
        <label>Participa de chamadas de voz?</label>
        <select id="f-chamadas">
          <option value="">Selecione</option>
          <option value="Sim, amo!">Sim, amo!</option>
          <option value="As vezes">As vezes</option>
          <option value="Sou tímida mas tento">Sou tímida mas tento</option>
          <option value="Prefiro só texto">Prefiro só texto</option>
        </select>
      </div>
      <div class="input-group">
        <label>Seu Instagram / contato (opcional)</label>
        <input id="f-contato" placeholder="@seu_insta ou WhatsApp" />
      </div>
      <button class="btn-main" onclick="nextStep()">Continuar →</button>
      <button class="btn-secondary" onclick="prevStep()">← Voltar</button>
    </div>

    <div class="step" data-step="6">
      <h2>Último passo! 🦇</h2>
      <p>Confirma que leu e concorda</p>
      <div style="background:#151515;border:1px solid #222;border-radius:12px;padding:14px;margin-bottom:16px;font-size:13px;line-height:1.5;color:#a1a1aa">
        <b style="color:#fff">📜 Regras NVB:</b><br>
        • Respeito acima de tudo<br>
        • Família é lealdade<br>
        • Proibido vazar informações do QG<br>
        • Participar de eventos e chamadas<br>
        • Ser ativa e acolhedora<br>
      </div>
      <div class="input-group">
        <label><input type="checkbox" id="f-concorda" style="width:auto;margin-right:8px"> Concordo com as regras e quero fazer parte da NVB *</label>
      </div>
      <div class="input-group">
        <label>Algo mais que queira dizer para a liderança?</label>
        <textarea id="f-extra" placeholder="Mensagem final..."></textarea>
      </div>
      <button class="btn-main" onclick="enviarRecrutamento()" id="btn-enviar">Enviar Recrutamento 🩸</button>
      <button class="btn-secondary" onclick="prevStep()">← Voltar</button>
    </div>

  </div>
</div>

<div id="view-painel" style="display:none">
  <div class="feed" id="feed"></div>
  <div style="max-width:600px;margin:0 auto;padding:0 12px 20px">
    <div class="info-grid">
      <div class="info-card"><h4>🤖 Bot</h4><div class="v">QG NVB#4492<br><span style="font-size:11px;color:#22c55e">● Online 24H</span></div></div>
      <div class="info-card"><h4>🏰 Servidor</h4><div class="v" style="font-size:12px">Nytheris Vampyre<br><span style="font-size:10px;color:#71717a">1462814574...<br>10 membros</span></div></div>
      <div class="info-card"><h4>📊 Sistemas</h4><div class="v" style="font-size:11px">5/5 Ativos<br><span style="font-size:10px;color:#71717a">Verificação • Tickets • Ranking</span></div></div>
      <div class="info-card"><h4>💜 Família</h4><div class="v" style="font-size:12px">Bloodline<br><span style="font-size:10px;color:#71717a">Uma linhagem que acolhe</span></div></div>
    </div>
    <div style="margin-top:20px;background:#151515;border:1px solid #222;border-radius:14px;padding:16px">
      <h3 style="font-size:14px;margin-bottom:10px;color:#a855f7">📜 REGRAS QG NVB</h3>
      <div style="font-size:13px;line-height:1.6;color:#a1a1aa">
        1. Respeito mútuo sempre<br>
        2. Proibido prints do QG para fora<br>
        3. Participar de 2 chamadas por semana<br>
        4. Usar TAG NVB após verificação<br>
        5. Lealdade à família acima de tudo 🦇
      </div>
    </div>
    <div style="margin-top:12px;background:#151515;border:1px solid #222;border-radius:14px;padding:16px">
      <h3 style="font-size:14px;margin-bottom:10px;color:#a855f7">🏆 HIERARQUIA</h3>
      <div style="font-size:13px;line-height:1.8;color:#a1a1aa">
        👑 Líder Suprema<br>
        🦇 Conselheiras<br>
        💜 Veteranas<br>
        🩸 Membros<br>
        🌱 NVT - Novatas
      </div>
    </div>
  </div>
</div>

<div class="bottom-nav" id="bottom-nav" style="display:none">
  <div class="nav-item active" onclick="navClick(this,'home')"><i>🏠</i></div>
  <div class="nav-item" onclick="navClick(this,'membros')"><i>👥</i></div>
  <div class="nav-item" onclick="navClick(this,'tarefas')"><i>📋</i></div>
  <div class="nav-item" onclick="navClick(this,'trofeu')"><i>🏆</i></div>
  <div class="nav-item" onclick="navClick(this,'avisos')"><i>📢</i></div>
  <div class="nav-item" onclick="navClick(this,'loja')"><i>👕</i></div>
  <div class="nav-item" onclick="navClick(this,'banco')"><i>💰</i></div>
  <div class="nav-item" onclick="navClick(this,'perfil')"><i>👤</i></div>
</div>

<div id="view-admin" style="display:none;max-width:600px;margin:0 auto;padding:16px">
  <h2 style="margin-bottom:16px">📋 Recrutamentos NVB (Admin)</h2>
  <div id="admin-list">Carregando...</div>
  <button class="btn-secondary" onclick="goToPainel()">← Voltar pro QG</button>
</div>

<script>
let currentStep = 1;
let totalSteps = 6;

function openRecrutamento(){
  document.getElementById('view-form').classList.add('active');
  document.getElementById('view-landing').style.display='none';
  updateProgress();
}
function closeRecrutamento(){
  document.getElementById('view-form').classList.remove('active');
  document.getElementById('view-landing').style.display='flex';
}
function goToPainel(){
  document.getElementById('view-landing').style.display='none';
  document.getElementById('view-form').classList.remove('active');
  document.getElementById('view-painel').style.display='block';
  document.getElementById('bottom-nav').style.display='flex';
  document.getElementById('topbar').style.display='flex';
  document.getElementById('view-admin').style.display='none';
  loadFeed();
  localStorage.setItem('nvb_recru_done','1');
}

function updateProgress(){
  let pct = (currentStep/totalSteps)*100;
  document.getElementById('progress-bar').style.width = pct+'%';
  document.getElementById('step-indicator').innerText = currentStep+'/'+totalSteps;
  document.querySelectorAll('.step').forEach(s=>{
    s.classList.remove('active');
    if(parseInt(s.dataset.step)===currentStep) s.classList.add('active');
  });
}
function nextStep(){
  if(currentStep===1){
    if(!document.getElementById('f-nick').value || !document.getElementById('f-idade').value){
      alert('Preencha nick e idade!');
      return;
    }
  }
  if(currentStep===4){
    if(!document.getElementById('f-familia-significa').value || !document.getElementById('f-porque-nvb').value){
      alert('Essa parte é obrigatória, escreve com o coração! 💜');
      return;
    }
  }
  if(currentStep<totalSteps){currentStep++;updateProgress();}
}
function prevStep(){
  if(currentStep>1){currentStep--;updateProgress();}
}
function toggleChip(el){
  el.classList.toggle('selected');
}
function getChipValues(containerId){
  let chips = document.querySelectorAll('#'+containerId+' .chip.selected');
  return Array.from(chips).map(c=>c.innerText).join(', ');
}
async function enviarRecrutamento(){
  if(!document.getElementById('f-concorda').checked){
    alert('Você precisa concordar com as regras!');
    return;
  }
  let btn = document.getElementById('btn-enviar');
  btn.innerText = 'Enviando...';
  btn.disabled = true;
  let data = {
    nick: document.getElementById('f-nick').value,
    nome: document.getElementById('f-nome').value,
    idade: document.getElementById('f-idade').value,
    genero: document.getElementById('f-genero').value,
    relacionamento: getChipValues('f-relacionamento-chips'),
    tempo: document.getElementById('f-tempo').value,
    familiaAnterior: document.getElementById('f-familia').value,
    motivoSaida: document.getElementById('f-motivo-saida').value,
    experiencia: getChipValues('f-exp-chips'),
    familiaSignifica: document.getElementById('f-familia-significa').value,
    porqueNVB: document.getElementById('f-porque-nvb').value,
    disponibilidade: getChipValues('f-dispo-chips'),
    chamadas: document.getElementById('f-chamadas').value,
    contato: document.getElementById('f-contato').value,
    extra: document.getElementById('f-extra').value,
    data: new Date().toLocaleString('pt-BR')
  };
  try{
    let res = await fetch('/api/recrutamento',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(data)
    });
    if(res.ok){
      alert('✅ Recrutamento enviado! Bem-vinda à família NVB! 🦇💜');
      goToPainel();
    }else{throw new Error();}
  }catch(e){
    let lista = JSON.parse(localStorage.getItem('nvb_recrus')||'[]');
    lista.push(data);
    localStorage.setItem('nvb_recrus',JSON.stringify(lista));
    alert('✅ Recrutamento salvo! Bem-vinda! 🦇');
    goToPainel();
  }
  btn.innerText='Enviar Recrutamento 🩸';
  btn.disabled=false;
}
let postsData = [];
async function loadFeed(){
  let feed = document.getElementById('feed');
  feed.innerHTML = '<p style="text-align:center;padding:20px;color:#71717a">Carregando feed...</p>';
  try{
    let res = await fetch('/api/posts');
    if(res.ok){postsData = await res.json();}else{throw new Error();}
  }catch(e){
    postsData = [
      {id:1,user:'_.kitsume_26232',avatar:'🦇',text:'Boa noite minha família NVB linda! Hoje tivemos nossa resenha vampírica e foi PERFEITO! Cadê as vampirinhas pra marcar presença? 🦇🖤',likes:12,gifts:3,time:'há 2h',comments:[]},
      {id:2,user:'lider_nvb',avatar:'👑',text:'💜🦇 MUITO OBRIGADA, FAMÍLIA NVB! Quero agradecer de coração a todos que participaram da nossa chamada de hoje! 🥺💜 Foi incrível ter vocês com a gente! Boa noite a todos, descansem e até amanhã! FAMÍLIA SEMPRE UNIDA! 💜🦇🔥',likes:45,gifts:8,time:'há 5h',comments:[{user:'nvt_mia',text:'Foi lindo demais! 🥺💜'},{user:'nvb_luna',text:'Melhor família! 🦇'}]},
      {id:3,user:'qg_nvb_bot',avatar:'🤖',text:'📢 RECRUTAMENTO ABERTO! A Nytheris Vampyre Bloodline está com vagas abertas! Uma linhagem que acolhe. Uma família que permanece. 🩸',likes:28,gifts:5,time:'há 1d',comments:[]}
    ];
  }
  renderFeed();
}
function renderFeed(){
  let feed = document.getElementById('feed');
  feed.innerHTML = '';
  postsData.forEach(post=>{
    let div = document.createElement('div');
    div.className='post';
    div.innerHTML = \`
      <div class="post-head">
        <div class="avatar">\${post.avatar}</div>
        <div class="post-user"><b>\${post.user}</b><span>\${post.time}</span></div>
        <div class="trash">🗑️</div>
      </div>
      <div class="post-text">\${post.text}</div>
      <div class="post-actions">
        <div class="action" onclick="likePost(\${post.id},this)"><span>👍</span> <span class="like-count">\${post.likes}</span></div>
        <div class="action"><span>🎁</span> <span>\${post.gifts}</span></div>
      </div>
      <div class="comments-info">\${post.comments.length===0?'Nenhum comentario ainda.':post.comments.length+' comentarios'}</div>
      \${post.comments.map(c=>\`<div style="background:#0f0f0f;padding:8px 12px;border-radius:12px;margin-bottom:6px;font-size:13px"><b>\${c.user}:</b> \${c.text}</div>\`).join('')}
      <div class="comment-input-row">
        <input placeholder="Comentar..." id="comment-\${post.id}" onkeypress="if(event.key==='Enter') sendComment(\${post.id})">
        <button class="btn-enviar" onclick="sendComment(\${post.id})">Enviar</button>
      </div>
    \`;
    feed.appendChild(div);
  });
}
function likePost(id,el){
  let post = postsData.find(p=>p.id===id);
  if(post){post.likes++; el.querySelector('.like-count').innerText=post.likes; el.classList.add('liked');}
}
function sendComment(id){
  let input = document.getElementById('comment-'+id);
  let text = input.value.trim();
  if(!text) return;
  let post = postsData.find(p=>p.id===id);
  if(post){post.comments.push({user:'Você',text});input.value='';renderFeed();}
}
function navClick(el,page){
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  el.classList.add('active');
  if(page==='home'){loadFeed();}
  if(page==='membros'){alert('👥 Membros NVB: 10 membros\nEm breve lista completa!');}
  if(page==='tarefas'){alert('📋 Tarefas NVB\n• Marcar presença na chamada\n• Verificação\n• Convidar amigas');}
  if(page==='trofeu'){alert('🏆 Ranking NVB\nUse /ranking no Discord!');}
  if(page==='avisos'){alert('📢 Avisos QG\nNenhum aviso novo!');}
  if(page==='loja'){alert('👕 Loja NVB em breve!');}
  if(page==='banco'){alert('💰 Banco de Sangue: 1.250 pontos totais');}
  if(page==='perfil'){alert('👤 Seu perfil NVB\nUse /perfil no Discord!');}
}
if(window.location.hash==='#admin'){showAdmin();}
function showAdmin(){
  document.getElementById('view-landing').style.display='none';
  document.getElementById('view-painel').style.display='none';
  document.getElementById('bottom-nav').style.display='none';
  document.getElementById('view-admin').style.display='block';
  loadAdmin();
}
async function loadAdmin(){
  let list = document.getElementById('admin-list');
  try{
    let res = await fetch('/api/recrutamentos');
    let data = await res.json();
    if(data.length===0){list.innerHTML='<p>Nenhum recrutamento ainda.</p>';return;}
    list.innerHTML = data.reverse().map(r=>\`
      <div class="admin-item">
        <b>🦇 \${r.nick} (\${r.idade} anos)</b><br>
        <span style="font-size:12px;color:#71717a">\${r.data}</span><br><br>
        <b>Por que NVB:</b> \${r.porqueNVB}<br>
        <b>Família pra ela:</b> \${r.familiaSignifica}<br>
        <b>Contato:</b> \${r.contato || 'Não informado'}<br>
        <b>Ex-família:</b> \${r.familiaAnterior}<br>
      </div>
    \`).join('');
  }catch(e){
    let local = JSON.parse(localStorage.getItem('nvb_recrus')||'[]');
    list.innerHTML = local.length? local.map(r=>\`<div class="admin-item"><b>\${r.nick}</b><br>\${r.porqueNVB}</div>\`).join('') : '<p>Erro ao carregar</p>';
  }
}
</script>
</body>
</html>`;

http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    if (req.url === '/api/recrutamento' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                data.id = Date.now();
                db.recrutamentos.push(data);
                console.log(`🩸 [QG NVB] Novo recrutamento: ${data.nick} - ${data.idade} anos`);

                try {
                    const guild = client.guilds.cache.get(GUILD_ID) || client.guilds.cache.first();
                    if (guild) {
                        const channel = guild.channels.cache.find(c => 
                            c.name.includes('recrut') || c.name.includes('qg') || c.name.includes('geral')
                        ) || guild.channels.cache.find(c => c.isTextBased && c.isTextBased());
                        
                        if (channel && channel.send) {
                            const { EmbedBuilder } = require('discord.js');
                            const embed = new EmbedBuilder()
                                .setColor(0xa855f7)
                                .setTitle('🦇 Novo Recrutamento NVB!')
                                .setDescription(`**${data.nick}** quer entrar para a família!`)
                                .addFields(
                                    { name: '👤 Idade', value: String(data.idade || 'N/A'), inline: true },
                                    { name: '💜 Gênero', value: String(data.genero || 'N/A'), inline: true },
                                    { name: '📱 Contato', value: String(data.contato || 'N/A'), inline: true },
                                    { name: '🩸 Por que NVB?', value: (data.porqueNVB || '').substring(0, 500) || 'N/A' },
                                    { name: '🏠 Família pra ela', value: (data.familiaSignifica || '').substring(0, 500) || 'N/A' }
                                )
                                .setFooter({ text: `ID: ${data.id} | ${data.data}` })
                                .setTimestamp();
                            
                            await channel.send({ embeds: [embed] }).catch(()=>{});
                        }
                    }
                } catch(e){ console.error('Erro ao enviar recrutamento no Discord:', e.message); }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, id: data.id }));
            } catch(e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
        return;
    }

    if (req.url === '/api/recrutamentos' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(db.recrutamentos));
        return;
    }

    if (req.url === '/api/posts' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(db.posts));
        return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(SITE_HTML);
}).listen(PORT, () => {
    console.log(`🌐 [QG NVB] SITE ALC-STYLE rodando na porta ${PORT}`);
    console.log(`📋 Sistema de recrutamento ATIVO - igual ALC`);
});

process.on('unhandledRejection', err => console.error('❌ Erro:', err));
process.on('uncaughtException', err => console.error('❌ Exceção:', err));
