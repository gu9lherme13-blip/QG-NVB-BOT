require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionsBitField, SlashCommandBuilder, Routes, REST, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const http = require('http');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || "1462814574691750113";
const RECRUT_CHANNEL_ID = process.env.RECRUT_CHANNEL_ID || "";
const TICKET_CHANNEL_ID = process.env.TICKET_CHANNEL_ID || "";
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID || "";
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || "";
const CHAMADA_CHANNEL_ID = process.env.CHAMADA_CHANNEL_ID || "";
const PORT = process.env.PORT || 10000;

if (!TOKEN || !CLIENT_ID) {
    console.error("❌ [QG NVB] Configure .env com DISCORD_TOKEN e CLIENT_ID");
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

// ===== BANCO DE DADOS EM MEMÓRIA =====
const db = {
    xp: new Map(),
    pontos: new Map(), // pontos totais (moeda)
    roblox: new Map(), // discordId -> { username, id, avatarUrl, estilo, cargo, entrada, sequencia, conquistas }
    verificados: new Set(),
    presencas: new Map(),
    tickets: new Map(),
    warns: new Map(),
    dailyChat: new Map(), // userId -> { date, count, lastMsg }
    recrutamentos: [],
    posts: [
        { id: 1, user: '_kitsume_26232', avatar: '🦇', text: 'Boa noite minha família NVB linda! Hoje tivemos nossa resenha vampírica e foi PERFEITO! Cadê as vampirinhas pra marcar presença? 🦇🖤', likes: 12, comments: 3 },
        { id: 2, user: 'luna_nvb', avatar: '💜', text: 'Gente, consegui meu avatar no estilo Vampírico NVB! Ficou INSANO! Quem quer que eu ensine? 🩸✨', likes: 28, comments: 7 }
    ],
    sorteios: new Map()
};

// ===== TABELA DE PONTOS OFICIAL =====
const TABELA_PONTOS = {
    entrar_servidor: 10,
    verificacao: 10,
    tag_nvb: 10,
    perfil_roblox: 15,
    criar_avatar: 10,
    chat: 2,
    jogatina: 5,
    resenha: 5,
    evento: 10,
    chamada: 5,
    missao_qg: 10,
    ganhar_evento: 20,
    ajudar_membro: 5,
    sugestao_aprovada: 10,
    print_clipe: 3,
    conteudo_nvb: 15,
    atividade_roblox: 5,
    roupa_oficial: 5,
    divulgar_evento: 5,
    recrutar_membro: 20,
    destaque_mes: 50
};

function addPontos(userId, qtd, motivo = "") {
    const atual = db.pontos.get(userId) || 0;
    db.pontos.set(userId, atual + qtd);
    db.xp.set(userId, (db.xp.get(userId) || 0) + qtd);
    console.log(`💰 +${qtd} pontos para ${userId} - ${motivo} | Total: ${atual+qtd}`);
    return atual + qtd;
}

function getNivel(xp) {
    if (xp < 50) return 1;
    if (xp < 150) return 2;
    if (xp < 300) return 3;
    if (xp < 500) return 4;
    if (xp < 800) return 5;
    if (xp < 1200) return 6;
    if (xp < 1700) return 7;
    if (xp < 2300) return 8;
    if (xp < 3000) return 9;
    return Math.floor(xp / 300) + 5;
}

function getCargoNVB(nivel) {
    if (nivel <= 2) return { nome: "NVT", tag: "[NVT]", cor: 0x71717a };
    if (nivel <= 5) return { nome: "MBRS", tag: "[MBRS]", cor: 0xa855f7 };
    if (nivel <= 9) return { nome: "VTRN", tag: "[VTRN]", cor: 0xec4899 };
    if (nivel <= 14) return { nome: "VET+", tag: "[VET+]", cor: 0xf59e0b };
    if (nivel <= 19) return { nome: "CNSL", tag: "[CNSL]", cor: 0x22c55e };
    return { nome: "LDR", tag: "[LDR]", cor: 0xef4444 };
}

// ===== ROBLOX API HELPERS =====
async function getRobloxData(username) {
    try {
        const res = await fetch('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
        });
        const data = await res.json();
        if (!data.data || data.data.length === 0) return null;
        const user = data.data[0];
        // avatar
        const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${user.id}&size=720x720&format=Png&isCircular=false`);
        const thumbData = await thumbRes.json();
        const avatarUrl = thumbData.data?.[0]?.imageUrl || null;
        return { id: user.id, username: user.name, displayName: user.displayName, avatarUrl };
    } catch (e) {
        console.error('Erro Roblox API:', e.message);
        return null;
    }
}

const ESTILOS_AVATAR = {
    anime: { nome: "🎌 Anime", custo: 25, desc: "transformar o avatar em arte estilo anime", prompt: "anime art style" },
    cinematografico: { nome: "🎬 Cinematográfico", custo: 50, desc: "iluminação dramática, fundo detalhado e aparência de pôster", prompt: "cinematic lighting" },
    vampirico_nvb: { nome: "🩸 Vampírico NVB", custo: 25, desc: "estética da linhagem, morcegos, castelo e tons roxo/azul/verde", prompt: "vampiric aesthetic purple castle bats" },
    dark: { nome: "🖤 Dark", custo: 10, desc: "visual sombrio", prompt: "dark aesthetic" },
    action: { nome: "⚡ Action", custo: 10, desc: "pose dinâmica", prompt: "dynamic action pose" },
    premium: { nome: "👑 Premium", custo: 50, desc: "aparência de banner/perfil", prompt: "premium banner profile" },
    original: { nome: "🎮 Original Roblox", custo: 0, desc: "manter o avatar praticamente igual", prompt: "original roblox" },
    fantasia: { nome: "🌌 Fantasia", custo: 25, desc: "cenário mágico e atmosfera sobrenatural", prompt: "fantasy magical" },
    elemental: { nome: "🔥 Elemental", custo: 25, desc: "fogo, gelo, eletricidade, vento", prompt: "elemental fire ice lightning" },
    noir: { nome: "🌑 Noir", custo: 10, desc: "preto e branco, sombras fortes", prompt: "noir black white strong shadows" },
    neon: { nome: "💜 Neon", custo: 25, desc: "luzes neon e estética futurista", prompt: "neon lights futuristic" },
    cyberpunk: { nome: "🧬 Cyberpunk", custo: 50, desc: "cidade futurista, hologramas e tecnologia", prompt: "cyberpunk city holograms" },
    anjo: { nome: "🪽 Anjo", custo: 25, desc: "asas, luz celestial e atmosfera elegante", prompt: "angel wings celestial light" },
    demoniaco: { nome: "😈 Demoníaco", custo: 25, desc: "aura sombria, chifres e energia sobrenatural", prompt: "demonic aura horns" },
    gotico: { nome: "🥀 Gótico", custo: 25, desc: "castelo, rosas, sombras e estética gótica", prompt: "gothic castle roses shadows" },
    vampiro_classico: { nome: "🧛 Vampiro Clássico", custo: 25, desc: "visual tradicional de vampiro", prompt: "classic vampire" },
    cidade_noturna: { nome: "🌃 Cidade Noturna", custo: 25, desc: "cidade iluminada, chuva e luzes urbanas", prompt: "night city rain urban lights" },
    chuva: { nome: "🌧️ Chuva", custo: 10, desc: "cenário chuvoso e atmosfera dramática", prompt: "rainy dramatic atmosphere" },
    gelo: { nome: "❄️ Gelo", custo: 10, desc: "neve, cristais e efeitos congelantes", prompt: "ice snow crystals frozen" },
    infernal: { nome: "🌋 Infernal", custo: 25, desc: "lava, fumaça e ambiente intenso", prompt: "infernal lava smoke intense" },
    floresta_sombria: { nome: "🌲 Floresta Sombria", custo: 25, desc: "floresta noturna, neblina e lua", prompt: "dark forest night fog moon" },
    lua_cheia: { nome: "🌕 Lua Cheia", custo: 10, desc: "lua gigante, névoa e iluminação lunar", prompt: "full moon giant fog lunar light" },
    noite_vampirica: { nome: "🦇 Noite Vampírica", custo: 25, desc: "céu noturno, morcegos e lua cheia", prompt: "vampiric night sky bats full moon" },
    streetwear: { nome: "🕶️ Streetwear", custo: 10, desc: "estética urbana e moderna", prompt: "streetwear urban modern" },
    music: { nome: "🎧 Music", custo: 25, desc: "visual inspirado em capa de álbum", prompt: "music album cover aesthetic" },
    photoshoot: { nome: "📸 Photoshoot", custo: 25, desc: "ensaio fotográfico profissional", prompt: "professional photoshoot" },
    poster: { nome: "🎞️ Poster", custo: 50, desc: "composição de pôster de filme/anime", prompt: "movie anime poster composition" },
    fantasy_glow: { nome: "✨ Fantasy Glow", custo: 25, desc: "brilho mágico e partículas", prompt: "fantasy glow magical particles" },
    luxury: { nome: "💎 Luxury", custo: 50, desc: "aparência sofisticada, dourada e elegante", prompt: "luxury sophisticated golden elegant" },
    cosmic: { nome: "🪐 Cosmic", custo: 50, desc: "espaço, estrelas e energia cósmica", prompt: "cosmic space stars energy" },
    horror: { nome: "👻 Horror", custo: 25, desc: "terror, névoa e atmosfera assustadora", prompt: "horror terror fog scary" },
    glitch: { nome: "🌀 Glitch", custo: 25, desc: "distorções digitais e efeitos de glitch", prompt: "glitch digital distortion" },
    warrior: { nome: "🗡️ Warrior", custo: 25, desc: "guerreiro em cenário épico", prompt: "warrior epic scenario" },
    champion: { nome: "🏆 Champion", custo: 50, desc: "pose de campeão com iluminação de vitória", prompt: "champion victory lighting pose" },
    mystery: { nome: "🎭 Mystery", custo: 10, desc: "personagem parcialmente oculto por sombras", prompt: "mystery hidden shadows" },
    sunset: { nome: "🌅 Sunset", custo: 10, desc: "pôr do sol e iluminação quente", prompt: "sunset warm lighting" },
    galaxy: { nome: "🌌 Galaxy", custo: 50, desc: "nebulosas, estrelas e fundo espacial", prompt: "galaxy nebula stars space background" },
    mystic: { nome: "🧿 Mystic", custo: 25, desc: "símbolos, energia e atmosfera sobrenatural", prompt: "mystic symbols energy supernatural" }
};

// ===== COMANDOS (LIMPOS - SEM OS 8 REMOVIDOS) =====
const commands = [
    new SlashCommandBuilder().setName('ajuda').setDescription('🦇 Central de comandos QG NVB'),
    new SlashCommandBuilder().setName('perfil').setDescription('👤 Ver seu Passaporte NVB').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(false)),
    new SlashCommandBuilder().setName('avatar').setDescription('🖼️ Ver avatar Discord').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(false)),
    new SlashCommandBuilder().setName('rank').setDescription('🏆 Ver seu rank e nível NVB').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(false)),
    new SlashCommandBuilder().setName('pontos').setDescription('💰 Ver pontos e tabela oficial').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(false)),
    new SlashCommandBuilder().setName('ranking').setDescription('🏆 Top 10 ranking NVB'),
    new SlashCommandBuilder().setName('ticket').setDescription('🎫 Criar ticket com texto livre').addStringOption(o=>o.setName('titulo').setDescription('Título do ticket').setRequired(true)).addStringOption(o=>o.setName('descricao').setDescription('Descreva o que precisa (pode escrever o que quiser)').setRequired(true)),
    new SlashCommandBuilder().setName('chamada').setDescription('📢 Iniciar chamada NVB').setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
    new SlashCommandBuilder().setName('sorteio').setDescription('🎁 Criar sorteio').addStringOption(o=>o.setName('premio').setDescription('Prêmio').setRequired(true)).addIntegerOption(o=>o.setName('ganhadores').setDescription('Qtd ganhadores').setRequired(false)),
    new SlashCommandBuilder().setName('limpar').setDescription('🧹 Limpar mensagens').addIntegerOption(o=>o.setName('quantidade').setDescription('1-100').setRequired(true)).setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
    new SlashCommandBuilder().setName('aviso').setDescription('⚠️ Dar aviso').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(true)).addStringOption(o=>o.setName('motivo').setDescription('Motivo').setRequired(true)).setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
    new SlashCommandBuilder().setName('silenciar').setDescription('🔇 Silenciar').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(true)).addIntegerOption(o=>o.setName('minutos').setDescription('Minutos').setRequired(true)).setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
    new SlashCommandBuilder().setName('expulsar').setDescription('👢 Expulsar').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(true)).setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers),
    new SlashCommandBuilder().setName('banir').setDescription('🔨 Banir').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(true)).addStringOption(o=>o.setName('motivo').setDescription('Motivo').setRequired(false)).setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),
    new SlashCommandBuilder().setName('qg').setDescription('🦇 Acessar QG NVB'),
    new SlashCommandBuilder().setName('status').setDescription('📊 Status completo bot + servidor'),
    // NOVOS COMANDOS ROBLOX + GERENCIAMENTO
    new SlashCommandBuilder().setName('registrar').setDescription('🎮 Registrar seu nick Roblox').addStringOption(o=>o.setName('nick').setDescription('Seu nick do Roblox').setRequired(true)),
    new SlashCommandBuilder().setName('verificar').setDescription('✅ Verificar e vincular Roblox').addUserOption(o=>o.setName('usuario').setDescription('Usuário (liderança)').setRequired(false)),
    new SlashCommandBuilder().setName('perfil-roblox').setDescription('👤 Ver perfil Roblox NVB').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(false)),
    new SlashCommandBuilder().setName('avatar-roblox').setDescription('🖼️ Editor de avatar Roblox com 40 estilos').addStringOption(o=>o.setName('nick').setDescription('Nick Roblox (ou deixe vazio para usar o seu vinculado)').setRequired(false)).addStringOption(o=>o.setName('estilo').setDescription('Estilo do avatar').setRequired(false).addChoices(
        { name: '🎮 Original (Grátis)', value: 'original' },
        { name: '🖤 Dark (10 pts)', value: 'dark' },
        { name: '🩸 Vampírico NVB (25 pts)', value: 'vampirico_nvb' },
        { name: '🎌 Anime (25 pts)', value: 'anime' },
        { name: '🎬 Cinematográfico (50 pts)', value: 'cinematografico' },
        { name: '💜 Neon (25 pts)', value: 'neon' },
        { name: '🧬 Cyberpunk (50 pts)', value: 'cyberpunk' },
        { name: '🥀 Gótico (25 pts)', value: 'gotico' },
        { name: '🦇 Noite Vampírica (25 pts)', value: 'noite_vampirica' }
    )),
    new SlashCommandBuilder().setName('nvb').setDescription('🦇 Central do QG - Painel único NVB'),
    new SlashCommandBuilder().setName('setup-qg').setDescription('🏰 Criar estrutura completa de canais NVB').setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder().setName('canal').setDescription('🔧 Gerenciar canais do clã').addStringOption(o=>o.setName('acao').setDescription('Ação').setRequired(true).addChoices(
        { name: 'Criar', value: 'criar' },
        { name: 'Deletar', value: 'deletar' },
        { name: 'Trancar', value: 'trancar' },
        { name: 'Destrancar', value: 'destrancar' },
        { name: 'Info', value: 'info' }
    )).addStringOption(o=>o.setName('nome').setDescription('Nome do canal').setRequired(false)).addChannelOption(o=>o.setName('canal_alvo').setDescription('Canal alvo').setRequired(false)).setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
].map(c=>c.toJSON());

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('🔄 Limpando comandos globais duplicados...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
        console.log('🧹 Globais limpos');
        if (GUILD_ID) {
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
            console.log(`✅ ${commands.length} comandos registrados no servidor ${GUILD_ID} | SEM DUPLICAÇÃO`);
        }
    } catch (e) {
        console.error('❌ Erro registrar comandos:', e);
    }
}

// ===== EVENTOS =====
function onBotReady() {
    console.log(`\n🦇 QG NVB - BOT ONLINE | ${client.user.tag}`);
    console.log(`🩸 Sistema UNIFICADO: QG + Bot + Roblox + Pontos + Avatar IA`);
    console.log(`📡 Servidores: ${client.guilds.cache.size}`);
    client.guilds.cache.forEach(g => console.log(`🏰 ${g.name} | ID: ${g.id} | Membros: ${g.memberCount}`));
    console.log(`👑 OPERACIONAL 24H\n`);
    try{ client.user.setActivity('QG NVB | Passaporte + Roblox 🦇', { type: 3 }); }catch(_){}
}
client.once('clientReady', onBotReady);
client.once('ready', onBotReady);

client.on('guildMemberAdd', async member => {
    try {
        // Cargo auto
        const nvtRole = member.guild.roles.cache.find(r => r.name.toLowerCase().includes('nvt') || r.name.toLowerCase().includes('novat'));
        if (nvtRole) await member.roles.add(nvtRole).catch(()=>{});
        
        // Pontos entrar
        addPontos(member.id, TABELA_PONTOS.entrar_servidor, 'Entrou no servidor');
        
        // Salva data entrada
        if (!db.roblox.has(member.id)) db.roblox.set(member.id, {});
        const dados = db.roblox.get(member.id);
        dados.entrada = new Date().toLocaleDateString('pt-BR');
        dados.sequencia = 1;
        dados.conquistas = 0;
        db.roblox.set(member.id, dados);
        
        // Mensagem boas-vindas
        let welcomeCh = null;
        if (WELCOME_CHANNEL_ID) welcomeCh = await client.channels.fetch(WELCOME_CHANNEL_ID).catch(()=>null);
        if (!welcomeCh) welcomeCh = member.guild.channels.cache.find(c => c.name.includes('boas-vindas') || c.name.includes('welcome'));
        if (welcomeCh && welcomeCh.send) {
            const embed = new EmbedBuilder()
                .setColor(0xa855f7)
                .setTitle('🦇 Bem-vinda à Família NVB!')
                .setDescription(`Olá ${member}! Uma linhagem que acolhe. Uma família que permanece.\n\n👉 Use **/registrar SeuNickRoblox** para vincular seu Roblox\n👉 Use **/perfil** para ver seu Passaporte NVB\n💰 Você ganhou **+10 pontos** por entrar!`)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp();
            welcomeCh.send({ content: `${member}`, embeds: [embed] }).catch(()=>{});
        }
    } catch(e){ console.error('Erro welcome:', e.message); }
});

client.on('messageCreate', async msg => {
    if (msg.author.bot) return;
    // Anti-spam e pontos por chat
    const userId = msg.author.id;
    const agora = Date.now();
    const hoje = new Date().toDateString();
    let daily = db.dailyChat.get(userId);
    if (!daily || daily.date !== hoje) daily = { date: hoje, count: 0, lastMsg: "", lastTime: 0 };
    
    // Mensagem repetida não conta
    if (daily.lastMsg === msg.content) return;
    // Limite diário 25 mensagens (50 pontos max por dia conversando)
    if (daily.count >= 25) return;
    // Anti-spam 5 seg
    if (agora - daily.lastTime < 5000) return;
    
    daily.count++;
    daily.lastMsg = msg.content;
    daily.lastTime = agora;
    db.dailyChat.set(userId, daily);
    addPontos(userId, TABELA_PONTOS.chat, 'Conversou no chat');
});

// ===== INTERAÇÕES =====
client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const cmd = interaction.commandName;

            if (cmd === 'avatar') {
                const user = interaction.options.getUser('usuario') || interaction.user;
                const embed = new EmbedBuilder().setColor(0xa855f7).setTitle(`🖼️ Avatar de ${user.username}`).setImage(user.displayAvatarURL({ dynamic: true, size: 1024 })).setFooter({ text: `ID: ${user.id}` }).setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            if (cmd === 'ajuda') {
                const embed = new EmbedBuilder()
                    .setColor(0xa855f7)
                    .setTitle('🦇 QG NVB - Passaporte Unificado')
                    .setDescription('**QG + Bot + Roblox + Pontos + Avatar IA = Um único sistema!**\n\n**Digite `/nvb` para abrir a Central ÚNICA!**')
                    .addFields(
                        { name: '🦇 Central ÚNICA', value: '`/nvb` - **PORTA DE ENTRADA** do QG - painel com tudo em botões!', inline: false },
                        { name: '👤 Passaporte NVB', value: '`/perfil` - Seu passaporte completo\n`/perfil-roblox` - Perfil Roblox\n`/rank` - Seu nível e cargo\n`/pontos` - Saldo e tabela\n`/ranking` - Top 10', inline: false },
                        { name: '🎮 Roblox + Avatar IA', value: '`/registrar [nick]` - Vincular Roblox (+15 pts)\n`/verificar` - Verificar vínculo (+10 pts)\n`/avatar-roblox [estilo]` - Editor com 40 estilos (gasta pontos)', inline: false },
                        { name: '🎫 QG Sistema', value: '`/ticket [titulo] [descricao]` - Texto livre pro canal fixo\n`/chamada` - Chamada com presença (+5 pts)\n`/sorteio [premio]` - Sorteio com botão\n`/qg` - Link site\n`/status` - Status completo', inline: false },
                        { name: '🔨 Moderação + Canais', value: '`/limpar` `/aviso` `/silenciar` `/expulsar` `/banir`\n`/setup-qg` - Cria estrutura canais\n`/canal [acao]` - Gerenciar canais', inline: false }
                    )
                    .setFooter({ text: 'QG NVB | Sistema Unificado 24H' })
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            if (cmd === 'nvb') {
                const userId = interaction.user.id;
                const pontos = db.pontos.get(userId) || 0;
                const xp = db.xp.get(userId) || 0;
                const nivel = getNivel(xp);
                const cargo = getCargoNVB(nivel);
                const rData = db.roblox.get(userId) || {};
                const conquistas = rData.conquistas || 0;
                const online = interaction.guild.members.cache.filter(m => m.presence?.status === 'online' || m.presence?.status === 'dnd' || m.presence?.status === 'idle').size || interaction.guild.memberCount;

                const embed = new EmbedBuilder()
                    .setColor(0xa855f7)
                    .setTitle('🦇 NYTHERIS VAMPYRE BLOODLINE')
                    .setDescription(`**Central do QG - Sistema Unificado**\n\n👤 ${interaction.user}\n🏷️ ${cargo.tag} ${cargo.nome}\n⭐ Nível ${nivel} | 🪙 ${pontos} pontos\n🏆 ${conquistas} conquistas\n🟢 Online agora: ${online}\n\n**QG + Bot + Roblox + Pontos + Avatar IA = Um único sistema!**\nAvatar Roblox integrado ao perfil.`)
                    .setThumbnail(rData.avatarUrl || interaction.user.displayAvatarURL({ dynamic: true }))
                    .setImage(rData.avatarUrl || null)
                    .setFooter({ text: 'Toque nos botões abaixo para navegar - /NVB é a porta de entrada!' })
                    .setTimestamp();

                const row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('nvb_perfil').setLabel('🪪 PERFIL').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('nvb_roblox').setLabel('🎮 ROBLOX').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('nvb_avatar').setLabel('🖼️ AVATAR').setStyle(ButtonStyle.Secondary)
                );
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('nvb_cargos').setLabel('🏷️ CARGOS').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('nvb_conquistas').setLabel('🏆 CONQUISTAS').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('nvb_nivel').setLabel('⭐ NÍVEL').setStyle(ButtonStyle.Secondary)
                );
                const row3 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('nvb_pontos').setLabel('🪙 PONTOS').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('nvb_ranking').setLabel('🏆 RANKING').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('nvb_loja').setLabel('🎨 LOJA').setStyle(ButtonStyle.Success)
                );

                return interaction.reply({ embeds: [embed], components: [row1, row2, row3] });
            }

            if (cmd === 'perfil') {
                const user = interaction.options.getUser('usuario') || interaction.user;
                const pontos = db.pontos.get(user.id) || 0;
                const xp = db.xp.get(user.id) || 0;
                const nivel = getNivel(xp);
                const cargo = getCargoNVB(nivel);
                const rData = db.roblox.get(user.id) || {};
                const entrada = rData.entrada || 'Não registrada';
                const seq = rData.sequencia || 1;
                const conquistas = rData.conquistas || 0;
                const estilo = rData.estilo ? ESTILOS_AVATAR[rData.estilo]?.nome || rData.estilo : 'Original';
                
                const embed = new EmbedBuilder()
                    .setColor(cargo.cor)
                    .setTitle('🦇 PASSAPORTE NVB')
                    .setThumbnail(rData.avatarUrl || user.displayAvatarURL({ dynamic: true }))
                    .setDescription(`**Perfil unificado QG + Roblox + Pontos**`)
                    .addFields(
                        { name: '👤 Nick', value: `${user}`, inline: true },
                        { name: '🎮 Roblox', value: rData.username ? `${rData.username} (ID: ${rData.id})` : 'Não vinculado - use /registrar', inline: true },
                        { name: '🏷️ Cargo', value: `${cargo.tag} - ${cargo.nome}`, inline: true },
                        { name: '⭐ Nível', value: `${nivel} (${xp} XP)`, inline: true },
                        { name: '🪙 Pontos', value: `${pontos}`, inline: true },
                        { name: '🏆 Conquistas', value: `${conquistas}`, inline: true },
                        { name: '🎨 Estilo', value: estilo, inline: true },
                        { name: '📅 Entrada', value: entrada, inline: true },
                        { name: '🔥 Sequência', value: `${seq} dias`, inline: true }
                    )
                    .setImage(rData.avatarUrl || null)
                    .setFooter({ text: `QG NVB | Passaporte de ${user.username}` })
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            if (cmd === 'rank') {
                const user = interaction.options.getUser('usuario') || interaction.user;
                const xp = db.xp.get(user.id) || 0;
                const nivel = getNivel(xp);
                const cargo = getCargoNVB(nivel);
                const pontos = db.pontos.get(user.id) || 0;
                const proxNivelXp = (nivel <= 9) ? [50,150,300,500,800,1200,1700,2300,3000][nivel-1] : (nivel+1)*300;
                const perc = Math.min(100, Math.floor((xp / proxNivelXp)*100));
                const barra = '█'.repeat(Math.floor(perc/10)) + '░'.repeat(10 - Math.floor(perc/10));
                
                const embed = new EmbedBuilder()
                    .setColor(cargo.cor)
                    .setTitle(`🏆 Rank NVB - ${user.username}`)
                    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        { name: '🏷️ Cargo Atual', value: `${cargo.tag} ${cargo.nome}`, inline: true },
                        { name: '⭐ Nível', value: `${nivel}`, inline: true },
                        { name: '🪙 Pontos', value: `${pontos}`, inline: true },
                        { name: '📊 XP', value: `${xp} / ${proxNivelXp}\n${barra} ${perc}%`, inline: false },
                        { name: '💡 Próximo cargo', value: nivel < 20 ? `${getCargoNVB(nivel+1).tag}` : 'Máximo!', inline: true }
                    )
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            if (cmd === 'pontos') {
                const user = interaction.options.getUser('usuario') || interaction.user;
                const pontos = db.pontos.get(user.id) || 0;
                const embed = new EmbedBuilder()
                    .setColor(0xa855f7)
                    .setTitle(`💰 Banco NVB - ${user.username}`)
                    .setDescription(`**Saldo:** ${pontos} 🪙\n\n**Tabela de Pontos QG NVB:**\n👋 Entrar +10 | ✅ Verificação +10 | 🏷️ TAG +10\n👤 Perfil Roblox +15 | 🖼️ Avatar +10 | 💬 Chat +2\n🎮 Jogatina +5 | 🗣️ Resenha +5 | 🎉 Evento +10\n📢 Chamada +5 | 🎯 Missão +10 | 🏆 Ganhar evento +20\n🤝 Ajudar +5 | 💡 Sugestão +10 | 📸 Print +3\n🎨 Conteúdo +15 | 🧛 Roblox +5 | 👕 Roupa oficial +5\n📣 Divulgar +5 | 🦇 Recrutar +20 | ⭐ Destaque +50\n\n**Regras:** Sem spam, limite 25 msgs/dia (50 pts), repetida não conta.\n**Gaste em:** /avatar-roblox (10-50 pts por estilo)`)
                    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            if (cmd === 'ranking') {
                const sorted = Array.from(db.pontos.entries()).sort((a,b)=>b[1]-a[1]).slice(0,10);
                if (sorted.length === 0) return interaction.reply({ content: '🏆 Ninguém tem pontos ainda! Converse no chat para ganhar +2!', ephemeral: true });
                let desc = sorted.map(( [id, pts], i) => {
                    const medal = i===0?'🥇' : i===1?'🥈' : i===2?'🥉' : `**${i+1}.**`;
                    const nivel = getNivel(db.xp.get(id)||0);
                    const cargo = getCargoNVB(nivel);
                    return `${medal} <@${id}> - ${pts} 🪙 | Nv ${nivel} ${cargo.tag}`;
                }).join('\n');
                const embed = new EmbedBuilder().setColor(0xf59e0b).setTitle('🏆 Ranking NVB - Top 10').setDescription(desc).setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            if (cmd === 'registrar') {
                const nick = interaction.options.getString('nick');
                await interaction.deferReply();
                const rData = await getRobloxData(nick);
                if (!rData) return interaction.editReply({ content: `❌ Nick Roblox **${nick}** não encontrado! Verifique se digitou certo.` });
                
                let dados = db.roblox.get(interaction.user.id) || {};
                dados.username = rData.username;
                dados.id = rData.id;
                dados.avatarUrl = rData.avatarUrl;
                dados.displayName = rData.displayName;
                if (!dados.entrada) dados.entrada = new Date().toLocaleDateString('pt-BR');
                if (!dados.conquistas) dados.conquistas = 0;
                dados.conquistas += 1;
                db.roblox.set(interaction.user.id, dados);
                addPontos(interaction.user.id, TABELA_PONTOS.perfil_roblox, 'Completou perfil Roblox');
                
                const embed = new EmbedBuilder()
                    .setColor(0x22c55e)
                    .setTitle('✅ Roblox Vinculado!')
                    .setDescription(`Seu Discord foi vinculado ao Roblox **${rData.username}**!\n\n🪙 **+15 pontos** ganhos!\nUse **/perfil** para ver seu Passaporte NVB\nUse **/avatar-roblox** para criar avatar estilizado!`)
                    .setThumbnail(rData.avatarUrl)
                    .addFields(
                        { name: '🎮 Nick', value: rData.username, inline: true },
                        { name: '🆔 ID', value: `${rData.id}`, inline: true },
                        { name: '👤 Display', value: rData.displayName, inline: true }
                    )
                    .setImage(rData.avatarUrl)
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            if (cmd === 'verificar') {
                const target = interaction.options.getUser('usuario') || interaction.user;
                const rData = db.roblox.get(target.id);
                if (!rData || !rData.username) return interaction.reply({ content: `❌ ${target} ainda não registrou Roblox! Use /registrar`, ephemeral: true });
                db.verificados.add(target.id);
                addPontos(target.id, TABELA_PONTOS.verificacao, 'Verificação');
                try {
                    const member = await interaction.guild.members.fetch(target.id).catch(()=>null);
                    if (member) {
                        await member.setNickname(`${getCargoNVB(getNivel(db.xp.get(target.id)||0)).tag} ${rData.username}`).catch(()=>{});
                    }
                } catch(e){}
                const embed = new EmbedBuilder().setColor(0x22c55e).setTitle('✅ Verificação NVB').setDescription(`${target} verificada!\n🎮 Roblox: ${rData.username}\n🪙 +10 pontos`).setThumbnail(rData.avatarUrl).setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            if (cmd === 'perfil-roblox') {
                const user = interaction.options.getUser('usuario') || interaction.user;
                const rData = db.roblox.get(user.id);
                if (!rData || !rData.username) return interaction.reply({ content: `❌ ${user} não tem Roblox vinculado! Use /registrar`, ephemeral: true });
                const pontos = db.pontos.get(user.id) || 0;
                const nivel = getNivel(db.xp.get(user.id)||0);
                const cargo = getCargoNVB(nivel);
                const estilo = rData.estilo ? ESTILOS_AVATAR[rData.estilo]?.nome || rData.estilo : 'Original';
                
                const embed = new EmbedBuilder()
                    .setColor(0xa855f7)
                    .setTitle('🦇 QG NVB — Área de Perfil Roblox')
                    .setDescription(`**👤・perfil-roblox de ${user.username}**`)
                    .setThumbnail(rData.avatarUrl)
                    .addFields(
                        { name: '🎮 Nickname Roblox', value: rData.username, inline: true },
                        { name: '🆔 ID do jogador', value: `${rData.id}`, inline: true },
                        { name: '🏷️ Cargo na NVB', value: `${cargo.tag} ${cargo.nome}`, inline: true },
                        { name: '⭐ Nível', value: `${nivel}`, inline: true },
                        { name: '🪙 Pontos', value: `${pontos}`, inline: true },
                        { name: '🏆 Conquistas', value: `${rData.conquistas||0}`, inline: true },
                        { name: '🎨 Estilo', value: estilo, inline: true },
                        { name: '📅 Entrada', value: rData.entrada || 'N/A', inline: true },
                        { name: '🔥 Sequência', value: `${rData.sequencia||1} dias`, inline: true }
                    )
                    .setImage(rData.avatarUrl)
                    .setFooter({ text: 'Avatar integrado ao perfil NVB' })
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            if (cmd === 'avatar-roblox') {
                const nickOpt = interaction.options.getString('nick');
                const estiloOpt = interaction.options.getString('estilo') || 'original';
                let rData = null;
                let targetUser = interaction.user;
                
                if (nickOpt) {
                    await interaction.deferReply();
                    rData = await getRobloxData(nickOpt);
                    if (!rData) return interaction.editReply({ content: `❌ Roblox **${nickOpt}** não encontrado` });
                } else {
                    rData = db.roblox.get(interaction.user.id);
                    if (!rData || !rData.username) {
                        return interaction.reply({ content: '❌ Você não tem Roblox vinculado! Use **/registrar SeuNick** primeiro, ou informe um nick: `/avatar-roblox nick:SEUNICK`', ephemeral: true });
                    }
                }
                
                const estiloInfo = ESTILOS_AVATAR[estiloOpt] || ESTILOS_AVATAR.original;
                const pontosAtuais = db.pontos.get(targetUser.id) || 0;
                if (pontosAtuais < estiloInfo.custo) {
                    return interaction.reply({ content: `❌ Você precisa de **${estiloInfo.custo} 🪙** para o estilo **${estiloInfo.nome}**! Você tem ${pontosAtuais} 🪙\nGanhe pontos conversando, participando de eventos, etc. Use /pontos`, ephemeral: true });
                }
                
                if (!nickOpt) await interaction.deferReply();
                
                // Desconta pontos se não for grátis
                if (estiloInfo.custo > 0) {
                    db.pontos.set(targetUser.id, pontosAtuais - estiloInfo.custo);
                    let dados = db.roblox.get(targetUser.id) || {};
                    dados.estilo = estiloOpt;
                    db.roblox.set(targetUser.id, dados);
                    addPontos(targetUser.id, TABELA_PONTOS.criar_avatar, 'Criou avatar no editor');
                }
                
                const embed = new EmbedBuilder()
                    .setColor(0xa855f7)
                    .setTitle(`🖼️ Avatar Roblox - ${estiloInfo.nome}`)
                    .setDescription(`**🎨 Editor de Avatar NVB**\n**Estilo:** ${estiloInfo.nome}\n**Descrição:** ${estiloInfo.desc}\n**Custo:** ${estiloInfo.custo} 🪙\n**Saldo restante:** ${db.pontos.get(targetUser.id)||0} 🪙\n\n**Recursos:**\n✅ Enviar avatar do Roblox\n✅ Gerar imagem para Discord\n✅ Escolher formato de perfil\n✅ Atualiza quando trocar de skin no Roblox\n\n**40 estilos disponíveis:** Use o comando novamente com estilo diferente!`)
                    .setThumbnail(rData.avatarUrl)
                    .setImage(rData.avatarUrl)
                    .addFields(
                        { name: '🎮 Roblox', value: rData.username, inline: true },
                        { name: '🆔 ID', value: `${rData.id}`, inline: true },
                        { name: '🎨 Estilo Atual', value: estiloInfo.nome, inline: true }
                    )
                    .setFooter({ text: `Use /perfil para ver avatar integrado | ${estiloInfo.custo > 0 ? '-' + estiloInfo.custo + ' pts' : 'Grátis'}` })
                    .setTimestamp();
                
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`avatar_estilo_vampirico_nvb_${rData.id}`).setLabel('🩸 Vampírico NVB (25)').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`avatar_estilo_anime_${rData.id}`).setLabel('🎌 Anime (25)').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`avatar_estilo_cyberpunk_${rData.id}`).setLabel('🧬 Cyberpunk (50)').setStyle(ButtonStyle.Secondary)
                );
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`avatar_estilo_gotico_${rData.id}`).setLabel('🥀 Gótico (25)').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`avatar_estilo_noite_vampirica_${rData.id}`).setLabel('🦇 Noite Vampírica (25)').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`avatar_loja`).setLabel('🎨 Ver Loja 40 Estilos').setStyle(ButtonStyle.Success)
                );
                
                if (nickOpt) return interaction.editReply({ embeds: [embed], components: [row, row2] });
                return interaction.editReply({ embeds: [embed], components: [row, row2] });
            }

            if (cmd === 'ticket') {
                const titulo = interaction.options.getString('titulo');
                const descricao = interaction.options.getString('descricao');
                let ticketCh = null;
                if (TICKET_CHANNEL_ID) ticketCh = await client.channels.fetch(TICKET_CHANNEL_ID).catch(()=>null);
                if (!ticketCh) ticketCh = interaction.guild.channels.cache.find(c => c.name.includes('ticket'));
                if (!ticketCh) ticketCh = interaction.channel;
                
                const embed = new EmbedBuilder()
                    .setColor(0xa855f7)
                    .setTitle(`🎫 Ticket - ${titulo}`)
                    .setDescription(`**Descrição (texto livre):**\n${descricao}\n\n**Aberto por:** ${interaction.user}\n**Data:** <t:${Math.floor(Date.now()/1000)}:F>\n\nA equipe NVB irá atender!`)
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                    .setTimestamp();
                
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`ticket_atender_${interaction.user.id}`).setLabel('Atender').setStyle(ButtonStyle.Success).setEmoji('✅'),
                    new ButtonBuilder().setCustomId(`ticket_fechar_${interaction.user.id}`).setLabel('Fechar').setStyle(ButtonStyle.Danger).setEmoji('🔒')
                );
                
                await ticketCh.send({ content: `📩 Novo ticket de ${interaction.user} | ${interaction.user.id}`, embeds: [embed], components: [row] });
                return interaction.reply({ content: `✅ Ticket **${titulo}** criado em ${ticketCh}! Você escreveu o que quis lá! 🩸`, ephemeral: true });
            }

            if (cmd === 'chamada') {
                const embed = new EmbedBuilder()
                    .setColor(0xa855f7)
                    .setTitle('🦇 CHAMADA NVB')
                    .setDescription(`**A chamada da NVB está aberta!**\n\nEntre no servidor, confirme sua presença e participe!\n\n🩸 **Uma linhagem que acolhe. Uma família que permanece.**\n\nClique em ✅ para confirmar presença e ganhar **+5 pontos**!`)
                    .setTimestamp()
                    .setFooter({ text: 'QG NVB | Sistema de Chamadas + Verificação' });
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('presenca_confirmar').setLabel('Confirmar Presença (+5 pts)').setStyle(ButtonStyle.Success).setEmoji('✅'),
                    new ButtonBuilder().setCustomId('chamada_verificacao').setLabel('Verificação').setStyle(ButtonStyle.Primary).setEmoji('🛡️')
                );
                const chId = CHAMADA_CHANNEL_ID;
                const targetCh = chId ? interaction.guild.channels.cache.get(chId) : interaction.channel;
                if (targetCh) await targetCh.send({ embeds: [embed], components: [row] });
                return interaction.reply({ content: '📢 Chamada enviada com interação de verificação!', ephemeral: true });
            }

            if (cmd === 'sorteio') {
                const premio = interaction.options.getString('premio');
                const ganhadoresQtd = interaction.options.getInteger('ganhadores') || 1;
                const embed = new EmbedBuilder()
                    .setColor(0xf59e0b)
                    .setTitle('🎁 SORTEIO NVB')
                    .setDescription(`**Prêmio:** ${premio}\n**Ganhadores:** ${ganhadoresQtd}\n\nClique em 🎉 para participar!\n\n**Ganha +20 pontos** se vencer!`)
                    .setFooter({ text: `Criado por ${interaction.user.username}` })
                    .setTimestamp();
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`sorteio_participar_${Date.now()}`).setLabel('Participar 🎉').setStyle(ButtonStyle.Primary).setEmoji('🎉'),
                    new ButtonBuilder().setCustomId(`sorteio_encerrar_${Date.now()}`).setLabel('Encerrar').setStyle(ButtonStyle.Danger).setEmoji('🏆')
                );
                await interaction.channel.send({ embeds: [embed], components: [row] });
                return interaction.reply({ content: `✅ Sorteio **${premio}** criado!`, ephemeral: true });
            }

            if (cmd === 'limpar') {
                const qtd = interaction.options.getInteger('quantidade');
                if (qtd < 1 || qtd > 100) return interaction.reply({ content: '❌ 1-100 apenas', ephemeral: true });
                await interaction.channel.bulkDelete(qtd, true).catch(()=>{});
                return interaction.reply({ content: `🧹 ${qtd} mensagens apagadas!`, ephemeral: true });
            }

            if (cmd === 'aviso') {
                const user = interaction.options.getUser('usuario');
                const motivo = interaction.options.getString('motivo');
                const warns = db.warns.get(user.id) || 0;
                db.warns.set(user.id, warns+1);
                const embed = new EmbedBuilder().setColor(0xf59e0b).setTitle('⚠️ Aviso NVB').setDescription(`${user} recebeu um aviso!\n**Motivo:** ${motivo}\n**Total avisos:** ${warns+1}`).setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            if (cmd === 'silenciar') {
                const user = interaction.options.getUser('usuario');
                const min = interaction.options.getInteger('minutos');
                const member = await interaction.guild.members.fetch(user.id).catch(()=>null);
                if (!member) return interaction.reply({ content: '❌ Membro não encontrado', ephemeral: true });
                await member.timeout(min*60*1000).catch(()=>{});
                return interaction.reply({ content: `🔇 ${user} silenciado por ${min} min!` });
            }

            if (cmd === 'expulsar') {
                const user = interaction.options.getUser('usuario');
                const member = await interaction.guild.members.fetch(user.id).catch(()=>null);
                if (member) await member.kick().catch(()=>{});
                return interaction.reply({ content: `👢 ${user} expulso!` });
            }

            if (cmd === 'banir') {
                const user = interaction.options.getUser('usuario');
                const motivo = interaction.options.getString('motivo') || 'Sem motivo';
                await interaction.guild.members.ban(user.id, { reason: motivo }).catch(()=>{});
                return interaction.reply({ content: `🔨 ${user} banido! Motivo: ${motivo}` });
            }

            if (cmd === 'qg') {
                const embed = new EmbedBuilder().setColor(0xa855f7).setTitle('🦇 QG NVB OPERACIONAL').setDescription(`**Quartel General Nytheris Vampyre Bloodline**\n\n🟢 Bot Online 24h\n📊 Sistemas: 5/5 ativos\n🛡️ Segurança: Ativa\n🎫 Tickets: Canal fixo\n🩸 Membros: ${interaction.guild.memberCount}\n🎮 Roblox: Integrado\n💰 Pontos: Economia ativa\n🎨 Avatar IA: 40 estilos\n\n🌐 Site: https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'qg-nvb-bot.onrender.com'}\nUse /perfil para ver seu Passaporte!`).setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            if (cmd === 'status') {
                const uptime = Math.floor(process.uptime());
                const horas = Math.floor(uptime/3600);
                const mem = (process.memoryUsage().heapUsed/1024/1024).toFixed(1);
                const embed = new EmbedBuilder().setColor(0x22c55e).setTitle('📊 Status QG NVB - Completo').addFields(
                    { name: '🟢 Bot', value: `Online 24h\nUptime: ${horas}h`, inline: true },
                    { name: '📡 Ping', value: `${client.ws.ping}ms`, inline: true },
                    { name: '👥 Membros', value: `${interaction.guild.memberCount}`, inline: true },
                    { name: '💾 Memória', value: `${mem} MB`, inline: true },
                    { name: '🎮 Roblox API', value: 'Operacional', inline: true },
                    { name: '💰 Pontos', value: `${db.pontos.size} usuários`, inline: true },
                    { name: '🖼️ Avatar IA', value: '40 estilos ativos', inline: true },
                    { name: '🏰 Canais', value: `${interaction.guild.channels.cache.size}`, inline: true }
                ).setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            if (cmd === 'setup-qg') {
                await interaction.deferReply({ ephemeral: true });
                const guild = interaction.guild;
                const categoria = await guild.channels.create({ name: '🏰 QG NVB', type: ChannelType.GuildCategory }).catch(()=>null);
                const canais = [
                    { name: '📜・regras', topic: 'Regras NVB' },
                    { name: '📢・anúncios', topic: 'Anúncios oficiais' },
                    { name: '👋・boas-vindas', topic: 'Bem-vindos à NVB +10 pts' },
                    { name: '💬・chat-geral', topic: 'Chat +2 pts por mensagem' },
                    { name: '🎫・tickets', topic: 'Tickets com texto livre' },
                    { name: '👤・perfil-roblox', topic: 'Área de Perfil Roblox' },
                    { name: '🖼️・avatar-roblox', topic: 'Editor com 40 estilos IA' },
                    { name: '🏆・ranking', topic: 'Top 10 ranking' },
                    { name: '📸・clips-e-prints', topic: '+3 pts por print' }
                ];
                for (const c of canais) {
                    await guild.channels.create({ name: c.name, type: ChannelType.GuildText, parent: categoria?.id, topic: c.topic }).catch(()=>{});
                }
                return interaction.editReply({ content: `✅ Estrutura QG NVB criada! ${canais.length} canais + categoria. Bot já gerencia todos! Configure WELCOME_CHANNEL_ID, TICKET_CHANNEL_ID no .env para 100% automático.` });
            }

            if (cmd === 'canal') {
                const acao = interaction.options.getString('acao');
                const nome = interaction.options.getString('nome');
                const canalAlvo = interaction.options.getChannel('canal_alvo');
                
                if (acao === 'criar' && nome) {
                    const novo = await interaction.guild.channels.create({ name: nome, type: ChannelType.GuildText }).catch(()=>null);
                    return interaction.reply({ content: novo ? `✅ Canal ${novo} criado! Bot já gerencia.` : '❌ Erro ao criar', ephemeral: true });
                }
                if (acao === 'deletar' && canalAlvo) {
                    await canalAlvo.delete().catch(()=>{});
                    return interaction.reply({ content: `✅ Canal ${nome || canalAlvo.name} deletado`, ephemeral: true });
                }
                if (acao === 'trancar' && canalAlvo) {
                    await canalAlvo.permissionOverwrites.edit(interaction.guild.id, { SendMessages: false }).catch(()=>{});
                    return interaction.reply({ content: `🔒 ${canalAlvo} trancado!`, ephemeral: true });
                }
                if (acao === 'destrancar' && canalAlvo) {
                    await canalAlvo.permissionOverwrites.edit(interaction.guild.id, { SendMessages: null }).catch(()=>{});
                    return interaction.reply({ content: `🔓 ${canalAlvo} destrancado!`, ephemeral: true });
                }
                if (acao === 'info') {
                    const total = interaction.guild.channels.cache.size;
                    const texto = interaction.guild.channels.cache.map(c => `${c} - ${c.type}`).slice(0,20).join('\n');
                    return interaction.reply({ content: `🏰 Total canais: ${total}\n${texto}`, ephemeral: true });
                }
                return interaction.reply({ content: '❌ Use: /canal criar/deletar/trancar/destrancar/info', ephemeral: true });
            }
        }

        // ===== BOTÕES =====
        if (interaction.isButton()) {
            if (interaction.customId === 'presenca_confirmar') {
                const ja = db.presencas.get(interaction.user.id);
                if (ja && Date.now() - ja < 60000) return interaction.reply({ content: '⏳ Você já confirmou presença há pouco!', ephemeral: true });
                db.presencas.set(interaction.user.id, Date.now());
                addPontos(interaction.user.id, TABELA_PONTOS.chamada, 'Participou de chamada');
                return interaction.reply({ content: `✅ ${interaction.user}, presença confirmada! **+5 pontos** 🩸`, ephemeral: true });
            }
            if (interaction.customId === 'chamada_verificacao') {
                const rData = db.roblox.get(interaction.user.id);
                if (!rData) return interaction.reply({ content: '❌ Você ainda não vinculou Roblox! Use /registrar', ephemeral: true });
                const embed = new EmbedBuilder().setColor(0xa855f7).setTitle('🛡️ Verificação NVB').setDescription(`Clique para verificar:\n🎮 Roblox: ${rData.username}\n\nInteração com mensagens ativa!`).setThumbnail(rData.avatarUrl);
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('iniciar_verificacao').setLabel('Verificar Agora').setStyle(ButtonStyle.Primary).setEmoji('✅'));
                return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
            }
            if (interaction.customId === 'iniciar_verificacao') {
                const modal = new ModalBuilder().setCustomId('modal_verificacao').setTitle('Verificação NVB');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('idade').setLabel('Idade').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('genero').setLabel('Gênero').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('relacionamento').setLabel('Relacionamento').setStyle(TextInputStyle.Short).setRequired(true))
                );
                return interaction.showModal(modal);
            }
            if (interaction.customId.startsWith('ticket_atender_')) {
                return interaction.reply({ content: `✅ Ticket atendido por ${interaction.user}!`, ephemeral: false });
            }
            if (interaction.customId.startsWith('ticket_fechar_')) {
                await interaction.channel.delete().catch(()=>{});
                return;
            }
            if (interaction.customId.startsWith('avatar_estilo_')) {
                const parts = interaction.customId.split('_');
                const estilo = parts[2];
                const rId = parts[3];
                const info = ESTILOS_AVATAR[estilo];
                if (!info) return interaction.reply({ content: 'Estilo não encontrado', ephemeral: true });
                const pontos = db.pontos.get(interaction.user.id) || 0;
                if (pontos < info.custo) return interaction.reply({ content: `❌ Precisa de ${info.custo} 🪙, você tem ${pontos}`, ephemeral: true });
                if (info.custo > 0) db.pontos.set(interaction.user.id, pontos - info.custo);
                let dados = db.roblox.get(interaction.user.id) || {};
                dados.estilo = estilo;
                db.roblox.set(interaction.user.id, dados);
                return interaction.reply({ content: `✅ Avatar alterado para **${info.nome}**! -${info.custo} 🪙\nUse /perfil para ver seu Passaporte NVB com novo estilo!`, ephemeral: true });
            }
            if (interaction.customId === 'avatar_loja') {
                const lista = Object.entries(ESTILOS_AVATAR).map(([k,v])=> `${v.nome} - ${v.custo} 🪙 - ${v.desc}`).join('\n');
                const embed = new EmbedBuilder().setColor(0xa855f7).setTitle('🎨 Loja de Estilos - 40 Estilos').setDescription(lista.substring(0,4000)).setTimestamp();
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            if (interaction.customId.startsWith('sorteio_participar_')) {
                const id = interaction.customId.split('_')[2];
                if (!db.sorteios.has(id)) db.sorteios.set(id, new Set());
                db.sorteios.get(id).add(interaction.user.id);
                return interaction.reply({ content: `🎉 Você entrou no sorteio! Boa sorte!`, ephemeral: true });
            }
            if (interaction.customId.startsWith('sorteio_encerrar_')) {
                const id = interaction.customId.split('_')[2];
                const participantes = db.sorteios.get(id) || new Set();
                if (participantes.size === 0) return interaction.reply({ content: '❌ Ninguém participou', ephemeral: true });
                const ganhadorId = Array.from(participantes)[Math.floor(Math.random()*participantes.size)];
                addPontos(ganhadorId, TABELA_PONTOS.ganhar_evento, 'Ganhou sorteio');
                return interaction.reply({ content: `🏆 Sorteio encerrado! Ganhador: <@${ganhadorId}> +20 pontos!` });
            }

            // ===== BOTÕES DA CENTRAL /NVB =====
            if (interaction.customId.startsWith('nvb_')) {
                const acao = interaction.customId.replace('nvb_', '');
                const userId = interaction.user.id;
                const pontos = db.pontos.get(userId) || 0;
                const xp = db.xp.get(userId) || 0;
                const nivel = getNivel(xp);
                const cargo = getCargoNVB(nivel);
                const rData = db.roblox.get(userId) || {};

                if (acao === 'perfil') {
                    const embed = new EmbedBuilder()
                        .setColor(cargo.cor)
                        .setTitle('🦇 PASSAPORTE NVB')
                        .setThumbnail(rData.avatarUrl || interaction.user.displayAvatarURL({ dynamic: true }))
                        .addFields(
                            { name: '👤 Nick', value: `${interaction.user}`, inline: true },
                            { name: '🎮 Roblox', value: rData.username ? `${rData.username} (ID: ${rData.id})` : 'Não vinculado', inline: true },
                            { name: '🏷️ Cargo', value: `${cargo.tag} - ${cargo.nome}`, inline: true },
                            { name: '⭐ Nível', value: `${nivel} (${xp} XP)`, inline: true },
                            { name: '🪙 Pontos', value: `${pontos}`, inline: true },
                            { name: '🏆 Conquistas', value: `${rData.conquistas||0}`, inline: true },
                            { name: '🎨 Estilo', value: rData.estilo ? ESTILOS_AVATAR[rData.estilo]?.nome || rData.estilo : 'Original', inline: true },
                            { name: '📅 Entrada', value: rData.entrada || 'N/A', inline: true },
                            { name: '🔥 Sequência', value: `${rData.sequencia||1} dias`, inline: true }
                        )
                        .setImage(rData.avatarUrl || null)
                        .setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
                if (acao === 'roblox') {
                    if (!rData.username) return interaction.reply({ content: '❌ Você não tem Roblox vinculado! Use `/registrar SeuNickRoblox`', ephemeral: true });
                    const embed = new EmbedBuilder()
                        .setColor(0xa855f7)
                        .setTitle('🦇 QG NVB — Área de Perfil Roblox')
                        .setThumbnail(rData.avatarUrl)
                        .addFields(
                            { name: '🎮 Nickname Roblox', value: rData.username, inline: true },
                            { name: '🆔 ID do jogador', value: `${rData.id}`, inline: true },
                            { name: '🏷️ Cargo na NVB', value: `${cargo.tag} ${cargo.nome}`, inline: true },
                            { name: '⭐ Nível', value: `${nivel}`, inline: true },
                            { name: '🪙 Pontos', value: `${pontos}`, inline: true },
                            { name: '🏆 Conquistas', value: `${rData.conquistas||0}`, inline: true },
                            { name: '🎨 Estilo', value: rData.estilo ? ESTILOS_AVATAR[rData.estilo]?.nome : 'Original', inline: true },
                            { name: '📅 Entrada', value: rData.entrada || 'N/A', inline: true },
                            { name: '🔥 Sequência', value: `${rData.sequencia||1} dias`, inline: true }
                        )
                        .setImage(rData.avatarUrl)
                        .setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
                if (acao === 'avatar') {
                    if (!rData.username) return interaction.reply({ content: '❌ Vincule seu Roblox primeiro: `/registrar SeuNick`', ephemeral: true });
                    const estiloInfo = ESTILOS_AVATAR[rData.estilo || 'original'] || ESTILOS_AVATAR.original;
                    const embed = new EmbedBuilder()
                        .setColor(0xa855f7)
                        .setTitle(`🖼️・avatar-roblox - ${estiloInfo.nome}`)
                        .setDescription(`**Enviar o avatar do Roblox**\n**Gerar imagem para Discord**\n**Escolher formato de perfil**\n**Atualizar quando trocar de skin**\n\n**Custo por estilo:** 0-50 🪙\n**Seu saldo:** ${pontos} 🪙`)
                        .setThumbnail(rData.avatarUrl)
                        .setImage(rData.avatarUrl)
                        .setTimestamp();
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('avatar_estilo_vampirico_nvb_'+rData.id).setLabel('🩸 Vampírico NVB').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('avatar_estilo_anime_'+rData.id).setLabel('🎌 Anime').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('avatar_loja').setLabel('🎨 Ver 40 Estilos').setStyle(ButtonStyle.Success)
                    );
                    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
                }
                if (acao === 'cargos') {
                    const listaCargos = [
                        '👑 [LDR] Líder Suprema - Nv 20+',
                        '🦇 [CNSL] Conselheiras - Nv 15-19',
                        '💜 [VET+] Veteranas+ - Nv 10-14',
                        '🩸 [VTRN] Veteranas - Nv 6-9',
                        '🌱 [MBRS] Membros - Nv 3-5',
                        '🌿 [NVT] Novatas - Nv 1-2'
                    ].join('\n');
                    const embed = new EmbedBuilder().setColor(0xa855f7).setTitle('🏷️ Cargos NVB').setDescription(listaCargos + `\n\n**Seu cargo atual:** ${cargo.tag} ${cargo.nome} (Nv ${nivel})`).setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
                if (acao === 'conquistas') {
                    const embed = new EmbedBuilder().setColor(0xf59e0b).setTitle('🏆 Conquistas NVB').setDescription(`Você tem **${rData.conquistas||0} conquistas**!\n\n🎮 Vincular Roblox +1\n✅ Verificação +1\n🖼️ Criar avatar +1\n📢 Chamada +1\n🏆 Ganhar evento +1\n🦇 Recrutar membro +1\n\nContinue participando para desbloquear mais!`).setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
                if (acao === 'nivel') {
                    const proxXp = (nivel <= 9) ? [50,150,300,500,800,1200,1700,2300,3000][nivel-1] : (nivel+1)*300;
                    const perc = Math.min(100, Math.floor((xp / proxXp)*100));
                    const barra = '█'.repeat(Math.floor(perc/10)) + '░'.repeat(10 - Math.floor(perc/10));
                    const embed = new EmbedBuilder().setColor(cargo.cor).setTitle(`⭐ Nível NVB - ${interaction.user.username}`).setDescription(`**Nível:** ${nivel}\n**XP:** ${xp} / ${proxXp}\n${barra} ${perc}%\n\n**Cargo:** ${cargo.tag} ${cargo.nome}\n**Próximo cargo:** ${nivel < 20 ? getCargoNVB(nivel+1).tag : 'MÁXIMO!'}`).setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
                if (acao === 'pontos') {
                    const embed = new EmbedBuilder().setColor(0xa855f7).setTitle(`🪙 Pontos NVB - ${pontos} 🪙`).setDescription(`**Tabela Oficial QG NVB:**\n👋 Entrar +10 | ✅ Verificação +10 | 🏷️ TAG +10\n👤 Perfil Roblox +15 | 🖼️ Avatar +10 | 💬 Chat +2\n🎮 Jogatina +5 | 🗣️ Resenha +5 | 🎉 Evento +10\n📢 Chamada +5 | 🎯 Missão +10 | 🏆 Ganhar +20\n🤝 Ajudar +5 | 💡 Sugestão +10 | 📸 Print +3\n🎨 Conteúdo +15 | 🧛 Roblox +5 | 👕 Roupa +5\n📣 Divulgar +5 | 🦇 Recrutar +20 | ⭐ Destaque +50\n\n**Gaste em:** /avatar-roblox (10-50 pts)\n**Seu saldo:** ${pontos} 🪙`).setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
                if (acao === 'ranking') {
                    const sorted = Array.from(db.pontos.entries()).sort((a,b)=>b[1]-a[1]).slice(0,10);
                    let desc = sorted.length ? sorted.map(([id,pts],i)=> `${i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1+'.')} <@${id}> - ${pts} 🪙 | Nv ${getNivel(db.xp.get(id)||0)}`).join('\n') : 'Ninguém tem pontos ainda!';
                    const embed = new EmbedBuilder().setColor(0xf59e0b).setTitle('🏆 Ranking NVB - Top 10').setDescription(desc).setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
                if (acao === 'loja') {
                    const lista = Object.entries(ESTILOS_AVATAR).slice(0,20).map(([k,v])=> `${v.nome} - ${v.custo} 🪙`).join('\n');
                    const embed = new EmbedBuilder().setColor(0xa855f7).setTitle('🎨 Loja NVB - 40 Estilos').setDescription(`**Seu saldo:** ${pontos} 🪙\n\n${lista}\n\n...e mais 20 estilos! Use /avatar-roblox para ver todos!`).setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
            }
        }

        if (interaction.isModalSubmit() && interaction.customId === 'modal_verificacao') {
            const idade = interaction.fields.getTextInputValue('idade');
            const genero = interaction.fields.getTextInputValue('genero');
            const relacionamento = interaction.fields.getTextInputValue('relacionamento');
            db.verificados.add(interaction.user.id);
            addPontos(interaction.user.id, TABELA_PONTOS.verificacao, 'Fez verificação');
            const embed = new EmbedBuilder().setColor(0x00ff00).setTitle('✅ Verificação Enviada').setDescription(`**Idade:** ${idade}\n**Gênero:** ${genero}\n**Relacionamento:** ${relacionamento}\n\n+10 pontos! Verificação enviada para liderança.`).setTimestamp();
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

    } catch(e){ console.error('Erro interaction:', e); try{ if(!interaction.replied) await interaction.reply({ content: '❌ Erro interno', ephemeral: true }); }catch(_){} }
});

client.login(TOKEN).then(()=>console.log('🔑 Login iniciado...')).catch(e=>console.error('❌ Falha login:', e));
registerCommands();

setInterval(()=>{
    try{ if(client.user) client.user.setActivity('QG NVB | Passaporte + Roblox 🦇', { type: 3 }); }catch(_){}
}, 5*60*1000);

// ===== SITE OFICIAL QG NVB - SISTEMA UNIFICADO =====
const SITE_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>QG NVB - Nytheris Vampyre Bloodline</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0a;color:#fff;font-family:Inter,system-ui,sans-serif}
.topbar{position:sticky;top:0;z-index:50;background:#0f0f0f;border-bottom:1px solid #222;display:flex;align-items:center;justify-content:space-between;padding:10px 16px}
.logo{font-weight:800;letter-spacing:1px;border:1px solid #fff;padding:6px 12px;border-radius:10px}
.landing{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;background:radial-gradient(ellipse at center,#2a1840 0%,#0a0a0a 70%)}
.card{max-width:420px;width:100%;text-align:center}
.bat{font-size:64px;margin-bottom:20px}
h1{font-size:42px;font-weight:900;line-height:0.9}
h1 span{color:#a855f7}
.sub{color:#a1a1aa;margin:18px 0 26px;line-height:1.5}
.btn-main{background:#a855f7;color:#fff;border:none;width:100%;padding:16px;border-radius:28px;font-weight:700;font-size:16px;cursor:pointer;margin-bottom:12px}
.btn-secondary{background:#1a1a1a;color:#fff;border:1px solid #333;width:100%;padding:16px;border-radius:28px;font-weight:600;cursor:pointer}
.form-overlay{display:none;position:fixed;inset:0;background:#0a0a0a;z-index:100;overflow-y:auto}
.form-overlay.active{display:block}
.form-header{display:flex;align-items:center;gap:12px;padding:14px;border-bottom:1px solid #222;position:sticky;top:0;background:#0a0a0a}
.progress{height:4px;background:#222}
.progress-bar{height:100%;background:#a855f7;width:0%;transition:width .3s}
.form-body{max-width:600px;margin:0 auto;padding:20px}
.step{display:none}
.step.active{display:block}
.input-group{margin-bottom:16px}
.input-group label{display:block;font-size:13px;color:#a1a1aa;margin-bottom:6px}
.input-group input,.input-group select,.input-group textarea{width:100%;background:#151515;border:1px solid #222;border-radius:10px;padding:12px;color:#fff}
.input-group textarea{min-height:80px}
.chip-group{display:flex;flex-wrap:wrap;gap:8px}
.chip{background:#1a1a1a;border:1px solid #333;padding:8px 12px;border-radius:20px;font-size:13px;cursor:pointer}
.chip.selected{background:#a855f7;border-color:#a855f7}
.feed{max-width:600px;margin:0 auto;padding:12px}
.post{background:#151515;border:1px solid #222;border-radius:16px;padding:14px;margin-bottom:12px;position:relative}
.post.fixed::before{content:'📌 FIXA';position:absolute;top:10px;right:12px;font-size:9px;background:#a855f7;padding:2px 6px;border-radius:10px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}
.info-card{background:#151515;border:1px solid #222;border-radius:12px;padding:12px}
.info-card h4{font-size:12px;color:#a855f7;margin-bottom:6px}
.info-card .v{font-size:13px}
.bottom-nav{position:fixed;bottom:0;left:0;right:0;background:#0f0f0f;border-top:1px solid #222;display:flex;justify-content:space-around;padding:8px 0;z-index:40}
.nav-item{padding:6px 10px;border-radius:10px;cursor:pointer;font-size:18px}
.nav-item.active{background:#a855f7}
.passaporte{background:linear-gradient(135deg,#2a1840 0%,#1a0f2e 100%);border:1px solid #a855f7;border-radius:20px;padding:20px;margin:16px 0}
.admin-item{background:#151515;border:1px solid #222;border-radius:12px;padding:14px;margin-bottom:10px;font-size:13px}
.section{display:none;max-width:600px;margin:0 auto;padding:12px 12px 80px}
.section.active{display:block}
.ranking-item{background:#151515;border:1px solid #222;border-radius:12px;padding:12px;margin-bottom:8px;display:flex;align-items:center;gap:10px}
.ranking-pos{width:32px;height:32px;border-radius:50%;background:#222;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px}
.ranking-pos.gold{background:#f59e0b;color:#000}
.ranking-pos.silver{background:#a1a1aa;color:#000}
.ranking-pos.bronze{background:#92400e;color:#fff}
.cargo-card{background:#151515;border:1px solid #333;border-radius:14px;padding:14px;margin-bottom:10px}
.cargo-card.mod{background:border-color:#22c55e}
.cargo-card.sup{background:border-color:#3b82f6}
.cargo-card.lider{background:border-color:#ef4444}
</style>
</head>
<body>
<div class="topbar" id="topbar"><div class="logo">NVB</div><div style="display:flex;gap:10px"><span>🦇</span><span>🔔<sup style="background:#f59e0b;border-radius:50%;padding:2px 5px;font-size:10px">2</sup></span></div></div>

<div id="view-landing" class="landing">
  <div class="card">
    <div class="bat">🦇</div>
    <h1>Nytheris<br><span>Vampyre<br>Bloodline</span></h1>
    <p class="sub">Uma linhagem que acolhe. Uma família que permanece.<br><br>QG + Bot + Roblox + Pontos + Avatar IA<br>Um único sistema NVB.</p>
    <p style="margin-bottom:18px;color:#71717a;font-size:13px">Quartel General Oficial<br>Bot 24h Online • Recrutamento Aberto • 40 Estilos Avatar<br>📌 Mensagens fixas para sempre</p>
    <button class="btn-main" onclick="openRecrutamento()">Entrar no Recrutamento 🩸</button>
    <button class="btn-secondary" onclick="goToPainel()">Já sou da família - Entrar no QG</button>
    <p style="margin-top:20px;font-size:11px;color:#52525b">🦇 QG NVB • Sistema Unificado • Ranking + Pontos no Site</p>
  </div>
</div>

<div id="view-form" class="form-overlay">
  <div class="form-header"><span style="font-size:24px;cursor:pointer" onclick="closeRecrutamento()">✕</span><b>Recrutamento NVB</b><span id="step-indicator" style="margin-left:auto;color:#71717a;font-size:13px">1/6</span></div>
  <div class="progress"><div id="progress-bar" class="progress-bar"></div></div>
  <div class="form-body">
    <div class="step active" data-step="1"><h2>Quem é você? 🦇</h2><p>Vamos começar com o básico</p>
      <div class="input-group"><label>Seu nick no Discord *</label><input id="f-nick" placeholder="Ex: luna_nvb" /></div>
      <div class="input-group"><label>Sua idade *</label><input id="f-idade" type="number" placeholder="Ex: 19" /></div>
      <div class="input-group"><label>Seu nome (opcional)</label><input id="f-nome" placeholder="Como quer ser chamada?" /></div>
      <button class="btn-main" onclick="nextStep()">Continuar →</button></div>
    <div class="step" data-step="2"><h2>Sobre você 💜</h2>
      <div class="input-group"><label>Gênero / Pronomes</label><select id="f-genero"><option value="">Selecione</option><option value="Feminino - Ela/Dela">Feminino - Ela/Dela</option><option value="Masculino - Ele/Dele">Masculino - Ele/Dele</option><option value="Não-binário - Elu/Delu">Não-binário - Elu/Delu</option><option value="Outro">Outro</option></select></div>
      <div class="input-group"><label>Status de relacionamento</label><div class="chip-group" id="f-relacionamento-chips"><div class="chip" onclick="toggleChip(this)">Solteira</div><div class="chip" onclick="toggleChip(this)">Namorando</div><div class="chip" onclick="toggleChip(this)">Casada</div><div class="chip" onclick="toggleChip(this)">Enrolada</div><div class="chip" onclick="toggleChip(this)">Prefiro não dizer</div></div></div>
      <div class="input-group"><label>Há quanto tempo joga?</label><input id="f-tempo" placeholder="Ex: 2 anos" /></div>
      <button class="btn-main" onclick="nextStep()">Continuar →</button><button class="btn-secondary" onclick="prevStep()">← Voltar</button></div>
    <div class="step" data-step="3"><h2>Sua experiência 🩸</h2>
      <div class="input-group"><label>Já fez parte de outra família?</label><input id="f-familia" placeholder="Ex: Nunca, ou ALC" /></div>
      <div class="input-group"><label>Por que saiu da antiga?</label><textarea id="f-motivo-saida"></textarea></div>
      <div class="input-group"><label>Tem experiência com linhagem vampírica?</label><div class="chip-group" id="f-exp-chips"><div class="chip" onclick="toggleChip(this)">Sim, muita</div><div class="chip" onclick="toggleChip(this)">Um pouco</div><div class="chip" onclick="toggleChip(this)">Nunca, mas quero aprender</div></div></div>
      <button class="btn-main" onclick="nextStep()">Continuar →</button><button class="btn-secondary" onclick="prevStep()">← Voltar</button></div>
    <div class="step" data-step="4"><h2>Por que a NVB? 💜</h2>
      <div class="input-group"><label>O que é família pra você? *</label><textarea id="f-familia-significa"></textarea></div>
      <div class="input-group"><label>Por que quer entrar na NVB? *</label><textarea id="f-porque-nvb"></textarea></div>
      <button class="btn-main" onclick="nextStep()">Continuar →</button><button class="btn-secondary" onclick="prevStep()">← Voltar</button></div>
    <div class="step" data-step="5"><h2>Disponibilidade 📅</h2>
      <div class="input-group"><label>Quanto tempo por dia online?</label><div class="chip-group" id="f-dispo-chips"><div class="chip" onclick="toggleChip(this)">1-2h</div><div class="chip" onclick="toggleChip(this)">3-4h</div><div class="chip" onclick="toggleChip(this)">5h+</div><div class="chip" onclick="toggleChip(this)">O dia todo 😈</div></div></div>
      <div class="input-group"><label>Participa de chamadas de voz?</label><select id="f-chamadas"><option value="">Selecione</option><option value="Sim, amo!">Sim, amo!</option><option value="As vezes">As vezes</option><option value="Sou tímida mas tento">Sou tímida mas tento</option><option value="Prefiro só texto">Prefiro só texto</option></select></div>
      <div class="input-group"><label>Instagram / contato</label><input id="f-contato" /></div>
      <button class="btn-main" onclick="nextStep()">Continuar →</button><button class="btn-secondary" onclick="prevStep()">← Voltar</button></div>
    <div class="step" data-step="6"><h2>Último passo! 🦇</h2>
      <div style="background:#151515;border:1px solid #222;border-radius:12px;padding:14px;margin-bottom:16px;font-size:13px;color:#a1a1aa"><b style="color:#fff">📜 Regras NVB:</b><br>• Respeito acima de tudo<br>• Família é lealdade<br>• Proibido vazar info do QG<br>• Participar de eventos<br>• Ser ativa<br></div>
      <div class="input-group"><label><input type="checkbox" id="f-concorda" style="width:auto;margin-right:8px"> Concordo com as regras *</label></div>
      <div class="input-group"><label>Algo mais?</label><textarea id="f-extra"></textarea></div>
      <button class="btn-main" onclick="enviarRecrutamento()" id="btn-enviar">Enviar Recrutamento 🩸</button><button class="btn-secondary" onclick="prevStep()">← Voltar</button></div>
  </div>
</div>

<div id="view-painel" style="display:none">
  <div id="section-home" class="section active">
    <div class="feed" id="feed"></div>
    <div class="passaporte" id="passaporte-demo">
      <h3 style="color:#a855f7;margin-bottom:12px">🦇 PASSAPORTE NVB (DEMO)</h3>
      <div style="display:flex;gap:12px;align-items:center">
        <div style="width:60px;height:60px;background:#a855f7;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px">🦇</div>
        <div style="font-size:13px;line-height:1.6">
          <b>👤 Nick:</b> @Membro<br>
          <b>🎮 Roblox:</b> NickRoblox<br>
          <b>🏷️ Cargo:</b> [MBRS]<br>
          <b>⭐ Nível:</b> 12 | <b>🪙 Pontos:</b> 684<br>
          <b>🏆 Conquistas:</b> 8 | <b>🎨 Estilo:</b> Vampírico NVB<br>
          <b>📅 Entrada:</b> 28/09/2026 | <b>🔥 Sequência:</b> 7 dias
        </div>
      </div>
    </div>
    <div class="info-grid">
      <div class="info-card"><h4>🤖 Bot</h4><div class="v">QG NVB#4492<br><span style="font-size:11px;color:#22c55e">● Online 24H</span></div></div>
      <div class="info-card"><h4>🏰 Servidor</h4><div class="v">Nytheris Vampyre<br><span style="font-size:10px;color:#71717a">Membros: 10<br>Online: <span id="online-count">-</span></span></div></div>
      <div class="info-card"><h4>📊 Sistemas</h4><div class="v">Passaporte Unificado<br><span style="font-size:10px;color:#71717a">Roblox + Pontos + Avatar IA</span></div></div>
      <div class="info-card"><h4>💜 Família</h4><div class="v">Bloodline<br><span style="font-size:10px;color:#71717a">Linhagem que acolhe</span></div></div>
    </div>
  </div>

  <div id="section-ranking" class="section">
    <h2 style="margin-bottom:16px">🏆 Ranking NVB - Top 10</h2>
    <p style="font-size:12px;color:#71717a;margin-bottom:12px">Ranking fixo atualizado em tempo real - mensagens fixas para sempre!</p>
    <div id="ranking-list"><p>Carregando ranking...</p></div>
    <button class="btn-secondary" onclick="loadRanking()" style="margin-top:12px">🔄 Atualizar Ranking</button>
  </div>

  <div id="section-pontos" class="section">
    <h2 style="margin-bottom:16px">🪙 Banco de Pontos NVB</h2>
    <div style="background:#151515;border:1px solid #a855f7;border-radius:14px;padding:16px;margin-bottom:16px">
      <h3 style="font-size:14px;color:#a855f7;margin-bottom:8px">💰 Tabela Oficial QG NVB</h3>
      <div style="font-size:11px;line-height:1.6;color:#a1a1aa">
        👋 Entrar +10 | ✅ Verificação +10 | 🏷️ TAG +10<br>
        👤 Perfil Roblox +15 | 🖼️ Avatar +10 | 💬 Chat +2<br>
        🎮 Jogatina +5 | 🗣️ Resenha +5 | 🎉 Evento +10<br>
        📢 Chamada +5 | 🎯 Missão +10 | 🏆 Ganhar +20<br>
        🤝 Ajudar +5 | 💡 Sugestão +10 | 📸 Print +3<br>
        🎨 Conteúdo +15 | 🧛 Roblox +5 | 👕 Roupa +5<br>
        📣 Divulgar +5 | 🦇 Recrutar +20 | ⭐ Destaque +50<br>
      </div>
    </div>
    <div id="pontos-list"><p>Carregando pontos...</p></div>
    <button class="btn-secondary" onclick="loadPontos()" style="margin-top:12px">🔄 Atualizar Pontos</button>
  </div>

  <div id="section-cargos" class="section">
    <h2 style="margin-bottom:16px">🏷️ Cargos NVB - Receber Cargos</h2>
    <p style="font-size:12px;color:#71717a;margin-bottom:16px">Como receber cargos de Moderação, Suporte e outros no QG</p>
    
    <div class="cargo-card lider">
      <h4>👑 [LDR] Líder - Nível 20+</h4>
      <p style="font-size:12px;color:#a1a1aa;margin:6px 0">Comando total do QG, gerencia tudo</p>
      <small style="color:#71717a">Requisito: 6000+ XP • Escolhida pela fundadora</small>
    </div>
    <div class="cargo-card mod">
      <h4>🛡️ [MOD] Moderação - Nível 15+</h4>
      <p style="font-size:12px;color:#a1a1aa;margin:6px 0">Modera chat, aplica avisos, silencia, bane</p>
      <small style="color:#71717a">Requisito: 3000+ XP • /aviso /silenciar /banir liberados • Pedir em #tickets</small>
      <br><button class="btn-secondary" style="margin-top:8px;padding:8px 12px;font-size:12px" onclick="alert('Para receber [MOD]: Abra ticket no Discord com título Candidatura Moderação + motive por que quer ser mod!')">📩 Solicitar Moderação</button>
    </div>
    <div class="cargo-card sup">
      <h4>💙 [SUP] Suporte - Nível 10+</h4>
      <p style="font-size:12px;color:#a1a1aa;margin:6px 0">Ajuda novos membros, tira dúvidas, suporte Roblox</p>
      <small style="color:#71717a">Requisito: 1200+ XP • Conhecer sistema Roblox + Avatar • Pedir em #tickets</small>
      <br><button class="btn-secondary" style="margin-top:8px;padding:8px 12px;font-size:12px" onclick="alert('Para receber [SUP]: Abra ticket com título Candidatura Suporte! Precisa ter perfil Roblox vinculado!')">📩 Solicitar Suporte</button>
    </div>
    <div class="cargo-card">
      <h4>⭐ [VET+] Veterana+ - Nível 10-14</h4>
      <p style="font-size:12px;color:#a1a1aa">Membros experientes, ajudam na resenha e jogatina</p>
      <small style="color:#71717a">Auto por XP - 1200 XP</small>
    </div>
    <div class="cargo-card">
      <h4>🩸 [VTRN] Veterana - Nível 6-9</h4>
      <p style="font-size:12px;color:#a1a1aa">Participa ativamente, já conhece a família</p>
      <small style="color:#71717a">Auto por XP - 500 XP</small>
    </div>
    <div class="cargo-card">
      <h4>🌱 [MBRS] Membro - Nível 3-5</h4>
      <p style="font-size:12px;color:#a1a1aa">Membro oficial da família NVB</p>
      <small style="color:#71717a">Auto por XP - 150 XP</small>
    </div>
    <div class="cargo-card">
      <h4>🌿 [NVT] Novata - Nível 1-2</h4>
      <p style="font-size:12px;color:#a1a1aa">Recém chegada, em período de adaptação</p>
      <small style="color:#71717a">Cargo inicial automático ao entrar</small>
    </div>
  </div>

  <div id="section-conquistas" class="section">
    <h2>🏆 Conquistas NVB</h2>
    <div style="margin-top:16px" id="conquistas-list">
      <div class="info-card"><h4>🎮 Vincular Roblox</h4><div class="v">Use /registrar • +15 pts +1 conquista</div></div>
      <div class="info-card" style="margin-top:8px"><h4>✅ Verificação</h4><div class="v">Complete verificação • +10 pts</div></div>
      <div class="info-card" style="margin-top:8px"><h4>🖼️ Criar Avatar</h4><div class="v">Use /avatar-roblox • +10 pts</div></div>
    </div>
  </div>
</div>

<div class="bottom-nav" id="bottom-nav" style="display:none">
  <div class="nav-item active" onclick="navClick(this,'home')">🏠</div>
  <div class="nav-item" onclick="navClick(this,'ranking')">🏆</div>
  <div class="nav-item" onclick="navClick(this,'pontos')">🪙</div>
  <div class="nav-item" onclick="navClick(this,'cargos')">🏷️</div>
  <div class="nav-item" onclick="navClick(this,'conquistas')">🏆</div>
</div>

<div id="view-admin" style="display:none;max-width:600px;margin:0 auto;padding:16px"><h2 style="margin-bottom:16px">📋 Recrutamentos NVB (Admin)</h2><div id="admin-list">Carregando...</div><button class="btn-secondary" onclick="goToPainel()">← Voltar pro QG</button></div>

<script>
let currentStep=1;let totalSteps=6;
function openRecrutamento(){document.getElementById('view-form').classList.add('active');document.getElementById('view-landing').style.display='none';updateProgress();}
function closeRecrutamento(){document.getElementById('view-form').classList.remove('active');document.getElementById('view-landing').style.display='flex';}
function goToPainel(){
  try{
    document.getElementById('view-landing').style.display='none';
    document.getElementById('view-form').classList.remove('active');
    document.getElementById('view-painel').style.display='block';
    document.getElementById('bottom-nav').style.display='flex';
    document.getElementById('topbar').style.display='flex';
    let a=document.getElementById('view-admin');if(a)a.style.display='none';
    showSection('home');
    loadFeed();loadRanking();loadPontos();
    localStorage.setItem('nvb_recru_done','1');
  }catch(e){document.getElementById('view-painel').style.display='block';document.getElementById('bottom-nav').style.display='flex';}
}
function updateProgress(){let pct=(currentStep/totalSteps)*100;document.getElementById('progress-bar').style.width=pct+'%';document.getElementById('step-indicator').innerText=currentStep+'/'+totalSteps;document.querySelectorAll('.step').forEach(s=>{s.classList.remove('active');if(parseInt(s.dataset.step)===currentStep)s.classList.add('active');});}
function nextStep(){if(currentStep===1){if(!document.getElementById('f-nick').value||!document.getElementById('f-idade').value){alert('Preencha nick e idade!');return;}}if(currentStep===4){if(!document.getElementById('f-familia-significa').value||!document.getElementById('f-porque-nvb').value){alert('Essa parte é obrigatória! 💜');return;}}if(currentStep<totalSteps){currentStep++;updateProgress();}}
function prevStep(){if(currentStep>1){currentStep--;updateProgress();}}
function toggleChip(el){el.classList.toggle('selected');}
function getChipValues(id){let chips=document.querySelectorAll('#'+id+' .chip.selected');return Array.from(chips).map(c=>c.innerText).join(', ');}
async function enviarRecrutamento(){
  if(!document.getElementById('f-concorda').checked){alert('Concorda com as regras!');return;}
  let btn=document.getElementById('btn-enviar');btn.innerText='Enviando...';btn.disabled=true;
  let data={nick:document.getElementById('f-nick').value,nome:document.getElementById('f-nome').value,idade:document.getElementById('f-idade').value,genero:document.getElementById('f-genero').value,relacionamento:getChipValues('f-relacionamento-chips'),tempo:document.getElementById('f-tempo').value,familiaAnterior:document.getElementById('f-familia').value,motivoSaida:document.getElementById('f-motivo-saida').value,experiencia:getChipValues('f-exp-chips'),familiaSignifica:document.getElementById('f-familia-significa').value,porqueNVB:document.getElementById('f-porque-nvb').value,disponibilidade:getChipValues('f-dispo-chips'),chamadas:document.getElementById('f-chamadas').value,contato:document.getElementById('f-contato').value,extra:document.getElementById('f-extra').value,data:new Date().toLocaleString('pt-BR')};
  try{let res=await fetch('/api/recrutamento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(res.ok){alert('✅ Recrutamento enviado! Bem-vinda à família NVB! 🦇💜');goToPainel();}else{throw new Error();}}catch(e){let lista=JSON.parse(localStorage.getItem('nvb_recrus')||'[]');lista.push(data);localStorage.setItem('nvb_recrus',JSON.stringify(lista));alert('✅ Recrutamento salvo local! (bot offline)');goToPainel();}
}
async function loadFeed(){
  let feed=document.getElementById('feed');if(!feed)return;
  let fixas=[
    {avatar:'📌',user:'QG NVB OFICIAL',text:'🦇 BEM-VINDA AO QG NYTHERIS VAMPYRE BLOODLINE! Uma linhagem que acolhe. Uma família que permanece. 📌 Esta mensagem é FIXA para sempre!',likes:999,comments:0,fixed:true},
    {avatar:'🏆',user:'SISTEMA RANKING',text:'🏆 RANKING E PONTOS AGORA NO SITE! Vá na aba Ranking para ver Top 10 e Pontos para ver sua pontuação! Sistema 100% integrado Discord + Site + Roblox!',likes:100,comments:10,fixed:true},
    {avatar:'🏷️',user:'CARGOS NVB',text:'🏷️ COMO RECEBER CARGOS: [MOD] Moderação e [SUP] Suporte - vá na aba Cargos no site e clique em Solicitar! Requisitos: XP + atividade!',likes:50,comments:5,fixed:true},
    {avatar:'💜',user:'BOT NVB',text:'💜 BOT GERENCIA TODOS OS CANAIS! Use /setup-qg para criar estrutura, /canal para gerenciar, /nvb para painel central!',likes:75,comments:8,fixed:true}
  ];
  try{
    let res=await fetch('/api/posts');let posts=await res.json();
    let todos=fixas.concat(posts);
    let html='';
    for(let p of todos){
      html+='<div class="post '+(p.fixed?'fixed':'')+'"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:20px">'+p.avatar+'</span><b>'+p.user+'</b>'+(p.fixed?'<span style="font-size:9px;background:#a855f7;padding:2px 6px;border-radius:8px;margin-left:6px">FIXA PARA SEMPRE</span>':'')+'</div><p style="font-size:14px;line-height:1.5;margin-bottom:10px">'+p.text+'</p><div style="display:flex;gap:12px;color:#71717a;font-size:13px">❤️ '+p.likes+' 💬 '+p.comments+'</div></div>';
    }
    feed.innerHTML=html;
  }catch(e){
    let html='';
    for(let p of fixas){
      html+='<div class="post fixed"><div style="display:flex;align-items:center;gap:8px"><span>'+p.avatar+'</span><b>'+p.user+'</b> <span style="font-size:9px;background:#a855f7;padding:2px 6px;border-radius:8px">FIXA</span></div><p>'+p.text+'</p></div>';
    }
    feed.innerHTML=html;
  }
}
async function loadRanking(){
  let el=document.getElementById('ranking-list');if(!el)return;
  try{
    let res=await fetch('/api/ranking');let data=await res.json();
    if(data.length===0){el.innerHTML='<p style="color:#71717a">Ninguém tem pontos ainda! Converse no Discord para ganhar!</p>';return;}
    let html='';
    for(let i=0;i<data.length;i++){
      let u=data[i];
      let posClass=i===0?'gold':i===1?'silver':i===2?'bronze':'';
      let medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1);
      html+='<div class="ranking-item"><div class="ranking-pos '+posClass+'">'+medal+'</div><div style="flex:1"><b>'+(u.robloxUsername||'Membro '+u.discordId.slice(0,4))+'</b><br><small style="color:#71717a">'+(u.cargo||'NVT')+' • Nv '+u.nivel+' • '+u.xp+' XP</small></div><div style="font-weight:800;color:#a855f7">'+u.pontos+' 🪙</div></div>';
    }
    el.innerHTML=html;
  }catch(e){el.innerHTML='<p>Erro ao carregar ranking. Use /ranking no Discord!</p>';}
}
async function loadPontos(){
  let el=document.getElementById('pontos-list');if(!el)return;
  try{
    let res=await fetch('/api/passaportes');let data=await res.json();
    if(data.length===0){el.innerHTML='<p style="color:#71717a">Nenhum passaporte ainda!</p>';return;}
    data.sort((a,b)=>b.pontos-a.pontos);
    let html='';
    for(let j=0;j<Math.min(20,data.length);j++){
      let u=data[j];
      let avatarImg=u.avatarUrl?'<img src="'+u.avatarUrl+'" style="width:40px;height:40px;border-radius:50%">':'🦇';
      html+='<div class="ranking-item"><div style="width:40px;height:40px;border-radius:50%;background:#222;display:flex;align-items:center;justify-content:center">'+avatarImg+'</div><div style="flex:1"><b>'+(u.username||u.discordId)+'</b><br><small style="color:#71717a">'+(u.entrada||'N/A')+' • '+(u.conquistas||0)+' conquistas</small></div><div style="text-align:right"><div style="font-weight:800">'+u.pontos+' 🪙</div><small style="color:#71717a">Nv '+u.nivel+'</small></div></div>';
    }
    el.innerHTML=html;
  }catch(e){el.innerHTML='<p>Erro ao carregar pontos</p>';}
}
function showSection(name){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  let target=document.getElementById('section-'+name);if(target)target.classList.add('active');
}
function navClick(el,page){
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));el.classList.add('active');
  if(page==='home')showSection('home');
  if(page==='ranking'){showSection('ranking');loadRanking();}
  if(page==='pontos'){showSection('pontos');loadPontos();}
  if(page==='cargos'){showSection('cargos');}
  if(page==='conquistas'){showSection('conquistas');}
}
if(window.location.hash==='#admin'){showAdmin();}
function showAdmin(){document.getElementById('view-landing').style.display='none';document.getElementById('view-painel').style.display='none';document.getElementById('bottom-nav').style.display='none';document.getElementById('view-admin').style.display='block';loadAdmin();}
async function loadAdmin(){
  let list=document.getElementById('admin-list');
  try{
    let res=await fetch('/api/recrutamentos');let data=await res.json();
    if(data.length===0){list.innerHTML='<p>Nenhum recrutamento ainda.</p>';return;}
    let html='';
    for(let i=data.length-1;i>=0;i--){
      let r=data[i];
      html+='<div class="admin-item"><b>🦇 '+r.nick+' ('+r.idade+' anos)</b><br><span style="font-size:12px;color:#71717a">'+r.data+'</span><br><br><b>Por que NVB:</b> '+r.porqueNVB+'<br><b>Família pra ela:</b> '+r.familiaSignifica+'<br><b>Contato:</b> '+(r.contato||'Não informado')+'<br></div>';
    }
    list.innerHTML=html;
  }catch(e){
    let local=JSON.parse(localStorage.getItem('nvb_recrus')||'[]');
    if(local.length){
      let html='';
      for(let r of local){html+='<div class="admin-item"><b>'+r.nick+'</b><br>'+r.porqueNVB+'</div>';}
      list.innerHTML=html;
    }else{list.innerHTML='<p>Erro ao carregar</p>';}
  }
}
</script>
</body>
</html>`;

