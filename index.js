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
                return interaction.reply(
