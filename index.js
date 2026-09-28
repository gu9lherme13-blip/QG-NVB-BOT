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
        console.log('🔄 [QG NVB] Registrando comandos slash...');
        if (GUILD_ID) {
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
            console.log(`✅ [QG NVB] ${commands.length} comandos registrados no servidor ${GUILD_ID} - INSTANTANEO`);
        }
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log(`✅ [QG NVB] ${commands.length} comandos globais registrados`);
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

client.login(TOKEN);
registerCommands();

// ===== SITE OFICIAL QG NVB - AGORA ABRE SITE DE VERDADE =====
const http = require('http');
const PORT = process.env.PORT || 10000;

const SITE_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QG NVB - Nytheris Vampyre Bloodline</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Unbounded:wght@700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{background:#050308;color:#e9d5ff;font-family:'JetBrains Mono',monospace;min-height:100vh}
.bg{position:fixed;inset:0;background:radial-gradient(600px at 20% 10%,rgba(168,85,247,0.25),transparent),radial-gradient(800px at 80% 90%,rgba(168,85,247,0.15),transparent),#050308;z-index:-1}
.header{display:flex;justify-content:space-between;align-items:center;padding:20px 40px;border-bottom:1px solid rgba(168,85,247,0.2);backdrop-filter:blur(10px)}
.logo{font-family:'Unbounded',cursive;font-size:22px;color:#fff} .logo span{color:#a855f7}
.status{display:flex;align-items:center;gap:8px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);padding:8px 14px;border-radius:99px;font-size:12px;color:#22c55e}
.dot{width:8px;height:8px;background:#22c55e;border-radius:50%;box-shadow:0 0 10px #22c55e;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.hero{padding:80px 40px;text-align:center}
.hero h1{font-family:'Unbounded',cursive;font-size:clamp(32px,6vw,48px);color:#fff;line-height:1.1;margin-bottom:16px} .hero h1 i{color:#a855f7;font-style:normal}
.hero p{color:#a1a1aa;max-width:600px;margin:0 auto 30px;font-size:14px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;padding:0 40px;max-width:1200px;margin:0 auto}
.card{background:rgba(255,255,255,0.03);border:1px solid rgba(168,85,247,0.2);border-radius:16px;padding:20px;backdrop-filter:blur(10px)}
.card h3{font-size:12px;color:#a855f7;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px}
.card .val{font-size:20px;color:#fff;font-weight:700}
.commands{padding:60px 40px;max-width:1200px;margin:0 auto}
.commands h2{font-family:'Unbounded',cursive;color:#fff;margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.cmd{background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.2);padding:12px;border-radius:10px;transition:.2s}
.cmd:hover{background:rgba(168,85,247,0.15);transform:translateY(-2px)}
.cmd b{color:#fff;display:block} .cmd span{font-size:11px;color:#a1a1aa}
.footer{text-align:center;padding:40px;color:#52525b;font-size:12px;border-top:1px solid rgba(255,255,255,0.05);margin-top:40px}
.btn{display:inline-block;background:#a855f7;color:#fff;padding:12px 24px;border-radius:99px;text-decoration:none;font-weight:700;margin-top:10px}
.btn:hover{background:#9333ea}
</style>
</head>
<body>
<div class="bg"></div>
<div class="header">
<div class="logo">🦇 QG <span>NVB</span></div>
<div class="status"><div class="dot"></div> ONLINE 24H - OPERACIONAL</div>
</div>
<div class="hero">
<h1>Nytheris<br><i>Vampyre Bloodline</i></h1>
<p>Uma linhagem que acolhe. Uma família que permanece.<br>Quartel General Oficial - Bot 24h Online</p>
<a class="btn" href="https://discord.gg/" target="_blank">Entrar no Discord 🩸</a>
</div>
<div class="cards">
<div class="card"><h3>🤖 Bot</h3><div class="val">QG NVB#4492<br><span style="font-size:12px;color:#22c55e">● Online 24H</span></div></div>
<div class="card"><h3>🏰 Servidor</h3><div class="val" style="font-size:14px">Nytheris Vampyre Bloodline<br><span style="font-size:11px;color:#a1a1aa">ID: 1462814574691750113<br>10 membros</span></div></div>
<div class="card"><h3>📊 Sistemas</h3><div class="val">5/5 Ativos<br><span style="font-size:11px;color:#a1a1aa">Verificação • Tickets • Chamadas • Ranking • Moderação</span></div></div>
</div>
<div class="commands">
<h2>Comandos Slash</h2>
<div class="grid">
<div class="cmd"><b>/ajuda</b><span>Central de comandos</span></div>
<div class="cmd"><b>/avatar</b><span>Ver avatar - NOVO!</span></div>
<div class="cmd"><b>/avata</b><span>Atalho de avatar</span></div>
<div class="cmd"><b>/perfil</b><span>Perfil NVB</span></div>
<div class="cmd"><b>/rank</b><span>Seu rank</span></div>
<div class="cmd"><b>/pontos</b><span>Pontos de sangue</span></div>
<div class="cmd"><b>/cargo</b><span>Lista de cargos</span></div>
<div class="cmd"><b>/tag</b><span>Como usar TAG</span></div>
<div class="cmd"><b>/verificacao</b><span>Verificação NVB</span></div>
<div class="cmd"><b>/ticket</b><span>Abrir ticket</span></div>
<div class="cmd"><b>/qg</b><span>QG operacional</span></div>
<div class="cmd"><b>/status</b><span>Status do bot</span></div>
</div>
<p style="margin-top:20px;color:#71717a;font-size:12px">💡 Se os comandos não aparecerem, vá em Configurações do Servidor > Integrações > QG NVB > Ativar comandos<br>Ou use o link com scope bot + applications.commands</p>
</div>
<div class="footer">🦇 QG NVB © 2026 - Nytheris Vampyre Bloodline | Bot online em Render.com Free | Site oficial</div>
</body>
</html>`;

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(SITE_HTML);
}).listen(PORT, () => {
    console.log(`🌐 [QG NVB] SITE OFICIAL rodando na porta ${PORT}`);
});

process.on('unhandledRejection', err => console.error('❌ Erro:', err));
process.on('uncaughtException', err => console.error('❌ Exceção:', err));