http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (req.url === '/api/recrutamento' && req.method === 'POST') {
        let body=''; req.on('data', c=>body+=c); req.on('end', async ()=>{
            try {
                const data=JSON.parse(body); data.id=Date.now(); db.recrutamentos.push(data);
                console.log(`🩸 Novo recrutamento: ${data.nick}`);
                try {
                    let channel=null;
                    if (RECRUT_CHANNEL_ID) { try{ channel=await client.channels.fetch(RECRUT_CHANNEL_ID).catch(()=>null); if(!channel) channel=client.channels.cache.get(RECRUT_CHANNEL_ID);}catch(e){} }
                    if (!channel) {
                        const guild=client.guilds.cache.get(GUILD_ID)||client.guilds.cache.first();
                        if (guild) channel=guild.channels.cache.find(c=>c.name.includes('recrut')||c.name.includes('qg'))||guild.channels.cache.find(c=>c.isTextBased&&c.isTextBased());
                    }
                    if (channel && channel.send) {
                        const embed=new EmbedBuilder().setColor(0xa855f7).setTitle('🦇 Novo Recrutamento NVB!').setDescription(`**${data.nick}** quer entrar!`).addFields(
                            { name:'👤 Idade', value:String(data.idade||'N/A'), inline:true },
                            { name:'💜 Gênero', value:String(data.genero||'N/A'), inline:true },
                            { name:'📱 Contato', value:String(data.contato||'N/A'), inline:true },
                            { name:'🩸 Por que NVB?', value:(data.porqueNVB||'').substring(0,500)||'N/A' }
                        ).setFooter({ text:`ID: ${data.id} | ${data.data}` }).setTimestamp();
                        await channel.send({ embeds:[embed] }).catch(e=>console.error(e.message));
                    }
                } catch(e){ console.error('Erro enviar recrut Discord:', e.message); }
                res.writeHead(200, { 'Content-Type':'application/json' }); res.end(JSON.stringify({ success:true, id:data.id }));
            } catch(e){ res.writeHead(400, { 'Content-Type':'application/json' }); res.end(JSON.stringify({ error:'Invalid JSON' })); }
        }); return;
    }
    if (req.url === '/api/recrutamentos' && req.method === 'GET') { res.writeHead(200, { 'Content-Type':'application/json' }); res.end(JSON.stringify(db.recrutamentos)); return; }
    if (req.url === '/api/posts' && req.method === 'GET') { res.writeHead(200, { 'Content-Type':'application/json' }); res.end(JSON.stringify(db.posts)); return; }
    if (req.url === '/api/passaportes' && req.method === 'GET') {
        const lista = Array.from(db.roblox.entries()).map(([id,d])=>({ discordId:id, ...d, pontos: db.pontos.get(id)||0, xp: db.xp.get(id)||0, nivel: getNivel(db.xp.get(id)||0), cargo: getCargoNVB(getNivel(db.xp.get(id)||0)).tag }));
        res.writeHead(200, { 'Content-Type':'application/json' }); res.end(JSON.stringify(lista)); return;
    }
    if (req.url === '/api/ranking' && req.method === 'GET') {
        const lista = Array.from(db.pontos.entries()).map(([id,pts])=>{
            const xp = db.xp.get(id)||0;
            const r = db.roblox.get(id)||{};
            return { discordId:id, pontos:pts, xp, nivel:getNivel(xp), cargo:getCargoNVB(getNivel(xp)).tag, robloxUsername:r.username||null, avatarUrl:r.avatarUrl||null };
        }).sort((a,b)=>b.pontos-a.pontos).slice(0,20);
        res.writeHead(200, { 'Content-Type':'application/json' }); res.end(JSON.stringify(lista)); return;
    }
    if (req.url === '/api/pontos' && req.method === 'GET') {
        const lista = Array.from(db.pontos.entries()).map(([id,pts])=>{
            const xp = db.xp.get(id)||0;
            return { discordId:id, pontos:pts, xp, nivel:getNivel(xp), cargo:getCargoNVB(getNivel(xp)).tag };
        }).sort((a,b)=>b.pontos-a.pontos);
        res.writeHead(200, { 'Content-Type':'application/json' }); res.end(JSON.stringify(lista)); return;
    }
    res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8' }); res.end(SITE_HTML);
}).listen(PORT, ()=>{ console.log(`🌐 SITE UNIFICADO rodando na porta ${PORT}`); });

process.on('unhandledRejection', err=>console.error('❌ Erro:', err));
process.on('uncaughtException', err=>console.error('❌ Exceção:', err));
