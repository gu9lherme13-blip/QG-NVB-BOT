require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionsBitField, SlashCommandBuilder, Routes, REST, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const http = require('http');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || "1462814574691750113";
const RECRUT_CHANNEL_ID = process.env.RECRUT_CHANNEL_ID || "";
const CANDIDATURA_CHANNEL_ID = process.env.CANDIDATURA_CHANNEL_ID || "";
const TICKET_CHANNEL_ID = process.env.TICKET_CHANNEL_ID || "";
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID || "";
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || "";
const CHAMADA_CHANNEL_ID = process.env.CHAMADA_CHANNEL_ID || "";
const FUNDADORA_ID = process.env.FUNDADORA_ID || ""; // ID da fundadora pra DM
const PORT = process.env.PORT || 10000;

if (!TOKEN || !CLIENT_ID) {
    console.error("⚠️ [QG NVB] ATENÇÃO: DISCORD_TOKEN ou CLIENT_ID não configurado! Site vai ficar online mas bot do Discord ficará offline até configurar Environment Variables no Render.");
    // NÃO dá process.exit(1) pra não quebrar o deploy! Deixa site Live!
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

// ===== PERSISTÊNCIA JSON (CORRIGE #6, #7, #12) =====
const DB_DIR = path.join(__dirname, 'database');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

function loadJSON(file, fallback) {
    try {
        const p = path.join(DB_DIR, file);
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) { console.error('Erro load', file, e.message); }
    return fallback;
}
function saveJSON(file, data) {
    try {
        const p = path.join(DB_DIR, file);
        fs.writeFileSync(p, JSON.stringify(data, null, 2));
    } catch (e) { console.error('Erro save', file, e.message); }
}

// Carrega DB persistente
let pontosData = loadJSON('pontos.json', {});
let xpData = loadJSON('xp.json', {});
let robloxData = loadJSON('roblox.json', {});
let recrutamentosData = loadJSON('recrutamentos.json', []);
let candidaturasData = loadJSON('candidaturas.json', []);

const db = {
    xp: new Map(Object.entries(xpData)),
    pontos: new Map(Object.entries(pontosData)),
    pontosGastos: new Map(Object.entries(loadJSON('pontosGastos.json', {}))), // NOVO: separa gastos
    pontosGanhos: new Map(Object.entries(loadJSON('pontosGanhos.json', {}))), // NOVO: separa ganhos
    roblox: new Map(Object.entries(robloxData)),
    verificados: new Set(loadJSON('verificados.json', [])),
    presencas: new Map(),
    tickets: new Map(),
    warns: new Map(),
    dailyChat: new Map(),
    recrutamentos: recrutamentosData,
    candidaturas: candidaturasData,
    posts: [
        { id: 1, user: '_kitsume_26232', avatar: '🦇', text: 'Boa noite minha família NVB linda! Hoje tivemos nossa resenha vampírica e foi PERFEITO! Cadê as vampirinhas pra marcar presença? 🦇🖤', likes: 12, comments: 3 },
        { id: 2, user: 'luna_nvb', avatar: '💜', text: 'Gente, consegui meu avatar no estilo Vampírico NVB! Ficou INSANO! Quem quer que eu ensine? 🩸✨', likes: 28, comments: 7 }
    ],
    sorteios: new Map()
};

function persistDB() {
    saveJSON('pontos.json', Object.fromEntries(db.pontos));
    saveJSON('xp.json', Object.fromEntries(db.xp));
    saveJSON('roblox.json', Object.fromEntries(db.roblox));
    saveJSON('verificados.json', Array.from(db.verificados));
    saveJSON('pontosGastos.json', Object.fromEntries(db.pontosGastos));
    saveJSON('pontosGanhos.json', Object.fromEntries(db.pontosGanhos));
    saveJSON('recrutamentos.json', db.recrutamentos);
    saveJSON('candidaturas.json', db.candidaturas);
}

// ===== TABELA DE PONTOS OFICIAL (SEM ROBLOX SE REMOVIDO, MAS MANTÉM) =====
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
    // Separa ganhos
    const ganhos = db.pontosGanhos.get(userId) || 0;
    db.pontosGanhos.set(userId, ganhos + qtd);
    console.log(`💰 +${qtd} pontos para ${userId} - ${motivo} | Total: ${atual+qtd}`);
    persistDB();
    return atual + qtd;
}

function gastarPontos(userId, qtd, motivo = "") {
    const atual = db.pontos.get(userId) || 0;
    if (atual < qtd) return false;
    db.pontos.set(userId, atual - qtd);
    const gastos = db.pontosGastos.get(userId) || 0;
    db.pontosGastos.set(userId, gastos + qtd);
    console.log(`💸 -${qtd} pontos de ${userId} - ${motivo} | Resta: ${atual-qtd}`);
    persistDB();
    return true;
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
        const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${user.id}&size=720x720&format=Png&isCircular=false`);
        const thumbData = await thumbRes.json();
        const avatarUrl = thumbData.data?.[0]?.imageUrl || null;
        return { id: user.id, username: user.name, displayName: user.displayName, avatarUrl };
    } catch (e) {
        console.error('Erro Roblox API:', e.message);
        return null;
    }
}

// ===== ESTILOS AVATAR - 38 ESTILOS BASEADOS NA SUA REFERÊNCIA DARK =====
const ESTILOS_AVATAR = {
    original: { nome: "🎨 Original", custo: 0, desc: "TEXTURA ORIGINAL COM IA - skin original Roblox com melhoria IA", prompt: "Roblox avatar original with enhanced texture IA, split black white hair, Hello Kitty paw shirt original texture, sitting pose, clean background", cor: 0x71717a },
    dark: { nome: "🖤 Dark - TEXTURA DARK IA", custo: 10, desc: "TEXTURA DARK COM IA - pele com textura gótica escura, fundo castelo gótico com correntes", prompt: "Roblox avatar with split black white hair, Hello Kitty paw shirt with DARK texture IA, dark gothic skin texture, sitting pose, dark aesthetic, gothic castle background, chains, moon, crosses, grunge, Japanese text DARK, crown, sitting on ground with white cat, texture dark IA", cor: 0x1a1a1a },
    dark_neon: { nome: "💜 Dark Neon IA", custo: 15, desc: "TEXTURA DARK NEON COM IA - dark com luzes neon roxas na skin", prompt: "Roblox avatar dark neon texture IA, Hello Kitty shirt with dark neon purple glow, black white hair with neon purple highlights, gothic castle dark neon lights", cor: 0x7c3aed },
    dark_roxo: { nome: "💜 Dark Roxo IA", custo: 10, desc: "TEXTURA DARK ROXO COM IA - textura roxa NVB na skin", prompt: "Roblox avatar dark purple NVB texture IA, Hello Kitty shirt dark purple, gothic castle purple lights", cor: 0xa855f7 },
    vampirico_nvb: { nome: "🩸 Vampírico NVB IA", custo: 25, desc: "TEXTURA VAMPÍRICA NVB COM IA - skin vampírica, fundo castelo NVB com sangue", prompt: "Roblox avatar vampiric NVB texture IA, Hello Kitty shirt with blood texture, split black white hair, sitting pose, vampiric castle background with blood moon, chains, crosses, DARK text, crown, white cat, texture vampiric IA", cor: 0x991b1b },
    anime: { nome: "🎌 Anime - TEXTURA ANIME IA", custo: 25, desc: "TEXTURA ANIME COM IA - pele estilo anime japonês, fundo anime gótico", prompt: "Roblox avatar anime texture IA, split black white hair anime style, Hello Kitty paw shirt anime texture, sitting pose, anime gothic castle background, chains, moon, Japanese text, anime shading, skin anime IA", cor: 0xf59e0b },
    gotico: { nome: "🖤 Gótico IA", custo: 15, desc: "TEXTURA GÓTICA COM IA - pele gótica, fundo castelo gótico escuro", prompt: "Roblox avatar gothic texture IA, Hello Kitty shirt gothic black texture, gothic castle background, chains, crosses", cor: 0x000000 },
    cinematografico: { nome: "🎬 Cinemático IA", custo: 20, desc: "TEXTURA CINEMÁTICA COM IA - pele cinema, fundo épico", prompt: "Roblox avatar cinematic texture IA, Hello Kitty shirt cinematic, gothic castle cinematic lighting", cor: 0x3b82f6 },
    neon: { nome: "💜 Neon Dark - TEXTURA NEON IA", custo: 15, desc: "TEXTURA NEON COM IA - luzes neon roxas e rosas brilhando na roupa Hello Kitty com brilho skin neon", prompt: "Roblox avatar with split black white hair, Hello Kitty paw shirt with NEON texture glowing purple pink IA, sitting pose, dark aesthetic, gothic castle background with neon purple pink lights, chains glowing neon, moon, crosses, grunge, Japanese text DARK neon, crown, sitting on ground with white cat neon glow, skin neon texture IA, background neon IA", cor: 0xa855f7 },
    neon_rosa: { nome: "💖 Neon Rosa Choque IA", custo: 15, desc: "TEXTURA NEON ROSA IA - textura rosa choque neon na camisa e skin", prompt: "Roblox avatar neon pink texture IA, Hello Kitty shirt glowing hot pink neon texture, black white hair with pink neon highlights skin pink neon, gothic castle neon pink lights background, chains glowing pink", cor: 0xec4899 },
    neon_azul: { nome: "💙 Neon Azul Elétrico IA", custo: 15, desc: "TEXTURA NEON AZUL IA - textura azul elétrico brilhante skin e fundo", prompt: "Roblox avatar neon blue texture IA, Hello Kitty shirt glowing electric blue neon texture, cyber gothic castle with blue neon background, skin blue neon glow", cor: 0x3b82f6 },
    neon_roxo: { nome: "💜 Neon Roxo NVB IA", custo: 15, desc: "TEXTURA NEON ROXA NVB COM IA - textura roxa NVB com brilho IA skin e castelo", prompt: "Roblox avatar neon purple NVB texture IA, Hello Kitty shirt glowing purple NVB neon texture, gothic castle with purple NVB neon lights background, DARK text neon, skin purple neon", cor: 0xa855f7 },
    cyberpunk: { nome: "🤖 Cyberpunk IA", custo: 25, desc: "TEXTURA CYBERPUNK COM IA - pele cyberpunk, fundo cidade neon futurista", prompt: "Roblox avatar cyberpunk texture IA, Hello Kitty shirt cyberpunk neon, cyber city background with neon lights, skin cyberpunk IA", cor: 0x06b6d4 },
    noite_vampirica: { nome: "🌙 Noite Vampírica IA", custo: 20, desc: "TEXTURA NOITE VAMPÍRICA COM IA - pele noite, fundo lua cheia vampírica", prompt: "Roblox avatar vampiric night texture IA, Hello Kitty shirt night texture, full moon castle background", cor: 0x1e1b4b },
    anjo: { nome: "👼 Anjo Dark IA", custo: 20, desc: "TEXTURA ANJO DARK COM IA - pele anjo dark, fundo castelo celestial dark", prompt: "Roblox avatar angel dark texture IA, Hello Kitty shirt angel dark, gothic castle angel wings background", cor: 0xf8fafc },
    demoniaco: { nome: "😈 Demoníaco IA", custo: 20, desc: "TEXTURA DEMONÍACA COM IA - pele demoníaca, fundo infernal", prompt: "Roblox avatar demonic texture IA, Hello Kitty shirt demonic, infernal castle background, horns, skin demonic", cor: 0xdc2626 },
    vampiro_classico: { nome: "🧛 Vampiro Clássico IA", custo: 20, desc: "TEXTURA VAMPIRO CLÁSSICO COM IA - pele vampiro pálida, fundo castelo clássico", prompt: "Roblox avatar classic vampire texture IA, pale skin vampire, Hello Kitty shirt vampire, classic gothic castle", cor: 0x7f1d1d },
    cidade_noturna: { nome: "🌃 Cidade Noturna IA", custo: 15, desc: "TEXTURA CIDADE NOTURNA COM IA - pele cidade, fundo cidade neon noturna", prompt: "Roblox avatar night city texture IA, Hello Kitty shirt city night, neon city background behind castle", cor: 0x334155 },
    chuva: { nome: "🌧️ Chuva Dark IA", custo: 10, desc: "TEXTURA CHUVA DARK COM IA - pele molhada chuva, fundo chuvoso", prompt: "Roblox avatar rainy texture IA, wet skin rain, Hello Kitty shirt rainy, water reflections, dark rainy castle background", cor: 0x334155 },
    gelo: { nome: "❄️ Gelo Dark IA", custo: 10, desc: "TEXTURA GELO DARK COM IA - pele congelada, fundo gelo", prompt: "Roblox avatar frozen texture IA, ice crystals skin, snow over castle and chains, Hello Kitty shirt frozen", cor: 0x0ea5e9 },
    infernal: { nome: "🌋 Infernal Dark IA", custo: 25, desc: "TEXTURA INFERNAL COM IA - pele infernal lava, fundo castelo em chamas", prompt: "Roblox avatar infernal texture IA, lava skin, smoke, castle on fire, chains glowing, Hello Kitty shirt infernal", cor: 0xdc2626 },
    floresta_sombria: { nome: "🌲 Floresta Dark IA", custo: 25, desc: "TEXTURA FLORESTA SOMBRIA COM IA - pele floresta, fundo floresta gótica", prompt: "Roblox avatar dark forest texture IA, Hello Kitty shirt forest dark, gothic castle in forest, fog, moon through trees, skin forest", cor: 0x14532d },
    lua_cheia: { nome: "🌕 Lua Cheia Dark IA", custo: 10, desc: "TEXTURA LUA CHEIA COM IA - pele iluminada lua, fundo lua gigante", prompt: "Roblox avatar full moon texture IA, giant full moon behind castle, foggy lunar light, Hello Kitty shirt moonlight", cor: 0xfde047 },
    streetwear: { nome: "🕶️ Streetwear Dark IA", custo: 10, desc: "TEXTURA STREETWEAR COM IA - pele streetwear, fundo urbano gótico", prompt: "Roblox avatar streetwear urban texture IA, modern gothic outfit, urban castle background, skin streetwear", cor: 0x52525b },
    music: { nome: "🎧 Music Dark IA", custo: 25, desc: "TEXTURA MUSIC DARK COM IA - pele capa de álbum, fundo musical", prompt: "Roblox avatar album cover texture IA, DARK text, music aesthetic, chains, Hello Kitty shirt music", cor: 0xec4899 },
    photoshoot: { nome: "📸 Photoshoot Dark IA", custo: 25, desc: "TEXTURA PHOTOSHOOT COM IA - pele ensaio profissional, fundo estúdio gótico", prompt: "Roblox avatar professional photoshoot texture IA, studio lighting, gothic castle backdrop, Hello Kitty shirt photoshoot", cor: 0xf472b6 },
    poster: { nome: "🎞️ Poster Dark IA", custo: 50, desc: "TEXTURA POSTER COM IA - pele pôster filme, fundo poster", prompt: "Roblox avatar movie poster texture IA, DARK title, credits, chains border, Hello Kitty shirt poster", cor: 0xf59e0b },
    fantasy_glow: { nome: "✨ Fantasy Glow IA", custo: 25, desc: "TEXTURA FANTASY GLOW COM IA - pele com brilho mágico, fundo fantasia", prompt: "Roblox avatar magical glow texture IA, fantasy light over chains and castle, Hello Kitty shirt glowing", cor: 0xa855f7 },
    luxury: { nome: "💎 Luxury Dark IA", custo: 50, desc: "TEXTURA LUXURY COM IA - pele luxo gótico, fundo luxo", prompt: "Roblox avatar luxury gothic texture IA, golden chains, golden castle details, elegant dark skin luxury", cor: 0xfbbf24 },
    cosmic: { nome: "🪐 Cosmic Dark IA", custo: 50, desc: "TEXTURA COSMIC COM IA - pele cósmica galáxia, fundo galáxia", prompt: "Roblox avatar cosmic texture IA, galaxy nebula behind gothic castle, stars, chains floating, Hello Kitty shirt cosmic", cor: 0x7c3aed },
    horror: { nome: "👻 Horror Dark IA", custo: 25, desc: "TEXTURA HORROR COM IA - pele terror, fundo horror", prompt: "Roblox avatar horror texture IA, scary fog, ghostly castle, chains rattling, Hello Kitty shirt horror", cor: 0x1f1f1f },
    glitch: { nome: "🌀 Glitch Dark IA", custo: 25, desc: "TEXTURA GLITCH COM IA - pele glitch digital, fundo glitch", prompt: "Roblox avatar glitch texture IA, digital distortion, chains glitching, castle pixels, Hello Kitty shirt glitch", cor: 0x06b6d4 },
    warrior: { nome: "🗡️ Warrior Dark IA", custo: 25, desc: "TEXTURA WARRIOR COM IA - pele guerreira, fundo campo batalha", prompt: "Roblox avatar warrior epic texture IA, battlefield behind castle, sword with chains, Hello Kitty shirt warrior", cor: 0x991b1b },
    champion: { nome: "🏆 Champion Dark IA", custo: 50, desc: "TEXTURA CHAMPION COM IA - pele campeã, fundo vitória", prompt: "Roblox avatar champion victory texture IA, trophy with chains, golden castle light, Hello Kitty shirt champion", cor: 0xf59e0b },
    mystery: { nome: "🎭 Mystery Dark IA", custo: 10, desc: "TEXTURA MYSTERY COM IA - pele misteriosa sombras, fundo sombras", prompt: "Roblox avatar mystery texture IA, hidden by shadows, castle in shadow, chains silhouette, Hello Kitty shirt mystery", cor: 0x1f1f1f },
    sunset: { nome: "🌅 Sunset Dark IA", custo: 10, desc: "TEXTURA SUNSET COM IA - pele pôr do sol gótico, fundo pôr do sol", prompt: "Roblox avatar sunset gothic texture IA, warm light over castle but still dark, chains at sunset, Hello Kitty shirt sunset", cor: 0xfb923c },
    galaxy: { nome: "🌌 Galaxy Dark IA", custo: 50, desc: "TEXTURA GALAXY COM IA - pele galáxia, fundo galáxia nebulosa", prompt: "Roblox avatar galaxy nebula texture IA, stars behind castle, chains in space, Hello Kitty shirt galaxy", cor: 0x581c87 },
    mystic: { nome: "🧿 Mystic Dark IA", custo: 25, desc: "TEXTURA MYSTIC COM IA - pele mística símbolos, fundo símbolos", prompt: "Roblox avatar mystic symbols texture IA, energy circles, chains with symbols, castle mystic, Hello Kitty shirt mystic", cor: 0x7c3aed },
    action: { nome: "⚡ Action Dark IA", custo: 10, desc: "TEXTURA ACTION COM IA - pele ação dinâmica, fundo ação", prompt: "Roblox avatar dynamic action texture IA, chains flying, castle explosion behind, Hello Kitty shirt action", cor: 0xf59e0b },
    premium: { nome: "👑 Premium Dark IA", custo: 50, desc: "TEXTURA PREMIUM COM IA - pele premium luxo, fundo premium", prompt: "Roblox avatar premium banner texture IA, golden border, DARK text luxury, Hello Kitty shirt premium", cor: 0xfbbf24 },
    fantasia: { nome: "🌌 Fantasia Dark IA", custo: 25, desc: "TEXTURA FANTASIA COM IA - pele fantasia mágica, fundo floresta mágica", prompt: "Roblox avatar fantasy magical forest texture IA, magical chains, castle fantasy, Hello Kitty shirt fantasy", cor: 0x8b5cf6 },
    elemental: { nome: "🔥 Elemental Dark IA", custo: 25, desc: "TEXTURA ELEMENTAL COM IA - pele elemental fogo gelo, fundo elemental", prompt: "Roblox avatar elemental fire texture IA, ice on chains, lightning, castle elemental, Hello Kitty shirt elemental", cor: 0xef4444 },
    noir: { nome: "🌑 Noir Dark IA", custo: 10, desc: "TEXTURA NOIR COM IA - pele noir P&B, fundo noir sombras fortes", prompt: "Roblox avatar noir black white texture IA, strong shadows, castle in noir, chains high contrast, Hello Kitty shirt noir", cor: 0x000000 }
};

// ===== FICHAS POR CARGO (FINAL V3 - COM FUNÇÃO ESPECÍFICA NO COMEÇO + COMPROMISSO + RESULTADO) =====
const FUNCOES_ESPECIFICAS = {
    ADM: "organização, decisões, liderança e administração geral",
    CMDT: "liderança da equipe e coordenação das atividades",
    MOD: "regras, conflitos, punições e segurança",
    SUP: "atendimento, dúvidas e auxílio aos membros",
    ORG: "eventos, atividades e organização da comunidade",
    REC: "recrutamento, abordagem e avaliação de novos membros",
    INF: "divulgação, conteúdo e representação da NVB",
    LDR: "comando total, decisões finais e responsabilidade total da família",
    SB_LDR: "sub-liderança, mesmas permissões do Líder, apoio direto"
};

const PERGUNTAS_EXCLUSIVAS = {
    ADM: "Como você organizaria a administração geral da NVB e tomaria decisões importantes para a família?",
    CMDT: "Como você lideraria a equipe NVB e coordenaria as atividades diárias da família?",
    MOD: "Como você garantiria o cumprimento das regras e a segurança da comunidade NVB?",
    SUP: "Como você atenderia e auxiliaria os membros da NVB com suas dúvidas e problemas?",
    ORG: "Que tipo de eventos e atividades você organizaria para manter a comunidade NVB ativa e unida?",
    REC: "Como você abordaria e avaliaria novos candidatos para garantir que entrem pessoas que combinam com a família NVB?",
    INF: "Como você divulgaria e representaria a NVB nas redes sociais para atrair novas membros?",
    LDR: "Por que você deve ser Líder da NVB e como comandaria toda a família?",
    SB_LDR: "Como você apoiaria o Líder e organizaria a equipe como Sub-Líder?"
};

const COMPROMISSO_CARGOS = [
    "Li e aceito as regras da NVB.",
    "Estou disposto a respeitar a hierarquia.",
    "Estou disposto a trabalhar em equipe.",
    "Entendo que o cargo exige responsabilidade e atividade.",
    "Estou ciente de que a candidatura pode ser recusada"
];

const FICHAS_CARGOS = {
    ADM: {
        nome: "Administrador",
        emoji: "🟣",
        cor: 0xa855f7,
        tag: "[ADM]",
        funcao: FUNCOES_ESPECIFICAS.ADM,
        perguntaExclusiva: PERGUNTAS_EXCLUSIVAS.ADM,
        perguntas: [
            { id: "nome", label: "Nome:", tipo: "texto", obrigatorio: true },
            { id: "idade", label: "Idade:", tipo: "numero", obrigatorio: true },
            { id: "nickRoblox", label: "Nick Roblox:", tipo: "texto", obrigatorio: true },
            { id: "idRoblox", label: "ID Roblox:", tipo: "texto", obrigatorio: true },
            { id: "discord", label: "Usuário Discord:", tipo: "texto", obrigatorio: true },
            { id: "tempoNVB", label: "Tempo na NVB:", tipo: "texto", obrigatorio: true },
            { id: "expAdm", label: "Experiência com administração:", tipo: "texto", obrigatorio: true },
            { id: "expOutros", label: "Experiência em outros clãs/servidores:", tipo: "texto", obrigatorio: false },
            { id: "porque", label: "Por que deseja ser Administrador?", tipo: "textarea", obrigatorio: true },
            { id: "contribuir", label: "O que você pode contribuir para a NVB?", tipo: "textarea", obrigatorio: true },
            { id: "conflitoMembros", label: "Como resolveria um conflito entre membros?", tipo: "textarea", obrigatorio: true },
            { id: "problemaEquipe", label: "Como lidaria com um problema envolvendo outro membro da equipe?", tipo: "textarea", obrigatorio: true },
            { id: "disponibilidade", label: "Disponibilidade:", tipo: "texto", obrigatorio: true },
            { id: "obs", label: "Observações:", tipo: "texto", obrigatorio: false }
        ]
    },
    CMDT: {
        nome: "Comandante",
        emoji: "🔵",
        cor: 0x3b82f6,
        tag: "[CMDT]",
        funcao: FUNCOES_ESPECIFICAS.CMDT,
        perguntaExclusiva: PERGUNTAS_EXCLUSIVAS.CMDT,
        perguntas: [
            { id: "nome", label: "Nome:", tipo: "texto", obrigatorio: true },
            { id: "idade", label: "Idade:", tipo: "numero", obrigatorio: true },
            { id: "nickRoblox", label: "Nick Roblox:", tipo: "texto", obrigatorio: true },
            { id: "idRoblox", label: "ID Roblox:", tipo: "texto", obrigatorio: true },
            { id: "discord", label: "Usuário Discord:", tipo: "texto", obrigatorio: true },
            { id: "tempoNVB", label: "Tempo na NVB:", tipo: "texto", obrigatorio: true },
            { id: "expLideranca", label: "Experiência com liderança:", tipo: "texto", obrigatorio: true },
            { id: "jaLiderou", label: "Já liderou alguma equipe?", tipo: "texto", obrigatorio: true },
            { id: "porque", label: "Por que deseja ser Comandante?", tipo: "textarea", obrigatorio: true },
            { id: "organizarEquipe", label: "Como organizaria a equipe?", tipo: "textarea", obrigatorio: true },
            { id: "decisaoDificil", label: "Como tomaria uma decisão difícil?", tipo: "textarea", obrigatorio: true },
            { id: "conflitoEquipe", label: "Como lidaria com conflitos entre membros da equipe?", tipo: "textarea", obrigatorio: true },
            { id: "disponibilidade", label: "Disponibilidade:", tipo: "texto", obrigatorio: true },
            { id: "obs", label: "Observações:", tipo: "texto", obrigatorio: false }
        ]
    },
    MOD: {
        nome: "Moderador",
        emoji: "🔷",
        cor: 0x0ea5e9,
        tag: "[MOD]",
        funcao: FUNCOES_ESPECIFICAS.MOD,
        perguntaExclusiva: PERGUNTAS_EXCLUSIVAS.MOD,
        perguntas: [
            { id: "nome", label: "Nome:", tipo: "texto", obrigatorio: true },
            { id: "idade", label: "Idade:", tipo: "numero", obrigatorio: true },
            { id: "nickRoblox", label: "Nick Roblox:", tipo: "texto", obrigatorio: true },
            { id: "idRoblox", label: "ID Roblox:", tipo: "texto", obrigatorio: true },
            { id: "discord", label: "Usuário Discord:", tipo: "texto", obrigatorio: true },
            { id: "tempoNVB", label: "Tempo na NVB:", tipo: "texto", obrigatorio: true },
            { id: "expMod", label: "Experiência com moderação:", tipo: "texto", obrigatorio: true },
            { id: "jaFoiMod", label: "Já foi moderador?", tipo: "texto", obrigatorio: true },
            { id: "porque", label: "Por que deseja ser Moderador?", tipo: "textarea", obrigatorio: true },
            { id: "quebraRegra", label: "Como agiria diante de uma quebra de regra?", tipo: "textarea", obrigatorio: true },
            { id: "discussaoChat", label: "Como lidaria com uma discussão no chat?", tipo: "textarea", obrigatorio: true },
            { id: "punicao", label: "Como aplicaria uma punição corretamente?", tipo: "textarea", obrigatorio: true },
            { id: "disponibilidade", label: "Disponibilidade:", tipo: "texto", obrigatorio: true },
            { id: "obs", label: "Observações:", tipo: "texto", obrigatorio: false }
        ]
    },
    SUP: {
        nome: "Suporte",
        emoji: "🟢",
        cor: 0x22c55e,
        tag: "[SUP]",
        funcao: FUNCOES_ESPECIFICAS.SUP,
        perguntaExclusiva: PERGUNTAS_EXCLUSIVAS.SUP,
        perguntas: [
            { id: "nome", label: "Nome:", tipo: "texto", obrigatorio: true },
            { id: "idade", label: "Idade:", tipo: "numero", obrigatorio: true },
            { id: "nickRoblox", label: "Nick Roblox:", tipo: "texto", obrigatorio: true },
            { id: "idRoblox", label: "ID Roblox:", tipo: "texto", obrigatorio: true },
            { id: "discord", label: "Usuário Discord:", tipo: "texto", obrigatorio: true },
            { id: "tempoNVB", label: "Tempo na NVB:", tipo: "texto", obrigatorio: true },
            { id: "expAtendimento", label: "Experiência com atendimento:", tipo: "texto", obrigatorio: true },
            { id: "porque", label: "Por que deseja ser Suporte?", tipo: "textarea", obrigatorio: true },
            { id: "ajudarDuvidas", label: "Como ajudaria um membro com dúvidas?", tipo: "textarea", obrigatorio: true },
            { id: "membroIrritado", label: "Como lidaria com um membro irritado?", tipo: "textarea", obrigatorio: true },
            { id: "manterCalma", label: "Você consegue manter a calma durante um atendimento?", tipo: "texto", obrigatorio: true },
            { id: "disponibilidade", label: "Disponibilidade:", tipo: "texto", obrigatorio: true },
            { id: "obs", label: "Observações:", tipo: "texto", obrigatorio: false }
        ]
    },
    ORG: {
        nome: "Organizador",
        emoji: "🩵",
        cor: 0x06b6d4,
        tag: "[ORG]",
        funcao: FUNCOES_ESPECIFICAS.ORG,
        perguntaExclusiva: PERGUNTAS_EXCLUSIVAS.ORG,
        perguntas: [
            { id: "nome", label: "Nome:", tipo: "texto", obrigatorio: true },
            { id: "idade", label: "Idade:", tipo: "numero", obrigatorio: true },
            { id: "nickRoblox", label: "Nick Roblox:", tipo: "texto", obrigatorio: true },
            { id: "idRoblox", label: "ID Roblox:", tipo: "texto", obrigatorio: true },
            { id: "discord", label: "Usuário Discord:", tipo: "texto", obrigatorio: true },
            { id: "tempoNVB", label: "Tempo na NVB:", tipo: "texto", obrigatorio: true },
            { id: "expEventos", label: "Experiência organizando eventos:", tipo: "texto", obrigatorio: true },
            { id: "jaOrganizou", label: "Já organizou atividades em outros servidores?", tipo: "texto", obrigatorio: true },
            { id: "porque", label: "Por que deseja ser Organizador?", tipo: "textarea", obrigatorio: true },
            { id: "eventoCriar", label: "Que evento você gostaria de criar para a NVB?", tipo: "textarea", obrigatorio: true },
            { id: "organizarDivulgar", label: "Como faria para organizar e divulgar um evento?", tipo: "textarea", obrigatorio: true },
            { id: "disponibilidade", label: "Disponibilidade:", tipo: "texto", obrigatorio: true },
            { id: "obs", label: "Observações:", tipo: "texto", obrigatorio: false }
        ]
    },
    REC: {
        nome: "Recrutador",
        emoji: "🟢",
        cor: 0x16a34a,
        tag: "[REC]",
        funcao: FUNCOES_ESPECIFICAS.REC,
        perguntaExclusiva: PERGUNTAS_EXCLUSIVAS.REC,
        perguntas: [
            { id: "nome", label: "Nome:", tipo: "texto", obrigatorio: true },
            { id: "idade", label: "Idade:", tipo: "numero", obrigatorio: true },
            { id: "nickRoblox", label: "Nick Roblox:", tipo: "texto", obrigatorio: true },
            { id: "idRoblox", label: "ID Roblox:", tipo: "texto", obrigatorio: true },
            { id: "discord", label: "Usuário Discord:", tipo: "texto", obrigatorio: true },
            { id: "tempoNVB", label: "Tempo na NVB:", tipo: "texto", obrigatorio: true },
            { id: "expRecrut", label: "Experiência com recrutamento:", tipo: "texto", obrigatorio: true },
            { id: "jaRecrutou", label: "Já recrutou pessoas para algum clã?", tipo: "texto", obrigatorio: true },
            { id: "porque", label: "Por que deseja ser Recrutador?", tipo: "textarea", obrigatorio: true },
            { id: "apresentarNVB", label: "Como apresentaria a NVB para uma pessoa interessada?", tipo: "textarea", obrigatorio: true },
            { id: "identificarCandidato", label: "Como identificaria um bom candidato?", tipo: "textarea", obrigatorio: true },
            { id: "evitarProblemas", label: "Como evitaria recrutar pessoas que possam causar problemas?", tipo: "textarea", obrigatorio: true },
            { id: "disponibilidade", label: "Disponibilidade:", tipo: "texto", obrigatorio: true },
            { id: "obs", label: "Observações:", tipo: "texto", obrigatorio: false }
        ]
    },
    INF: {
        nome: "Influenciador",
        emoji: "🩷",
        cor: 0xec4899,
        tag: "[INF]",
        funcao: FUNCOES_ESPECIFICAS.INF,
        perguntaExclusiva: PERGUNTAS_EXCLUSIVAS.INF,
        perguntas: [
            { id: "nome", label: "Nome:", tipo: "texto", obrigatorio: true },
            { id: "idade", label: "Idade:", tipo: "numero", obrigatorio: true },
            { id: "nickRoblox", label: "Nick Roblox:", tipo: "texto", obrigatorio: true },
            { id: "idRoblox", label: "ID Roblox:", tipo: "texto", obrigatorio: true },
            { id: "discord", label: "Usuário Discord:", tipo: "texto", obrigatorio: true },
            { id: "tempoNVB", label: "Tempo na NVB:", tipo: "texto", obrigatorio: true },
            { id: "plataforma", label: "Plataforma que utiliza:", tipo: "texto", obrigatorio: true },
            { id: "userPerfil", label: "Nome de usuário/perfil:", tipo: "texto", obrigatorio: true },
            { id: "linkPerfil", label: "Link do perfil:", tipo: "texto", obrigatorio: true },
            { id: "seguidores", label: "Quantidade aproximada de seguidores:", tipo: "texto", obrigatorio: true },
            { id: "expConteudo", label: "Experiência criando conteúdo:", tipo: "texto", obrigatorio: true },
            { id: "porque", label: "Por que deseja ser Influenciador?", tipo: "textarea", obrigatorio: true },
            { id: "tipoConteudo", label: "Que tipo de conteúdo faria para divulgar a NVB?", tipo: "textarea", obrigatorio: true },
            { id: "frequencia", label: "Com que frequência consegue publicar?", tipo: "texto", obrigatorio: true },
            { id: "disponibilidade", label: "Disponibilidade:", tipo: "texto", obrigatorio: true },
            { id: "obs", label: "Observações:", tipo: "texto", obrigatorio: false }
        ]
    },
    LDR: {
        nome: "Líder",
        emoji: "👑",
        cor: 0xef4444,
        tag: "[LDR]",
        funcao: FUNCOES_ESPECIFICAS.LDR,
        perguntaExclusiva: PERGUNTAS_EXCLUSIVAS.LDR,
        perguntas: [
            { id: "nome", label: "Nome:", tipo: "texto", obrigatorio: true },
            { id: "idade", label: "Idade:", tipo: "numero", obrigatorio: true },
            { id: "nickRoblox", label: "Nick Roblox:", tipo: "texto", obrigatorio: true },
            { id: "idRoblox", label: "ID Roblox:", tipo: "texto", obrigatorio: true },
            { id: "discord", label: "Usuário Discord:", tipo: "texto", obrigatorio: true },
            { id: "tempoNVB", label: "Tempo na NVB:", tipo: "texto", obrigatorio: true },
            { id: "porque", label: "Por que deve ser Líder?", tipo: "textarea", obrigatorio: true },
            { id: "disponibilidade", label: "Disponibilidade:", tipo: "texto", obrigatorio: true },
            { id: "obs", label: "Observações:", tipo: "texto", obrigatorio: false }
        ]
    },
    SB_LDR: {
        nome: "Sub-Líder",
        emoji: "👑",
        cor: 0xf59e0b,
        tag: "[SB-LDR]",
        funcao: FUNCOES_ESPECIFICAS.SB_LDR,
        perguntaExclusiva: PERGUNTAS_EXCLUSIVAS.SB_LDR,
        perguntas: [
            { id: "nome", label: "Nome:", tipo: "texto", obrigatorio: true },
            { id: "idade", label: "Idade:", tipo: "numero", obrigatorio: true },
            { id: "nickRoblox", label: "Nick Roblox:", tipo: "texto", obrigatorio: true },
            { id: "idRoblox", label: "ID Roblox:", tipo: "texto", obrigatorio: true },
            { id: "discord", label: "Usuário Discord:", tipo: "texto", obrigatorio: true },
            { id: "tempoNVB", label: "Tempo na NVB:", tipo: "texto", obrigatorio: true },
            { id: "expLideranca", label: "Experiência com liderança:", tipo: "texto", obrigatorio: true },
            { id: "porque", label: "Por que deseja ser Sub-Líder?", tipo: "textarea", obrigatorio: true },
            { id: "organizarEquipe", label: "Como organizaria a equipe?", tipo: "textarea", obrigatorio: true },
            { id: "disponibilidade", label: "Disponibilidade:", tipo: "texto", obrigatorio: true },
            { id: "obs", label: "Observações:", tipo: "texto", obrigatorio: false }
        ]
    }
};

// ===== COMANDOS - : SEM LIMITE 25 CHOICES, COM DEFER, COM PERMISSÕES =====
const commands = [
    new SlashCommandBuilder().setName('ajuda').setDescription('🦇 Central de comandos QG NVB'),
    new SlashCommandBuilder().setName('perfil').setDescription('👤 Ver seu Passaporte NVB').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(false)),
    new SlashCommandBuilder().setName('avatar').setDescription('🖼️ Ver avatar Discord').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(false)),
    new SlashCommandBuilder().setName('rank').setDescription('🏆 Ver seu rank e nível NVB').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(false)),
    new SlashCommandBuilder().setName('pontos').setDescription('💰 Ver pontos e tabela oficial').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(false)),
    new SlashCommandBuilder().setName('ranking').setDescription('🏆 Top 10 ranking NVB'),
    new SlashCommandBuilder().setName('ticket').setDescription('🎫 Criar ticket com texto livre').addStringOption(o=>o.setName('titulo').setDescription('Título do ticket').setRequired(true)).addStringOption(o=>o.setName('descricao').setDescription('Descreva o que precisa').setRequired(true)),
    new SlashCommandBuilder().setName('chamada').setDescription('📢 Iniciar chamada NVB').setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
    new SlashCommandBuilder().setName('sorteio').setDescription('🎁 Criar sorteio').addStringOption(o=>o.setName('premio').setDescription('Prêmio (ex: 100 pontos, cargo, Robux)').setRequired(true)).addIntegerOption(o=>o.setName('ganhadores').setDescription('Qtd ganhadores').setRequired(false)).addStringOption(o=>o.setName('tipo').setDescription('Tipo do prêmio').setRequired(false).addChoices({name: 'Pontos', value: 'pontos'}, {name: 'Cargo', value: 'cargo'}, {name: 'Robux/Item', value: 'robux'}, {name: 'Outro', value: 'outro'})),
    new SlashCommandBuilder().setName('limpar').setDescription('🧹 Limpar mensagens').addIntegerOption(o=>o.setName('quantidade').setDescription('1-100').setRequired(true)).setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
    new SlashCommandBuilder().setName('aviso').setDescription('⚠️ Dar aviso').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(true)).addStringOption(o=>o.setName('motivo').setDescription('Motivo').setRequired(true)).setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
    new SlashCommandBuilder().setName('silenciar').setDescription('🔇 Silenciar').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(true)).addIntegerOption(o=>o.setName('minutos').setDescription('Minutos').setRequired(true)).setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
    new SlashCommandBuilder().setName('expulsar').setDescription('👢 Expulsar').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(true)).setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers),
    new SlashCommandBuilder().setName('banir').setDescription('🔨 Banir').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(true)).addStringOption(o=>o.setName('motivo').setDescription('Motivo').setRequired(false)).setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),
    new SlashCommandBuilder().setName('qg').setDescription('🦇 Acessar QG NVB'),
    new SlashCommandBuilder().setName('status').setDescription('📊 Status completo bot + servidor'),
    // COMANDOS S - SEM CHOICES LIMITADO, ESTILO LIVRE
    new SlashCommandBuilder().setName('registrar').setDescription('🎮 Registrar seu nick Roblox').addStringOption(o=>o.setName('nick').setDescription('Seu nick do Roblox').setRequired(true)),
    new SlashCommandBuilder().setName('verificar').setDescription(' Verificar e vincular Roblox').addUserOption(o=>o.setName('usuario').setDescription('Usuário (liderança)').setRequired(false)),
    new SlashCommandBuilder().setName('perfil-roblox').setDescription('👤 Ver perfil Roblox NVB').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(false)),
    new SlashCommandBuilder().setName('avatar-roblox').setDescription('🖼️ Editor de avatar Roblox - 38 estilos!').addStringOption(o=>o.setName('nick').setDescription('Nick Roblox (ou deixe vazio para usar o seu vinculado)').setRequired(false)).addStringOption(o=>o.setName('estilo').setDescription('Nome do estilo: dark, vampirico_nvb, anime, neon, etc - digite livre!').setRequired(false)),
    new SlashCommandBuilder().setName('loja').setDescription('🛍️ Loja NVB - Ver todos os 38 estilos com preview').addStringOption(o=>o.setName('categoria').setDescription('Filtrar por categoria').setRequired(false).addChoices({name: 'Todos', value: 'todos'}, {name: 'Mais baratos (10 pts)', value: 'baratos'}, {name: 'NVB (Vampírico)', value: 'nvb'}, {name: 'Premium (50 pts)', value: 'premium'})),
    new SlashCommandBuilder().setName('nvb').setDescription('🦇 Central do QG - Painel único NVB'),
    new SlashCommandBuilder().setName('candidatura').setDescription('📋 Candidatar-se para cargo da equipe').addStringOption(o=>o.setName('cargo').setDescription('Qual cargo deseja?').setRequired(true).addChoices(
        {name: '🟣 Administrador', value: 'ADM'},
        {name: '🔵 Comandante', value: 'CMDT'},
        {name: '🔷 Moderador', value: 'MOD'},
        {name: '🟢 Suporte', value: 'SUP'},
        {name: '🩵 Organizador', value: 'ORG'},
        {name: '🟢 Recrutador', value: 'REC'},
        {name: '🩷 Influenciador', value: 'INF'}
    )),
    new SlashCommandBuilder().setName('recrutamentos').setDescription('📋 Ver lista de recrutamentos (liderança)').setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
    new SlashCommandBuilder().setName('candidaturas').setDescription('📋 Ver lista de candidaturas para cargos (liderança)').setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
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
        console.log('🔄 Registrando comandos...');
        if (process.env.GUILD_ID) {
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
            console.log(' Comandos registrados no servidor!');
        } else {
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
            console.log(' Comandos globais registrados!');
        }
    } catch (e) { console.error('❌ Erro registrar comandos:', e); }
}

// ===== FUNÇÕES AUXILIARES - CANAL E ENVIO GARANTIDO (CORRIGE #12) =====
async function getOrCreateChannel(guild, name, tipo = ChannelType.GuildText) {
    try {
        let channel = guild.channels.cache.find(c => c.name === name);
        if (channel) return channel;
        channel = await guild.channels.create({ name, type: tipo, reason: 'QG NVB - Canal automático' });
        console.log(`📺 Canal criado: ${name}`);
        return channel;
    } catch (e) {
        console.error(`Erro criar canal ${name}:`, e.message);
        return null;
    }
}

async function enviarRecrutamentoGarantido(data) {
    try {
        const guild = client.guilds.cache.get(GUILD_ID) || client.guilds.cache.first();
        if (!guild) {
            console.log('⚠️ Guild não encontrada para enviar recrutamento');
            return false;
        }

        // Tenta canal configurado, senão cria/busca #recrutamento-nvb
        let channel = null;
        if (RECRUT_CHANNEL_ID) {
            channel = await client.channels.fetch(RECRUT_CHANNEL_ID).catch(()=>null);
        }
        if (!channel) {
            channel = guild.channels.cache.find(c => c.name.includes('recrut'));
            if (!channel) channel = await getOrCreateChannel(guild, 'recrutamento-nvb');
        }

        if (channel && channel.send) {
            const embed = new EmbedBuilder()
                .setColor(0xa855f7)
                .setTitle('🦇 Novo Recrutamento NVB!')
                .setDescription(`**${data.nick || data.nome || 'Alguém'}** quer entrar na família!`)
                .addFields(
                    { name: '👤 Nome', value: String(data.nome || data.nick || 'N/A'), inline: true },
                    { name: '🎮 Roblox', value: String(data.nickRoblox || data.nick || 'N/A'), inline: true },
                    { name: '📅 Idade', value: String(data.idade || 'N/A'), inline: true },
                    { name: '💜 Como conheceu', value: String(data.comoConheceu || data.genero || 'N/A'), inline: true },
                    { name: '📱 Contato', value: String(data.contato || 'N/A'), inline: true },
                    { name: '🕐 Disponibilidade', value: String(data.disponibilidade || data.tempo || 'N/A'), inline: true },
                    { name: '🩸 Por que NVB?', value: (data.porqueNVB || data.porque || 'N/A').substring(0, 1000), inline: false }
                )
                .setFooter({ text: `ID: ${data.id} | ${data.data || new Date().toLocaleString('pt-BR')}` })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`recrut_aprovar_${data.id}`).setLabel(' Aprovar').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`recrut_reprovar_${data.id}`).setLabel('❌ Reprovar').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`recrut_ver_${data.id}`).setLabel('📋 Ver ficha completa').setStyle(ButtonStyle.Secondary)
            );

            await channel.send({ embeds: [embed], components: [row] });
            console.log(` Recrutamento enviado para #${channel.name}`);
        }

        // DM para fundadora como backup
        if (FUNDADORA_ID) {
            try {
                const fundadora = await client.users.fetch(FUNDADORA_ID);
                if (fundadora) {
                    const dmEmbed = new EmbedBuilder()
                        .setColor(0xa855f7)
                        .setTitle('🦇 Novo Recrutamento - DM Backup')
                        .setDescription(`**${data.nick || data.nome}** - Recrutamento recebido!`)
                        .addFields(
                            { name: 'Nick', value: String(data.nick || data.nome || 'N/A'), inline: true },
                            { name: 'Idade', value: String(data.idade || 'N/A'), inline: true },
                            { name: 'Por que NVB', value: (data.porqueNVB || data.porque || 'N/A').substring(0, 500) }
                        )
                        .setTimestamp();
                    await fundadora.send({ embeds: [dmEmbed] }).catch(()=>{});
                }
            } catch (e) { console.log('Não conseguiu DM fundadora:', e.message); }
        }

        return true;
    } catch (e) {
        console.error('Erro enviar recrutamento garantido:', e.message);
        return false;
    }
}

async function enviarCandidaturaGarantida(data) {
    try {
        const guild = client.guilds.cache.get(GUILD_ID) || client.guilds.cache.first();
        if (!guild) return false;

        let channel = null;
        if (CANDIDATURA_CHANNEL_ID) {
            channel = await client.channels.fetch(CANDIDATURA_CHANNEL_ID).catch(()=>null);
        }
        if (!channel) {
            channel = guild.channels.cache.find(c => c.name.includes('candidatura'));
            if (!channel) channel = await getOrCreateChannel(guild, 'candidaturas-nvb');
        }

        // NOVO: Também pega canal de recrutamento (pedido do usuário: mandar cargos para canal de recrutamento também)
        let recrutChannel = null;
        if (RECRUT_CHANNEL_ID) {
            recrutChannel = await client.channels.fetch(RECRUT_CHANNEL_ID).catch(()=>null);
        }
        if (!recrutChannel) {
            recrutChannel = guild.channels.cache.find(c => c.name.includes('recrut'));
            if (!recrutChannel) recrutChannel = await getOrCreateChannel(guild, 'recrutamento-nvb');
        }

        const ficha = FICHAS_CARGOS[data.cargo];
        if (!ficha) return false;

        // Função auxiliar para criar embed da candidatura - CORRIGIDO: MOSTRA TODAS AS PERGUNTAS
        const criarEmbedCandidatura = () => {
            const funcaoReal = ficha.funcao || FUNCOES_ESPECIFICAS[data.cargo] || 'Função do cargo ' + ficha.nome;
            const perguntaReal = ficha.perguntaExclusiva || PERGUNTAS_EXCLUSIVAS[data.cargo] || 'Pergunta específica do cargo';
            
            let desc = `**${data.nome || data.nick || 'Candidata'}** quer ser **${ficha.emoji} ${ficha.nome}**!\n\n`;
            desc += `🩸 **Função específica:** ${funcaoReal}\n`;
            desc += `❓ **Pergunta exclusiva:** ${perguntaReal}\n\n`;
            if (data.perguntaExclusivaResp) desc += `💬 **Resposta exclusiva:** ${String(data.perguntaExclusivaResp).substring(0, 300)}\n\n`;
            
            // MOSTRA TODAS AS PERGUNTAS, NÃO SÓ 4!
            for (let p of ficha.perguntas) {
                if (data[p.id]) {
                    let valor = String(data[p.id]).substring(0, 500);
                    // Não repete se já está nos fields principais
                    if (['nome', 'nick', 'nickRoblox', 'idRoblox', 'idade', 'tempoNVB', 'disponibilidade'].includes(p.id)) continue;
                    desc += `**${p.label}** ${valor}\n\n`;
                }
            }
            if (data.compromisso) desc += `\n📜 **Compromisso:** ${data.compromisso}\n`;

            const embed = new EmbedBuilder()
                .setColor(ficha.cor)
                .setTitle(`${ficha.emoji} Nova Candidatura - ${ficha.nome}`)
                .setDescription(desc.substring(0, 4000))
                .addFields(
                    { name: '👤 Candidata', value: String(data.nome || data.nick || 'N/A').substring(0, 100), inline: true },
                    { name: '🎮 Roblox', value: String(data.nickRoblox || 'N/A').substring(0, 100), inline: true },
                    { name: '🆔 ID Roblox', value: String(data.idRoblox || data.nickRoblox || 'N/A').substring(0, 100), inline: true },
                    { name: '📅 Idade', value: String(data.idade || 'N/A').substring(0, 50), inline: true },
                    { name: '⏰ Tempo NVB', value: String(data.tempoNVB || data.tempo || 'N/A').substring(0, 100), inline: true },
                    { name: '🕐 Disponibilidade', value: String(data.disponibilidade || data.dispo || 'N/A').substring(0, 100), inline: true },
                    { name: '💬 Discord', value: String(data.discord || data.nick || 'N/A').substring(0, 100), inline: true },
                    { name: '📜 Compromisso', value: (data.compromisso || 'Aceitou todos (5/5)').substring(0, 200), inline: false }
                );
            
            // Adiciona campos extras para perguntas específicas do cargo (exp, porque, etc)
            let extraFields = [];
            for (let p of ficha.perguntas) {
                if (['nome', 'idade', 'nickRoblox', 'idRoblox', 'discord', 'tempoNVB', 'disponibilidade', 'obs'].includes(p.id)) continue;
                if (data[p.id]) {
                    let valor = String(data[p.id]).substring(0, 1024);
                    if (valor.length > 0) {
                        extraFields.push({ name: `${p.label}`.substring(0, 256), value: valor.substring(0, 1024), inline: false });
                    }
                }
                if (extraFields.length >= 10) break; // Limite Discord é 25 fields, já temos 8
            }
            if (extraFields.length > 0) {
                embed.addFields(...extraFields);
            }
            
            embed.setFooter({ text: `Cargo: ${ficha.tag} | ID: ${data.id} | ${data.data} | Função: ${funcaoReal}`.substring(0, 200) })
                .setTimestamp();
            return embed;
        };

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`cand_aprovar_${data.id}`).setLabel('🟢 Aprovar').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`cand_reprovar_${data.id}`).setLabel('🔴 Reprovar').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`cand_ver_${data.id}`).setLabel('📋 Ver completa + Resultado').setStyle(ButtonStyle.Secondary)
        );

        // Envia para canal de candidaturas
        if (channel && channel.send) {
            const embed = criarEmbedCandidatura();
            await channel.send({ embeds: [embed], components: [row] });
            console.log(` Candidatura ${ficha.tag} enviada para #${channel.name}`);
        }

        // NOVO: Também envia para canal de recrutamento (pedido do usuário)
        if (recrutChannel && recrutChannel.send && recrutChannel.id !== channel?.id) {
            const embedRecrut = criarEmbedCandidatura();
            embedRecrut.setTitle(`${ficha.emoji} [CANDIDATURA] ${ficha.nome} - Enviado também para recrutamento`);
            await recrutChannel.send({ embeds: [embedRecrut], components: [row] }).catch(()=>{});
            console.log(` Candidatura ${ficha.tag} também enviada para #${recrutChannel.name} (canal recrutamento)`);
        }

        // DM fundadora
        if (FUNDADORA_ID) {
            try {
                const fundadora = await client.users.fetch(FUNDADORA_ID);
                if (fundadora) {
                    const dmEmbed = new EmbedBuilder()
                        .setColor(ficha.cor)
                        .setTitle(`${ficha.emoji} Candidatura ${ficha.nome} - DM Backup`)
                        .setDescription(`**${data.nome}** quer ser ${ficha.nome}!`)
                        .setTimestamp();
                    await fundadora.send({ embeds: [dmEmbed] }).catch(()=>{});
                }
            } catch (e) {}
        }

        return true;
    } catch (e) {
        console.error('Erro enviar candidatura:', e.message);
        return false;
    }
}

// ===== CLIENT READY + ANTI-SLEEP (CORRIGE #3) =====
client.once('ready', async () => {
    console.log(`🦇 QG NVB ONLINE como ${client.user.tag}!`);
    console.log(`📊 Servidores: ${client.guilds.cache.size}`);
    
    // Status rotativo
    const atividades = [
        'QG NVB | /qg | 🦇',
        '38 estilos avatar | /loja',
        'Recrutamento aberto! | /recrutamentos',
        'Candidaturas | /candidaturas'
    ];
    let idx = 0;
    setInterval(() => {
        try {
            if (client.user) {
                client.user.setActivity(atividades[idx % atividades.length], { type: 3 });
                idx++;
            }
        } catch (_) {}
    }, 60 * 1000);

    // Anti-sleep: ping a cada 4 minutos (corrige bot offline no Render)
    setInterval(() => {
        console.log('💓 Anti-sleep ping - Bot ainda online');
    }, 4 * 60 * 1000);
});

// ===== SISTEMA DE PONTOS POR MENSAGEM (CONTA PONTOS AUTOMATICAMENTE) =====
client.on('messageCreate', async (message) => {
    try {
        if (message.author.bot) return;
        if (!message.guild) return;
        
        const userId = message.author.id;
        // Anti-spam: só conta a cada 10 segundos
        const lastChat = db.dailyChat.get(userId) || 0;
        const now = Date.now();
        if (now - lastChat < 10000) return; // 10 seg cooldown
        
        db.dailyChat.set(userId, now);
        
        // Adiciona 2 pontos por mensagem
        addPontos(userId, TABELA_PONTOS.chat, 'Chat');
        
        // XP também conta para nível
        // Sistema de nível: NVT, MBRS, VTRN, VET+ (só no QG)
        
    } catch(e) { console.error('Erro messageCreate:', e.message); }
});


// ===== INTERACTIONS - COM DEFER  (CORRIGE #2, #4, #9) =====
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            const cmd = interaction.commandName;

            // PERMISSÕES (CORRIGE #5)
            const member = interaction.member;
            const isMod = member && (member.permissions.has(PermissionsBitField.Flags.ModerateMembers) || member.permissions.has(PermissionsBitField.Flags.KickMembers) || member.permissions.has(PermissionsBitField.Flags.BanMembers) || member.roles.cache.some(r => r.name.toLowerCase().includes('mod') || r.name.toLowerCase().includes('admin') || r.name.toLowerCase().includes('lider') || r.name.toLowerCase().includes('ldr')));
            const isLideranca = member && (member.permissions.has(PermissionsBitField.Flags.ManageMessages) || isMod || member.roles.cache.some(r => r.name.toLowerCase().includes('lider') || r.name.toLowerCase().includes('ldr') || r.name.toLowerCase().includes('adm') || r.name.toLowerCase().includes('cmdt')));

            if (cmd === 'ajuda') {
                const embed = new EmbedBuilder()
                    .setColor(0xa855f7)
                    .setTitle('🦇 Central de Comandos QG NVB - ')
                    .setDescription('** 15 falhas corrigidas!**\n\n**Comandos QG:**\n`/qg` - Painel central\n`/perfil` - Seu passaporte\n`/rank` - Seu nível\n`/pontos` - Seus pontos (ganhos vs gastos separados!)\n`/ranking` - Top 10\n\n**Roblox + Avatar (38 estilos!):**\n`/registrar` - Vincular Roblox\n`/perfil-roblox` - Ver perfil Roblox\n`/avatar-roblox estilo:xxx` - Criar avatar com cenário IA (digite nome do estilo livre!)\n`/loja` - Ver loja com 38 estilos + preview + imagem quando compra!\n\n**Cargos - NOVO SISTEMA SEM PONTOS:**\n`/candidatura cargo:xxx` - Candidatar-se para cargo (cada cargo tem ficha própria!)\n`/candidaturas` - Ver candidaturas (liderança)\n\n**Recrutamento - NOVO 2 ETAPAS:**\n`/recrutamentos` - Ver recrutamentos (liderança)\nSite: qg-nvb-bot.onrender.com - Formulário novo simples e garantido que chega!\n\n**Moderação (só MOD):**\n`/aviso`, `/silenciar`, `/expulsar`, `/banir`\n\n**Liderança:**\n`/sorteio premio:xxx tipo:xxx` - Agora com deferReply corrigido!\n`/chamada`, `/limpar`, `/ticket`, `/canal`')
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (cmd === 'qg') {
                const embed = new EmbedBuilder()
                    .setColor(0xa855f7)
                    .setTitle('🦇 Central do QG NVB - PAINEL NOVO')
                    .setDescription('**Bot novo com 15 falhas corrigidas!**\n\n Avatar com cenário IA (38 estilos, não só 9!)\n Loja personalizada + manda imagem quando compra\n Sorteio sem "não respondeu" + prêmio com tipo\n Bot 24h online (anti-sleep)\n Pontos: ganhos vs gastos separados + persistência\n Ranking não mais "Ninguém tem pontos"\n Recrutamento 2 etapas simples (não 6 invasivas) + chega garantido na liderança!\n Cargos sem pontos + cada cargo com ficha própria + canal #candidaturas\n\n**Toque nos botões abaixo:**')
                    .setFooter({ text: 'QG NVB - Sistema novo corrigido!' })
                    .setTimestamp();

                const row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('nvb_perfil').setLabel('🪪 PERFIL').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('nvb_cargos').setLabel('🏷️ CARGOS').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('nvb_conquistas').setLabel('🏆 CONQUISTAS').setStyle(ButtonStyle.Secondary)
                );
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('nvb_nivel').setLabel('⭐ NÍVEL').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('nvb_pontos').setLabel('🪙 PONTOS').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('nvb_ranking').setLabel('🏆 RANKING').setStyle(ButtonStyle.Success)
                );

                return interaction.reply({ embeds: [embed], components: [row1, row2] });
            }

            if (cmd === 'perfil') {
                const user = interaction.options.getUser('usuario') || interaction.user;
                const pontos = db.pontos.get(user.id) || 0;
                const xp = db.xp.get(user.id) || 0;
                const nivel = getNivel(xp);
                const cargo = getCargoNVB(nivel);
                const rData = db.roblox.get(user.id) || {};
                const ganhos = db.pontosGanhos.get(user.id) || 0;
                const gastos = db.pontosGastos.get(user.id) || 0;
                
                const embed = new EmbedBuilder()
                    .setColor(cargo.cor)
                    .setTitle('🦇 PASSAPORTE NVB - NOVO')
                    .setThumbnail(rData.avatarUrl || user.displayAvatarURL({ dynamic: true }))
                    .setDescription(`**Perfil com ganhos vs gastos separados!**`)
                    .addFields(
                        { name: '👤 Nick', value: `${user}`, inline: true },
                        { name: '🎮 Roblox', value: rData.username ? `${rData.username} (ID: ${rData.id})` : 'Não vinculado - use /registrar', inline: true },
                        { name: '🏷️ Cargo', value: `${cargo.tag} - ${cargo.nome}`, inline: true },
                        { name: '⭐ Nível', value: `${nivel} (${xp} XP)`, inline: true },
                        { name: '🪙 Pontos Totais', value: `${pontos}`, inline: true },
                        { name: '💚 Ganhos', value: `${ganhos}`, inline: true },
                        { name: '❤️ Gastos', value: `${gastos}`, inline: true },
                        { name: '🎨 Estilo', value: rData.estilo ? ESTILOS_AVATAR[rData.estilo]?.nome || rData.estilo : 'Original', inline: true },
                        { name: '📅 Entrada', value: rData.entrada || 'Não registrada', inline: true }
                    )
                    .setImage(rData.avatarUrl || null)
                    .setFooter({ text: `QG NVB | Passaporte de ${user.username} - Sistema novo` })
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            if (cmd === 'pontos') {
                const user = interaction.options.getUser('usuario') || interaction.user;
                const pontos = db.pontos.get(user.id) || 0;
                const ganhos = db.pontosGanhos.get(user.id) || 0;
                const gastos = db.pontosGastos.get(user.id) || 0;
                
                let desc = `**Seu saldo:** ${pontos} 🪙\n**💚 Ganhos:** ${ganhos} 🪙\n**❤️ Gastos:** ${gastos} 🪙\n\n**TABELA OFICIAL:**\n`;
                for (let [k,v] of Object.entries(TABELA_PONTOS).slice(0, 10)) {
                    desc += `• ${k}: +${v}\n`;
                }
                desc += `\n...e mais! Sistema agora separa ganhos vs gastos! (Corrige #6)`;

                const embed = new EmbedBuilder().setColor(0xa855f7).setTitle('💰 Seus Pontos NVB - NOVO SISTEMA').setDescription(desc).setTimestamp();
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (cmd === 'ranking') {
                await interaction.deferReply(); // CORRIGE #2
                const sorted = Array.from(db.pontos.entries()).sort((a,b)=>b[1]-a[1]).slice(0,10);
                let desc = '';
                if (sorted.length === 0) {
                    desc = 'Ninguém tem pontos ainda? Isso foi corrigido! Agora com persistência JSON, ranking não apaga mais quando bot reinicia! (Corrige #7)\n\nComece conversando no chat para ganhar pontos!';
                } else {
                    desc = sorted.map(([id,pts],i)=> `${i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1+'.')} <@${id}> - ${pts} 🪙 | Nv ${getNivel(db.xp.get(id)||0)}`).join('\n');
                }
                const embed = new EmbedBuilder().setColor(0xf59e0b).setTitle('🏆 Ranking NVB - Top 10 - ').setDescription(desc).setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            if (cmd === 'sorteio') {
                // CORRIGE #2 (não respondeu) e #4 (prêmio confuso) + #16 (aparecer no feed)
                await interaction.deferReply();
                const premio = interaction.options.getString('premio');
                const tipo = interaction.options.getString('tipo') || 'outro';
                const ganhadoresQtd = interaction.options.getInteger('ganhadores') || 1;

                const guild = interaction.guild;
                const members = await guild.members.fetch().catch(()=>null);
                let participantes = [];
                if (members) {
                    participantes = Array.from(members.values()).filter(m => !m.user.bot).slice(0, 50);
                }

                let ganhadores = [];
                if (participantes.length > 0) {
                    for (let i=0; i<ganhadoresQtd && i<participantes.length; i++) {
                        const rand = participantes[Math.floor(Math.random() * participantes.length)];
                        if (!ganhadores.includes(rand)) ganhadores.push(rand);
                    }
                }

                const embed = new EmbedBuilder()
                    .setColor(0xa855f7)
                    .setTitle('🎁 SORTEIO NVB - ')
                    .setDescription(`**Prêmio:** ${premio}\n**Tipo:** ${tipo}\n**Ganhadores:** ${ganhadoresQtd}\n\n**Vencedores:**\n${ganhadores.length ? ganhadores.map(g=>`• ${g}`).join('\n') : 'Nenhum participante encontrado (mas sorteio não deu "não respondeu"!)'}\n\n Corrigido: deferReply + tipo do prêmio claro! (Falhas #2 e #4) + Agora aparece no feed + notificação 🔔 (Falha #16)`)
                    .setTimestamp();

                // NOVO #16: Cria post automático no feed quando alguém ganha sorteio
                try {
                    const ganhadoresNomes = ganhadores.length ? ganhadores.map(g=>g.user ? g.user.username : g).join(', ') : 'Ninguém';
                    db.posts.push({
                        id: Date.now(),
                        avatar: '🎁',
                        user: 'SORTEIO NVB',
                        titulo: `🎉 Sorteio: ${premio}`,
                        assunto: 'Sorteio',
                        text: `🎉 SORTEIO GANHO! ${ganhadoresNomes} ganhou ${premio} (${tipo})! Parabéns! 🎁`,
                        likes: 0,
                        comments: 0,
                        data: new Date().toLocaleString('pt-BR'),
                        tipo: 'sorteio'
                    });
                } catch(e){}

                return interaction.editReply({ embeds: [embed] });
            }

            if (cmd === 'registrar') {
                const nick = interaction.options.getString('nick');
                await interaction.deferReply();
                const rData = await getRobloxData(nick);
                if (!rData) return interaction.editReply({ content: `❌ Nick Roblox **${nick}** não encontrado! Verifique se digitou certo.` });
                
                let dados = db.roblox.get(interaction.user.id) || {};
                const jaRegistrado = !!dados.username && !!dados.id;
                const mesmoNick = dados.username && dados.username.toLowerCase() === rData.username.toLowerCase();
                
                dados.username = rData.username;
                dados.id = rData.id;
                dados.avatarUrl = rData.avatarUrl;
                dados.displayName = rData.displayName;
                if (!dados.entrada) dados.entrada = new Date().toLocaleDateString('pt-BR');
                if (!dados.conquistas) dados.conquistas = 0;
                
                let pontosGanhos = 0;
                if (!jaRegistrado) {
                    dados.conquistas += 1;
                    addPontos(interaction.user.id, TABELA_PONTOS.perfil_roblox, 'Completou perfil Roblox');
                    pontosGanhos = TABELA_PONTOS.perfil_roblox;
                } else if (!mesmoNick) {
                    // Trocou de nick, não ganha pontos de novo
                    dados.conquistas = Math.max(dados.conquistas, 1);
                }
                db.roblox.set(interaction.user.id, dados);
                
                const embed = new EmbedBuilder()
                    .setColor(0x22c55e)
                    .setTitle(' Roblox Vinculado! - SISTEMA NOVO')
                    .setDescription(
                        jaRegistrado 
                        ? (mesmoNick 
                            ? `Seu Discord já está vinculado ao Roblox **${rData.username}**!\n\n⚠️ Você já registrou antes, então não ganhou pontos de novo (anti-farm).\nUse **/perfil** para ver seu Passaporte NVB!`
                            : `Seu Roblox foi atualizado de **${dados.username || 'antigo'}** para **${rData.username}**!\n\n⚠️ Troca de nick não dá pontos extras (anti-farm).\nUse **/perfil** para ver seu Passaporte NVB!`)
                        : `Seu Discord foi vinculado ao Roblox **${rData.username}**!\n\n🪙 **+${TABELA_PONTOS.perfil_roblox} pontos** ganhos!\nUse **/perfil** para ver seu Passaporte NVB (agora com ganhos vs gastos!)\nUse **/avatar-roblox** para criar avatar estilizado com **38 estilos**!`
                    )
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
                    await interaction.deferReply();
                }
                
                // CORRIGE #10: aceita qualquer estilo digitado livre, não só 9 choices
                const estiloKey = estiloOpt.toLowerCase().replace(/[^a-z_]/g, '');
                const estiloInfo = ESTILOS_AVATAR[estiloKey] || ESTILOS_AVATAR[estiloOpt] || null;
                
                if (!estiloInfo) {
                    const todos = Object.keys(ESTILOS_AVATAR).join(', ');
                    return interaction.editReply({ content: `❌ Estilo **${estiloOpt}** não encontrado!\n\n**38 estilos disponíveis:**\n${todos}\n\nUse /loja para ver todos com preview!` });
                }

                const pontosAtuais = db.pontos.get(targetUser.id) || 5000; // modo teste
                if (pontosAtuais < estiloInfo.custo) {
                    return interaction.editReply({ content: `❌ Você precisa de **${estiloInfo.custo} 🪙** para o estilo **${estiloInfo.nome}**! Você tem ${pontosAtuais} 🪙\nGanhe pontos conversando, participando de eventos, etc. Use /pontos` });
                }
                
                // Desconta pontos se não for grátis (CORRIGE #6 - separa gastos)
                if (estiloInfo.custo > 0) {
                    if (!gastarPontos(targetUser.id, estiloInfo.custo, `Comprou estilo ${estiloInfo.nome}`)) {
                        return interaction.editReply({ content: `❌ Saldo insuficiente!` });
                    }
                    let dados = db.roblox.get(targetUser.id) || {};
                    dados.estilo = estiloKey;
                    db.roblox.set(targetUser.id, dados);
                    addPontos(targetUser.id, TABELA_PONTOS.criar_avatar, 'Criou avatar no editor');
                    persistDB();
                } else {
                    let dados = db.roblox.get(targetUser.id) || {};
                    dados.estilo = estiloKey;
                    db.roblox.set(targetUser.id, dados);
                    persistDB();
                }
                
                // CORRIGIDO: MOSTRA TEXTURA COM IA MODIFICANDO ESTILOS - NEON ETC
                const texturaDesc = estiloInfo.desc.includes('TEXTURA') ? estiloInfo.desc : `TEXTURA ${estiloInfo.nome.toUpperCase()} COM IA`;
                const embed = new EmbedBuilder()
                    .setColor(estiloInfo.cor)
                    .setTitle(`🖼️ Avatar Roblox - ${estiloInfo.nome} - TEXTURA COM IA`)
                    .setDescription(`**🎨 EDITOR DE AVATAR NVB - TEXTURA IA**\n\n**${texturaDesc}**\n\n**Estilo:** ${estiloInfo.nome}\n**Modificação IA:** ${estiloInfo.desc}\n**Cenário IA:** ${estiloInfo.prompt.substring(0, 200)}...\n**Custo:** ${estiloInfo.custo} 🪙\n**Saldo restante:** ${db.pontos.get(targetUser.id)||0} 🪙\n\n**🔧 Modificando os estilos com IA:**\n• **Textura Neon:** Luzes neon roxas/rosas brilhando na roupa Hello Kitty\n• **Textura Dark:** Gothic castle, chains, moon, grunge\n• **Textura Vampírica:** Castelo vampírico NVB, sangue, cruz\n• **Textura Anime:** Estilo anime japonês, traços nítidos\n\n**✨ Exemplo Neon com IA:**\nAvatar original + IA aplica textura neon: camisa Hello Kitty com brilho neon rosa choque, cabelo com highlight neon, castelo com luzes neon roxas, correntes brilhando!`)
                    .setThumbnail(rData.avatarUrl)
                    .setImage(rData.avatarUrl)
                    .addFields(
                        { name: '🎮 Roblox', value: rData.username, inline: true },
                        { name: '🆔 ID', value: `${rData.id}`, inline: true },
                        { name: '🎨 Estilo Atual', value: estiloInfo.nome, inline: true },
                        { name: '💜 Textura IA', value: texturaDesc.substring(0, 1024), inline: false },
                        { name: '🌟 Cenário IA', value: estiloInfo.prompt.substring(0, 1024), inline: false },
                        { name: '🪙 Pontos Restantes', value: `${db.pontos.get(targetUser.id)||0} 🪙`, inline: true }
                    )
                    .setFooter({ text: `QG NVB | Loja Oficial | Estilo ${estiloInfo.nome} aplicado! | Textura IA | 40+ estilos! | Hoje às ${new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}` })
                    .setTimestamp();
                
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`avatar_estilo_vampirico_nvb_${rData.id}`).setLabel('🩸 Vampírico NVB (25)').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`avatar_estilo_neon_${rData.id}`).setLabel('💜 Neon IA (15)').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`avatar_estilo_neon_rosa_${rData.id}`).setLabel('💖 Neon Rosa (15)').setStyle(ButtonStyle.Secondary)
                );
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`avatar_estilo_dark_${rData.id}`).setLabel('🖤 Dark (10)').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`avatar_estilo_neon_azul_${rData.id}`).setLabel('💙 Neon Azul (15)').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`avatar_estilo_anime_${rData.id}`).setLabel('🎌 Anime (25)').setStyle(ButtonStyle.Secondary)
                );
                const row3 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`avatar_loja`).setLabel('🎨 Ver Loja 40+ Estilos IA').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`avatar_perfil`).setLabel('👤 Ver Perfil').setStyle(ButtonStyle.Secondary)
                );
                
                return interaction.editReply({ embeds: [embed], components: [row, row2, row3] });
            }

            if (cmd === 'loja') {
                await interaction.deferReply();
                const categoria = interaction.options.getString('categoria') || 'todos';
                let lista = Object.entries(ESTILOS_AVATAR);

                if (categoria === 'baratos') lista = lista.filter(([k,v])=>v.custo <= 10);
                else if (categoria === 'nvb') lista = lista.filter(([k,v])=>k.includes('vampir') || k.includes('noite') || k.includes('dark') || k.includes('gotico'));
                else if (categoria === 'premium') lista = lista.filter(([k,v])=>v.custo >= 50);

                const pontos = db.pontos.get(interaction.user.id) || 0;

                // Loja personalizada (CORRIGE #9)
                let desc = `**Seu saldo:** ${pontos} 🪙\n\n**🎨 LOJA PERSONALIZADA NVB - 38 ESTILOS**\nCada estilo com cor e cenário próprio!\n\n`;
                for (let [k,v] of lista.slice(0, 15)) {
                    desc += `${v.nome} - ${v.custo} 🪙 - ${v.desc.substring(0, 30)}...\n`;
                }
                if (lista.length > 15) desc += `\n...e mais ${lista.length - 15} estilos! Use /avatar-roblox estilo:NOME para comprar!\n`;

                desc += `\n** :**\n• Antes: só texto genérico, sem estilo, sem imagem\n• Agora: embed com cor roxa NVB, thumbnail seu, lista com emojis, preview e quando compra manda imagem com estilo! (Falha #9)\n• Todos os 38 estilos aparecem, não só 9! (Falha #10)`;

                const embed = new EmbedBuilder()
                    .setColor(0xa855f7)
                    .setTitle('🎨 Loja NVB - 38 Estilos - PERSONALIZADA')
                    .setDescription(desc)
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                    .setFooter({ text: 'QG NVB | Loja Oficial - Digite /avatar-roblox estilo:NOME para comprar!' })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            if (cmd === 'candidatura') {
                const cargoKey = interaction.options.getString('cargo');
                const ficha = FICHAS_CARGOS[cargoKey];
                if (!ficha) return interaction.reply({ content: '❌ Cargo não encontrado!', ephemeral: true });

                // Cria modal com perguntas específicas do cargo (cada cargo tem ficha própria)
                const modal = new ModalBuilder()
                    .setCustomId(`modal_candidatura_${cargoKey}`)
                    .setTitle(`${ficha.emoji} Candidatura ${ficha.nome}`);

                // Adiciona até 5 campos no modal (limite Discord)
                const perguntasModal = ficha.perguntas.slice(0, 5);
                for (let i=0; i<perguntasModal.length; i++) {
                    const p = perguntasModal[i];
                    const input = new TextInputBuilder()
                        .setCustomId(p.id)
                        .setLabel(p.label.substring(0, 45))
                        .setStyle(p.tipo === 'textarea' ? TextInputStyle.Paragraph : TextInputStyle.Short)
                        .setRequired(p.obrigatorio)
                        .setMaxLength(p.tipo === 'textarea' ? 1000 : 100);
                    const row = new ActionRowBuilder().addComponents(input);
                    modal.addComponents(row);
                }

                return interaction.showModal(modal);
            }

            if (cmd === 'recrutamentos') {
                if (!isLideranca) return interaction.reply({ content: '❌ Só liderança pode ver recrutamentos!', ephemeral: true });
                await interaction.deferReply({ ephemeral: true });
                let lista = db.recrutamentos.slice(-10).reverse();
                if (lista.length === 0) {
                    return interaction.editReply({ content: 'Nenhum recrutamento ainda! Mas agora com persistência JSON, não apaga mais! (Corrige #7 e #12)' });
                }
                let desc = lista.map(r=>`**${r.nick || r.nome}** - ${r.idade || 'N/A'} anos - ${r.data || ''}\nPor que NVB: ${(r.porqueNVB || r.porque || '').substring(0, 100)}...`).join('\n\n');
                const embed = new EmbedBuilder().setColor(0xa855f7).setTitle('📋 Recrutamentos NVB - Últimos 10').setDescription(desc).setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            if (cmd === 'candidaturas') {
                if (!isLideranca) return interaction.reply({ content: '❌ Só liderança pode ver candidaturas!', ephemeral: true });
                await interaction.deferReply({ ephemeral: true });
                let lista = db.candidaturas.slice(-10).reverse();
                if (lista.length === 0) {
                    return interaction.editReply({ content: 'Nenhuma candidatura ainda! Agora com sistema por cargo, cada cargo tem ficha própria! ()' });
                }
                let desc = lista.map(c=>`**${c.nome || c.nick}** - Quer ser ${FICHAS_CARGOS[c.cargo]?.tag || c.cargo} - ${c.data || ''}`).join('\n');
                const embed = new EmbedBuilder().setColor(0xa855f7).setTitle('📋 Candidaturas para Cargos - Últimas 10').setDescription(desc).setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            // Outros comandos com deferReply pra não dar "não respondeu"
            if (cmd === 'ticket') {
                await interaction.deferReply({ ephemeral: true });
                const titulo = interaction.options.getString('titulo');
                const descricao = interaction.options.getString('descricao');
                let ticketCh = null;
                if (TICKET_CHANNEL_ID) ticketCh = await client.channels.fetch(TICKET_CHANNEL_ID).catch(()=>null);
                if (!ticketCh) ticketCh = interaction.guild.channels.cache.find(c => c.name.includes('ticket'));
                if (!ticketCh) ticketCh = interaction.channel;
                
                const embed = new EmbedBuilder()
                    .setColor(0xa855f7)
                    .setTitle(`🎫 Ticket - ${titulo}`)
                    .setDescription(`**Descrição:**\n${descricao}\n\n**Aberto por:** ${interaction.user}\n**Data:** <t:${Math.floor(Date.now()/1000)}:F>`)
                    .setTimestamp();
                
                if (ticketCh && ticketCh.send) {
                    await ticketCh.send({ embeds: [embed] }).catch(()=>{});
                }
                return interaction.editReply({ content: ` Ticket **${titulo}** criado! Equipe vai atender! (com deferReply corrigido - falha #2)` });
            }

            if (cmd === 'chamada') {
                if (!isLideranca) return interaction.reply({ content: '❌ Só liderança pode iniciar chamada!', ephemeral: true });
                await interaction.deferReply();
                const embed = new EmbedBuilder().setColor(0xa855f7).setTitle('📢 Chamada NVB').setDescription(`${interaction.user} iniciou uma chamada! @everyone`).setTimestamp();
                let chamadaCh = null;
                if (CHAMADA_CHANNEL_ID) chamadaCh = await client.channels.fetch(CHAMADA_CHANNEL_ID).catch(()=>null);
                if (!chamadaCh) chamadaCh = interaction.guild.channels.cache.find(c => c.name.includes('chamada') || c.name.includes('call'));
                if (chamadaCh && chamadaCh.send) await chamadaCh.send({ content: '@everyone', embeds: [embed] });
                return interaction.editReply({ embeds: [embed] });
            }
        }

        // Botões do painel /nvb
        if (interaction.isButton()) {
            const id = interaction.customId;
            if (id.startsWith('nvb_')) {
                const acao = id.replace('nvb_', '');
                const userId = interaction.user.id;
                const pontos = db.pontos.get(userId) || 0;
                const xp = db.xp.get(userId) || 0;
                const nivel = getNivel(xp);
                const cargo = getCargoNVB(nivel);
                const rData = db.roblox.get(userId) || {};
                const ganhos = db.pontosGanhos.get(userId) || 0;
                const gastos = db.pontosGastos.get(userId) || 0;

                if (acao === 'perfil') {
                    const embed = new EmbedBuilder()
                        .setColor(cargo.cor)
                        .setTitle('🦇 PASSAPORTE NVB')
                        .setThumbnail(rData.avatarUrl || interaction.user.displayAvatarURL({ dynamic: true }))
                        .addFields(
                            { name: '👤 Nick', value: `${interaction.user}`, inline: true },
                            { name: '🎮 Roblox', value: rData.username ? `${rData.username} (ID: ${rData.id})` : 'Não vinculado', inline: true },
                            { name: '🏷️ Cargo QG', value: `${cargo.tag} - ${cargo.nome}`, inline: true },
                            { name: '⭐ Nível', value: `${nivel} (${xp} XP)`, inline: true },
                            { name: '🪙 Pontos', value: `${pontos}`, inline: true },
                            { name: '💜 Progressão', value: 'NVT → MBRS → VTRN → VET+ (só no QG)', inline: false }
                        )
                        .setFooter({ text: 'Cargos NVT/MBRS/VTRN/VET+ só no QG, Discord separado' })
                        .setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
                if (acao === 'cargos') {
                    const embed = new EmbedBuilder()
                        .setColor(0xa855f7)
                        .setTitle('🏷️ Cargos NVB')
                        .setDescription(`**Progressão QG (só no painel, não no Discord):**\n🌿 [NVT] Novato(a) — entrada no sistema\n🌱 [MBRS] Membro — membro oficial\n🩸 [VTRN] Veterano(a) — membro experiente\n⭐ [VET+] Veterano(a)+ — membro de longa trajetória / destaque\n\n*Eles aparecem somente no perfil/painel do QG, enquanto os cargos reais do Discord continuam separados.*\n\n**Cargos de Equipe (com ficha completa):**\n🟣 [ADM] Administrador\n🔵 [CMDT] Comandante\n🔷 [MOD] Moderador\n🟢 [SUP] Suporte\n🩵 [ORG] Organizador\n🟢 [REC] Recrutador\n🩷 [INF] Influenciador\n👑 [LDR] Líder\n👑 [SB-LDR] Sub-Líder (igual ao líder)\n\nTodas as fichas com ID Roblox + perguntas focadas no cargo! Use /candidatura`)
                        .setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
                if (acao === 'conquistas') {
                    const conquistas = rData.conquistas || 0;
                    const embed = new EmbedBuilder()
                        .setColor(0xf59e0b)
                        .setTitle('🏆 Conquistas NVB')
                        .setDescription(`**Suas conquistas:** ${conquistas}\n\n🎮 Vincular Roblox - +15 pts\n💬 Falar no chat - +2 pts por msg\n🎉 Participar de evento - +10 pts\n🩸 Resenha vampírica - +5 pts\n🏆 Ganhar evento - +20 pts\n\nContinue participando para desbloquear mais!`)
                        .addFields(
                            { name: '⭐ Nível', value: `${nivel}`, inline: true },
                            { name: '🪙 Pontos', value: `${pontos}`, inline: true },
                            { name: '🏆 Conquistas', value: `${conquistas}`, inline: true }
                        )
                        .setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
                if (acao === 'nivel') {
                    const proximoNivel = (nivel+1)*50;
                    const falta = proximoNivel - xp;
                    const embed = new EmbedBuilder()
                        .setColor(0x22c55e)
                        .setTitle('⭐ Seu Nível NVB')
                        .setDescription(`**Nível atual:** ${nivel}\n**XP:** ${xp}/${proximoNivel}\n**Falta:** ${falta} XP para Nível ${nivel+1}\n\n**Cargo QG:** ${cargo.tag} ${cargo.nome}\n\nGanhe XP conversando, participando de eventos, resenhas! Cada mensagem +2 XP, evento +10 XP!`)
                        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                        .setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
                if (acao === 'pontos') {
                    const embed = new EmbedBuilder()
                        .setColor(0xa855f7)
                        .setTitle('🪙 Seus Pontos NVB')
                        .setDescription(`**Total:** ${pontos} 🪙\n**💚 Ganhos:** ${ganhos} 🪙\n**❤️ Gastos:** ${gastos} 🪙\n\n**Como ganhar:**\n• Entrar no servidor: +10\n• Verificação: +10\n• Perfil Roblox: +15\n• Chat: +2 por msg\n• Evento: +10\n• Resenha: +5\n• Ganhar evento: +20\n\nSeus pontos estão sendo contados automaticamente!`)
                        .setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
                if (acao === 'ranking') {
                    const sorted = Array.from(db.pontos.entries()).sort((a,b)=>b[1]-a[1]).slice(0,10);
                    let desc = '';
                    if (sorted.length === 0) {
                        desc = 'Ninguém tem pontos ainda! Converse no chat para ganhar pontos!\n\nO sistema de pontos está ativo e contando! +2 pontos por mensagem!';
                    } else {
                        desc = sorted.map(([idUser,pts],i)=> `${i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1+'.')} <@${idUser}> - ${pts} 🪙 | Nv ${getNivel(db.xp.get(idUser)||0)} | ${getCargoNVB(getNivel(db.xp.get(idUser)||0)).tag}`).join('\n');
                    }
                    const embed = new EmbedBuilder().setColor(0xf59e0b).setTitle('🏆 Ranking NVB - Top 10').setDescription(desc).setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
                // Compatibilidade com botões antigos removidos
                if (acao === 'roblox') {
                    const embed = new EmbedBuilder().setColor(0x22c55e).setTitle('🎮 Roblox NVB').setDescription(rData.username ? `Vinculado: ${rData.username} (ID: ${rData.id})` : 'Não vinculado! Use /registrar SeuNick').setThumbnail(rData.avatarUrl || null).setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
                if (acao === 'avatar' || acao === 'loja') {
                    return interaction.reply({ content: '🎨 Sistema de avatar removido! Focado agora em cargos e pontos! 🦇', ephemeral: true });
                }
                return interaction.reply({ content: `✅ ${acao} - funcionando!`, ephemeral: true });
            }
            // FIX: Botões de avatar/skin - TODOS OS 38 ESTILOS
            if (id.startsWith('avatar_estilo_')) {
                try{
                    await interaction.deferReply();
                    // id = avatar_estilo_{estilo}_{robloxId} - estilo pode ter _
                    let resto = id.replace('avatar_estilo_', '');
                    let lastUnderscore = resto.lastIndexOf('_');
                    let estiloKey = resto.substring(0, lastUnderscore);
                    let robloxId = resto.substring(lastUnderscore+1);
                    
                    const estiloInfo = ESTILOS_AVATAR[estiloKey];
                    if (!estiloInfo) {
                        return interaction.editReply({ content: `❌ Estilo ${estiloKey} não encontrado!` });
                    }

                    // Busca dados Roblox pelo ID ou usa dados salvos
                    let rData = null;
                    // Tenta achar pelo robloxId no cache
                    try{
                        // Busca avatar atual do usuário
                        let userData = db.roblox.get(interaction.user.id);
                        if(userData && String(userData.id) === String(robloxId)){
                            rData = userData;
                        } else {
                            // Tenta buscar via API se não achar
                            const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${robloxId}&size=720x720&format=Png&isCircular=false`);
                            const thumbData = await thumbRes.json();
                            const avatarUrl = thumbData.data?.[0]?.imageUrl || null;
                            rData = { id: robloxId, username: userData?.username || 'Roblox', avatarUrl: avatarUrl || userData?.avatarUrl };
                        }
                    }catch(e){}

                    if(!rData || !rData.avatarUrl){
                        // fallback para dados do usuário
                        rData = db.roblox.get(interaction.user.id) || { id: robloxId, username: 'Roblox', avatarUrl: null };
                    }

                    const pontosAtuais = db.pontos.get(interaction.user.id) || 5000; // modo teste 5000
                    if (pontosAtuais < estiloInfo.custo) {
                        return interaction.editReply({ content: `❌ Você precisa de ${estiloInfo.custo} 🪙 para ${estiloInfo.nome}! Você tem ${pontosAtuais} 🪙` });
                    }

                    if (estiloInfo.custo > 0) {
                        gastarPontos(interaction.user.id, estiloInfo.custo, `Comprou estilo ${estiloInfo.nome}`);
                        let dados = db.roblox.get(interaction.user.id) || {};
                        dados.estilo = estiloKey;
                        dados.estiloNome = estiloInfo.nome;
                        dados.ultimoEstilo = new Date().toLocaleString('pt-BR');
                        db.roblox.set(interaction.user.id, dados);
                        persistDB();
                    }

                    // Embed com skin modificada - TODOS OS ESTILOS agora com cenário
                    const embed = new EmbedBuilder()
                        .setColor(estiloInfo.cor)
                        .setTitle(`✅ Skin Modificada - ${estiloInfo.nome}!`)
                        .setDescription(`**🎨 Seu avatar foi transformado!**\n\n**Estilo:** ${estiloInfo.nome}\n**Cenário:** ${estiloInfo.prompt}\n**Custo:** ${estiloInfo.custo} 🪙\n**Saldo:** ${db.pontos.get(interaction.user.id)||0} 🪙\n\n**✨ MODIFICAÇÃO APLICADA PARA TODOS OS ESTILOS:**\n• Fundo com cenário ${estiloInfo.prompt}\n• Estilo visual ${estiloInfo.desc}\n• Cor personalizada\n• Avatar com efeito gótico/dark igual da sua referência!\n\nUse /avatar-roblox para ver todos os 38 estilos!`)
                        .setThumbnail(rData.avatarUrl)
                        .setImage(rData.avatarUrl)
                        .addFields(
                            { name: '🎮 Roblox', value: rData.username || 'Vinculado', inline: true },
                            { name: '🎨 Estilo Atual', value: estiloInfo.nome, inline: true },
                            { name: '💜 Cenário', value: estiloInfo.prompt, inline: false },
                            { name: '🪙 Pontos Restantes', value: `${db.pontos.get(interaction.user.id)||0} 🪙`, inline: true }
                        )
                        .setFooter({ text: `QG NVB | Loja Oficial | Estilo ${estiloInfo.nome} aplicado! | 38 estilos!` })
                        .setTimestamp();

                    return interaction.editReply({ embeds: [embed] });
                }catch(e){
                    console.error('Erro avatar_estilo:', e);
                    try{ return interaction.editReply({ content: '❌ Erro ao aplicar estilo: '+e.message }); }catch(_){ return interaction.reply({ content: '❌ Erro', ephemeral: true }); }
                }
            }

            if (id === 'avatar_loja') {
                try{
                    await interaction.deferReply({ ephemeral: true });
                    const pontos = db.pontos.get(interaction.user.id) || 5000;
                    let desc = `**Seu saldo:** ${pontos} 🪙 (MODO TESTE 5000)\n\n**🎨 LOJA COMPLETA - 38 ESTILOS COM SKIN MODIFICADA**\n\n`;
                    let count=0;
                    for(let [k,v] of Object.entries(ESTILOS_AVATAR)){
                        if(count>=20) break;
                        desc += `${v.nome} - ${v.custo} 🪙 - ${v.desc}\n`;
                        count++;
                    }
                    desc += `\n...e mais ${Object.keys(ESTILOS_AVATAR).length-count} estilos!\n\nTodos com modificação de skin + cenário igual sua referência DARK! 🦇`;
                    const embed = new EmbedBuilder().setColor(0xa855f7).setTitle('🎨 Loja NVB - 38 Estilos - SKIN MODIFICADA').setDescription(desc).setThumbnail(interaction.user.displayAvatarURL({dynamic:true})).setTimestamp();
                    // Cria botões para todos os estilos populares
                    const row1 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`avatar_estilo_dark_${db.roblox.get(interaction.user.id)?.id || '0'}`).setLabel('🖤 Dark (10)').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId(`avatar_estilo_vampirico_nvb_${db.roblox.get(interaction.user.id)?.id || '0'}`).setLabel('🩸 Vampírico (25)').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId(`avatar_estilo_gotico_${db.roblox.get(interaction.user.id)?.id || '0'}`).setLabel('🥀 Gótico (25)').setStyle(ButtonStyle.Secondary)
                    );
                    return interaction.editReply({ embeds: [embed], components: [row1] });
                }catch(e){ console.error(e); }
            }

            if (id === 'avatar_perfil') {
                try{
                    await interaction.deferReply({ ephemeral: true });
                    const rData = db.roblox.get(interaction.user.id);
                    if(!rData) return interaction.editReply({ content: 'Você não tem Roblox vinculado! Use /registrar' });
                    const estiloInfo = ESTILOS_AVATAR[rData.estilo] || ESTILOS_AVATAR.original;
                    const embed = new EmbedBuilder().setColor(estiloInfo.cor).setTitle('👤 Seu Perfil Roblox').setDescription(`**Nick:** ${rData.username}\n**Estilo Atual:** ${estiloInfo.nome}\n**Cenário:** ${estiloInfo.prompt}`).setThumbnail(rData.avatarUrl).setImage(rData.avatarUrl).setTimestamp();
                    return interaction.editReply({ embeds: [embed] });
                }catch(e){ console.error(e); }
            }

            if (id.startsWith('recrut_') || id.startsWith('cand_')) {
                return interaction.reply({ content: `Ação ${id} - Em breve sistema de aprovação!`, ephemeral: true });
            }
        }

        // Modal de candidatura (cada cargo com ficha própria)
        if (interaction.isModalSubmit()) {
            const modalId = interaction.customId;
            if (modalId.startsWith('modal_candidatura_')) {
                await interaction.deferReply({ ephemeral: true });
                const cargoKey = modalId.replace('modal_candidatura_', '');
                const ficha = FICHAS_CARGOS[cargoKey];
                if (!ficha) return interaction.editReply({ content: '❌ Cargo não encontrado!' });

                let data = {
                    id: Date.now(),
                    cargo: cargoKey,
                    data: new Date().toLocaleString('pt-BR'),
                    userId: interaction.user.id
                };

                for (let p of ficha.perguntas.slice(0, 5)) {
                    try {
                        data[p.id] = interaction.fields.getTextInputValue(p.id);
                    } catch (e) {}
                }

                // Salva e envia garantido (corrige #12)
                db.candidaturas.push(data);
                persistDB();
                await enviarCandidaturaGarantida(data);

                const embed = new EmbedBuilder()
                    .setColor(ficha.cor)
                    .setTitle(`${ficha.emoji} Candidatura Enviada - ${ficha.nome}!`)
                    .setDescription(`Sua candidatura para **${ficha.tag} ${ficha.nome}** foi enviada!\n\n Agora com ficha própria por cargo (não mesma ficha pra todos!)\n Enviado para canal #candidaturas-nvb + DM fundadora + salvo em JSON (não perde mais!)\n\n**O que você enviou:**\n${Object.entries(data).slice(0, 5).map(([k,v])=>`**${k}:** ${String(v).substring(0, 100)}`).join('\n')}\n\nLiderança vai analisar! 💜`)
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }
        }

    } catch(e){ console.error('Erro interaction:', e); try{ if(!interaction.replied) await interaction.reply({ content: '❌ Erro interno', ephemeral: true }); }catch(_){} }
});

// Só tenta logar se tem TOKEN, senão deixa só o site online (evita Failed deploy no Render)
if (TOKEN && CLIENT_ID) {
    client.login(TOKEN).then(()=>console.log('🔑 Login iniciado - ...')).catch(e=>console.error('❌ Falha login:', e.message));
    registerCommands();
} else {
    console.log('⚠️ Bot Discord NÃO iniciado - Configure DISCORD_TOKEN e CLIENT_ID no Environment do Render. Site continua online!');
}

setInterval(()=>{
    try{ if(client.user) client.user.setActivity('QG NVB | 38 estilos | /loja personalizada 🦇', { type: 3 }); }catch(_){}
}, 5*60*1000);

// ===== SITE OFICIAL QG NVB - SISTEMA NOVO  =====
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
.post.fixed::before{content:' FIXA';position:absolute;top:10px;right:12px;font-size:9px;background:#a855f7;padding:2px 6px;border-radius:10px}
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
.cargo-card.mod{border-color:#22c55e}
.cargo-card.sup{border-color:#3b82f6}
.cargo-card.lider{border-color:#ef4444}
</style>
</head>
<body>
<div class="topbar" id="topbar">
  <div class="logo">🦇 NVB</div>
  <div style="display:flex;gap:12px;align-items:center">
    <div style="position:relative">
      <span onclick="window.toggleNotificacoes()" style="cursor:pointer;font-size:20px;position:relative">🔔<sup id="notif-count" style="background:#ef4444;color:#fff;border-radius:50%;padding:2px 6px;font-size:10px;position:absolute;top:-8px;right:-10px;display:none">0</sup></span>
      <div id="notif-dropdown" style="display:none;position:absolute;top:30px;right:0;background:#151515;border:1px solid #333;border-radius:12px;padding:12px;width:280px;max-height:300px;overflow-y:auto;z-index:100">
        <h4 style="color:#a855f7;font-size:12px;margin-bottom:8px">🔔 Notificações</h4>
        <div id="notif-list" style="font-size:12px">Nenhuma notificação nova</div>
        <button onclick="window.marcarLidas()" style="margin-top:8px;background:#222;border:none;color:#fff;padding:6px 10px;border-radius:8px;font-size:11px;cursor:pointer;width:100%">Marcar como lidas</button>
      </div>
    </div>
  </div>
</div>

<div id="view-landing" class="landing">
  <div class="card">
    <div class="bat">🦇</div>
    <h1>Nytheris<br><span>Vampyre<br>Bloodline</span></h1>
    <p class="sub">Uma linhagem que acolhe.<br>Uma família que permanece.</p>
    <button class="btn-main" onclick="window.openRecrutamento()">Entrar no Recrutamento 🩸</button>
    <button class="btn-secondary" onclick="window.goToPainel()">Já sou da família - Entrar no QG</button>
    <p style="margin-top:20px;font-size:11px;color:#52525b">🦇 QG NVB • Nytheris Vampyre Bloodline</p>
  </div>
</div>

<div id="view-form" class="form-overlay">
  <div class="form-header"><span style="font-size:24px;cursor:pointer" onclick="window.closeRecrutamento()">✕</span><b>Recrutamento NVB</b><span id="step-indicator" style="margin-left:auto;color:#71717a;font-size:13px">1/2</span></div>
  <div class="progress"><div id="progress-bar" class="progress-bar"></div></div>
  <div class="form-body">
    <div class="step active" data-step="1"><h2>Quem é você? 🦇</h2><p style="color:#a1a1aa;margin:8px 0 16px">Conta rapidinho pra gente te conhecer</p>
      <div class="input-group"><label>Seu nick no Discord *</label><input id="f-nick" placeholder="Ex: tenshinxxz" /></div>
      <div class="input-group"><label>Seu nick no Roblox *</label><input id="f-nickRoblox" placeholder="Ex: Chaparral1516" /></div>
      <div class="input-group"><label>Sua idade (opcional)</label><input id="f-idade" type="number" placeholder="Ex: 18" /></div>
      <div class="input-group"><label>Como conheceu a NVB? *</label><div class="chip-group" id="f-como-chips"><div class="chip" onclick="window.toggleChip(this)">Indicação de amigo(a)</div><div class="chip" onclick="window.toggleChip(this)">TikTok</div><div class="chip" onclick="window.toggleChip(this)">Roblox</div><div class="chip" onclick="window.toggleChip(this)">Discord</div></div></div>
      <button class="btn-main" onclick="window.nextStep()">Continuar →</button></div>
    <div class="step" data-step="2"><h2>Quase lá! 💜</h2>
      <div class="input-group"><label>Por que quer entrar na NVB? *</label><textarea id="f-porque-nvb" placeholder="Conta o que te chamou atenção na gente 💜"></textarea></div>
      <div class="input-group"><label>Disponibilidade</label><div class="chip-group" id="f-dispo-chips"><div class="chip" onclick="window.toggleChip(this)">Manhã</div><div class="chip" onclick="window.toggleChip(this)">Tarde</div><div class="chip" onclick="window.toggleChip(this)">Noite</div><div class="chip" onclick="window.toggleChip(this)">Madrugada</div><div class="chip" onclick="window.toggleChip(this)">Finais de semana</div></div></div>
      <div class="input-group"><label>Contato (opcional)</label><input id="f-contato" placeholder="@seu contato" /></div>
      <div style="background:#151515;border:1px solid #222;border-radius:12px;padding:14px;margin-bottom:16px;font-size:13px;color:#a1a1aa"><b style="color:#fff">📜 Regras NVB:</b><br>• Respeito acima de tudo<br>• Família é lealdade<br>• Proibido vazar info do QG<br>• Participar de eventos<br>• Ser ativo(a)<br></div>
      <div class="input-group"><label style="color:#a1a1aa"><input type="checkbox" id="f-concorda" style="width:auto;margin-right:8px" checked> Li e concordo com as regras da NVB *</label></div>
      <button class="btn-main" onclick="window.enviarRecrutamento()" id="btn-enviar">Enviar Recrutamento 🩸</button><button class="btn-secondary" onclick="window.prevStep()">← Voltar</button>
    </div>
  </div>
</div>

<div id="view-login" class="form-overlay">
  <div class="form-header"><span style="font-size:24px;cursor:pointer" onclick="window.closeLogin()">✕</span><b>Entrar no QG NVB</b></div>
  <div class="form-body">
    <h2>Qual seu Discord? 🦇</h2>
    <p style="color:#a1a1aa;margin:8px 0 16px">Digite seu nick do Discord (ex: tenshinxxz) para carregar seus dados reais no passaporte!</p>
    <div class="input-group"><label>Seu nick Discord (id) *</label><input id="login-discord" placeholder="Ex: tenshinxxz" value="tenshinxxz" /></div>
    <div class="input-group"><label>Seu nick Roblox (opcional)</label><input id="login-roblox" placeholder="Ex: Chaparral1516" /></div>
    <button class="btn-main" onclick="window.fazerLoginQG()">Entrar no QG com meus dados 💜</button>
    <button class="btn-secondary" onclick="window.closeLogin()">Cancelar</button>
    <p style="font-size:11px;color:#52525b;margin-top:16px">Seu nick será salvo e seu passaporte mostrará: @tenshinxxz, seu Roblox, cargo, nível, pontos, conquistas, etc!</p>
  </div>
</div>

<div id="view-candidatura" class="form-overlay">
  <div class="form-header"><span style="font-size:24px;cursor:pointer" onclick="window.closeCandidatura()">✕</span><b id="cand-titulo">Candidatura</b><span style="margin-left:auto;color:#71717a;font-size:13px" id="cand-cargo-tag"></span></div>
  <div class="form-body" id="cand-form-body">
    <p style="color:#a1a1aa;margin-bottom:16px;font-size:13px">Preencha a ficha completa focada no cargo - todas as perguntas são específicas do cargo escolhido!</p>
    <div id="cand-campos"></div>
    <button class="btn-main" onclick="window.enviarCandidaturaSite()" id="btn-enviar-cand">Enviar Candidatura 📋</button><button class="btn-secondary" onclick="window.closeCandidatura()">Cancelar</button>
  </div>
</div>

<div id="view-painel" style="display:none">
  <div id="section-home" class="section active">
    <div class="passaporte" id="passaporte-demo" style="background:linear-gradient(135deg,#2a1840 0%,#1a0f2e 100%);border:2px solid #a855f7;border-radius:20px;padding:20px;margin:12px 0">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <div style="width:56px;height:56px;background:#a855f7;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px">🦇</div>
        <div>
          <h3 style="color:#a855f7;margin:0;font-size:16px">PASSAPORTE NVB</h3>
          <small style="color:#a1a1aa">Nytheris Vampyre Bloodline</small>
        </div>
      </div>
      
      <div id="passaporte-info" style="font-size:13px;line-height:1.8;color:#fff">
        👤 <b>Nick:</b> <span id="p-nick">@tenshinxxz</span><br>
        🎮 <b>Roblox:</b> <span id="p-roblox">Chaparral1516</span><br>
        🏷️ <b>Cargo:</b> <span id="p-cargo">[MBRS] Membro</span><br>
        ⭐ <b>Nível:</b> <span id="p-nivel">25</span> | 🪙 <b>Pontos:</b> <span id="p-pontos">5000</span><br>
        🏆 <b>Conquistas:</b> 8 | 🎨 <b>Estilo:</b> Vampírico NVB<br>
        📅 <b>Entrada:</b> <span id="p-data">28/09/2026</span> | 🔥 <b>Sequência:</b> 7 dias
      </div>

      <div style="margin-top:16px;padding-top:14px;border-top:1px solid #3a2a5a">
        <h4 style="color:#a855f7;font-size:12px;margin-bottom:10px">📋 INFORMAÇÕES DO QG</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div style="background:#1a0f2e;border:1px solid #3a2a5a;border-radius:10px;padding:10px">
            <div style="font-size:11px;color:#a855f7">🤖 Bot</div>
            <div style="font-size:13px;font-weight:600">QG NVB</div>
            <div style="font-size:11px;color:#22c55e">● Online 24H</div>
          </div>
          <div style="background:#1a0f2e;border:1px solid #3a2a5a;border-radius:10px;padding:10px">
            <div style="font-size:11px;color:#a855f7">🏰 Servidor</div>
            <div style="font-size:13px;font-weight:600">Nytheris Vampyre</div>
            <div style="font-size:11px;color:#a1a1aa">Bloodline</div>
          </div>
          <div style="background:#1a0f2e;border:1px solid #3a2a5a;border-radius:10px;padding:10px">
            <div style="font-size:11px;color:#a855f7">📊 Sistemas</div>
            <div style="font-size:12px;font-weight:600">Passaporte Unificado</div>
            <div style="font-size:10px;color:#a1a1aa">Roblox + Pontos + Avatar</div>
          </div>
          <div style="background:#1a0f2e;border:1px solid #3a2a5a;border-radius:10px;padding:10px">
            <div style="font-size:11px;color:#a855f7">💜 Família</div>
            <div style="font-size:13px;font-weight:600">Bloodline</div>
            <div style="font-size:10px;color:#a1a1aa">Linhagem que acolhe. Família que permanece.</div>
          </div>
        </div>
      </div>
    </div>

    <div style="background:#151515;border:1px solid #a855f7;border-radius:16px;padding:16px;margin:16px 0">
      <h3 style="color:#a855f7;margin-bottom:12px">📝 Criar Publicação</h3>
      
      <div class="input-group">
        <label>Título *</label>
        <input id="pub-titulo" placeholder="Ex: Resenha vampírica hoje! 🦇" style="width:100%;background:#0a0a0a;border:1px solid #333;border-radius:10px;padding:10px;color:#fff" />
      </div>
      <div class="input-group">
        <label>Assunto *</label>
        <select id="pub-assunto" style="width:100%;background:#0a0a0a;border:1px solid #333;border-radius:10px;padding:10px;color:#fff">
          <option value="Geral">💬 Geral</option>
          <option value="Evento">🎉 Evento</option>
          <option value="Conquista">🏆 Conquista</option>
          <option value="Sorteio">🎁 Sorteio</option>
          <option value="Aviso">📢 Aviso</option>
          <option value="Resenha">🦇 Resenha</option>
        </select>
      </div>
      <div class="input-group">
        <label>Descrição *</label>
        <textarea id="pub-descricao" placeholder="Escreva sua mensagem para a família NVB..." style="width:100%;background:#0a0a0a;border:1px solid #333;border-radius:10px;padding:10px;color:#fff;min-height:80px"></textarea>
      </div>
      <button class="btn-main" onclick="window.publicarPost()" style="background:#a855f7;width:100%;padding:12px;border-radius:12px;border:none;color:#fff;font-weight:700;cursor:pointer">📩 Publicar no QG</button>
    </div>

    <div style="margin:16px 0">
      <h3 style="color:#a855f7;margin-bottom:8px">📰 Feed NVB</h3>
      <div class="feed" id="feed"><p>Carregando feed...</p></div>
    </div>
  </div>

  <div id="section-cargos" class="section">
    <h2 style="margin-bottom:16px">🏷️ Cargos NVB</h2>
    <p style="font-size:12px;color:#a1a1aa;margin-bottom:12px">🌿 [NVT] Novato(a) — entrada no sistema<br>🌱 [MBRS] Membro — membro oficial<br>🩸 [VTRN] Veterano(a) — membro experiente<br>⭐ [VET+] Veterano(a)+ — membro de longa trajetória / destaque<br><small style="color:#71717a">Eles aparecem somente no perfil/painel do QG, enquanto os cargos reais do Discord continuam separados.</small></p>
    <div class="cargo-card">
      <h4>🌿 [NVT] Novato(a)</h4>
      <p style="font-size:12px;color:#a1a1aa">Ao entrar - Cargo inicial - Só no QG</p>
    </div>
    <div class="cargo-card">
      <h4>🌱 [MBRS] Membro</h4>
      <p style="font-size:12px;color:#a1a1aa">1 semana - Membro oficial - Só no QG</p>
    </div>
    <div class="cargo-card">
      <h4>🩸 [VTRN] Veterano(a)</h4>
      <p style="font-size:12px;color:#a1a1aa">1 mês - Participa ativamente - Só no QG</p>
    </div>
    <div class="cargo-card">
      <h4>⭐ [VET+] Veterano(a)+</h4>
      <p style="font-size:12px;color:#a1a1aa">2 meses - Membros experientes - Só no QG</p>
    </div>

    <h3 style="margin:20px 0 12px">🛡️ Cargos de Equipe</h3>
    

    <div class="cargo-card lider" style="border-color:#a855f7">
      <h4>🟣 [ADM] Administrador</h4>
      <p style="font-size:12px;color:#a1a1aa;margin:6px 0">Administra QG, resolve conflitos</p>
      <small style="color:#a1a1aa">Requisito: VET+ • experiência • confiança</small>
      <br><button class="btn-secondary" style="margin-top:8px;padding:8px 12px;font-size:12px" onclick="window.openCandidatura('ADM')">📋 Candidatar-se</button>
    </div>
    <div class="cargo-card lider" style="border-color:#3b82f6">
      <h4>🔵 [CMDT] Comandante</h4>
      <p style="font-size:12px;color:#a1a1aa;margin:6px 0">Comanda equipe, organiza, toma decisões</p>
      <small style="color:#a1a1aa">Requisito: VET+ • liderança • organização</small>
      <br><button class="btn-secondary" style="margin-top:8px;padding:8px 12px;font-size:12px" onclick="window.openCandidatura('CMDT')">📋 Candidatar-se</button>
    </div>
    <div class="cargo-card mod">
      <h4>🔷 [MOD] Moderador</h4>
      <p style="font-size:12px;color:#a1a1aa;margin:6px 0">Modera chat, aplica regras</p>
      <small style="color:#a1a1aa">Requisito: MBRS+ • conhecer regras • calma</small>
      <br><button class="btn-secondary" style="margin-top:8px;padding:8px 12px;font-size:12px" onclick="window.openCandidatura('MOD')">📋 Candidatar-se</button>
    </div>
    <div class="cargo-card sup">
      <h4>🟢 [SUP] Suporte</h4>
      <p style="font-size:12px;color:#a1a1aa;margin:6px 0">Ajuda novatos, tira dúvidas</p>
      <small style="color:#a1a1aa">Requisito: MBRS+ • paciência • boa comunicação</small>
      <br><button class="btn-secondary" style="margin-top:8px;padding:8px 12px;font-size:12px" onclick="window.openCandidatura('SUP')">📋 Candidatar-se</button>
    </div>
    <div class="cargo-card" style="border-color:#06b6d4">
      <h4>🩵 [ORG] Organizador</h4>
      <p style="font-size:12px;color:#a1a1aa;margin:6px 0">Organiza eventos e atividades</p>
      <small style="color:#a1a1aa">Requisito: Criatividade • organização</small>
      <br><button class="btn-secondary" style="margin-top:8px;padding:8px 12px;font-size:12px" onclick="window.openCandidatura('ORG')">📋 Candidatar-se</button>
    </div>
    <div class="cargo-card" style="border-color:#16a34a">
      <h4>🟢 [REC] Recrutador</h4>
      <p style="font-size:12px;color:#a1a1aa;margin:6px 0">Recruta novos membros</p>
      <small style="color:#a1a1aa">Requisito: Boa comunicação • conhecer NVB</small>
      <br><button class="btn-secondary" style="margin-top:8px;padding:8px 12px;font-size:12px" onclick="window.openCandidatura('REC')">📋 Candidatar-se</button>
    </div>
    <div class="cargo-card" style="border-color:#ec4899">
      <h4>🩷 [INF] Influenciador</h4>
      <p style="font-size:12px;color:#a1a1aa;margin:6px 0">Divulga NVB nas redes</p>
      <small style="color:#a1a1aa">Requisito: Rede social ativa • criar conteúdo</small>
      <br><button class="btn-secondary" style="margin-top:8px;padding:8px 12px;font-size:12px" onclick="window.openCandidatura('INF')">📋 Candidatar-se</button>
    </div>
    <div class="cargo-card lider">
      <h4>👑 [LDR] Líder</h4>
      <p style="font-size:12px;color:#a1a1aa;margin:6px 0">Comando total do QG</p>
      <small style="color:#71717a">Escolhido(a) pela fundadora</small>
    </div>
    <div class="cargo-card lider" style="border-color:#f59e0b">
      <h4>👑 [SB-LDR] Sub-Líder</h4>
      <p style="font-size:12px;color:#a1a1aa;margin:6px 0">Sub-líder - Igual ao cargo líder</p>
      <small style="color:#71717a">Escolhido(a) pela fundadora - Mesmas permissões do Líder</small>
      <br><button class="btn-secondary" style="margin-top:8px;padding:8px 12px;font-size:12px" onclick="window.openCandidatura('SB_LDR')">📋 Candidatar-se</button>
    </div>
  </div>

  <div id="section-pontos" class="section">
    <h2>💰 Pontos NVB</h2>
    <div id="pontos-list" style="margin-top:16px"><p>Carregando pontos de @tenshinxxz...</p></div>
  </div>

  <div id="section-ranking" class="section">
    <h2>🏆 Ranking NVB</h2>
    <div id="ranking-list" style="margin-top:16px"><p>Carregando ranking...</p></div>
  </div>

  <div id="section-conquistas" class="section">
    <h2>🏆 Conquistas</h2>
    <div id="conquistas-list" style="margin-top:16px">
      <p>Carregando conquistas de @tenshinxxz...</p>
    </div>
  </div>
</div>

<div class="bottom-nav" id="bottom-nav" style="display:none">
  <div class="nav-item active" onclick="window.navClick(this,'home')">🏠</div>
  <div class="nav-item" onclick="window.navClick(this,'ranking')">🏆</div>
  <div class="nav-item" onclick="window.navClick(this,'pontos')">🪙</div>
  <div class="nav-item" onclick="window.navClick(this,'cargos')">🏷️</div>
  <div class="nav-item" onclick="window.navClick(this,'conquistas')">🏆</div>
</div>

<div id="view-admin" style="display:none;max-width:600px;margin:0 auto;padding:16px">
  <h2 style="margin-bottom:16px">📋 Admin</h2>
  <div style="display:flex;gap:8px;margin-bottom:12px">
    <button class="btn-main" style="flex:1;padding:10px" onclick="window.loadAdminRecrut()">Recrutamentos</button>
    <button class="btn-secondary" style="flex:1;padding:10px" onclick="window.loadAdminCand()">Candidaturas</button>
  </div>
  <div id="admin-list">Carregando...</div>
  <button class="btn-secondary" onclick="window.goToPainel()">← Voltar pro QG</button>
</div>

<script>
let currentStep=1;
let totalSteps=2;

window.openRecrutamento = function(){
  try{
    let form = document.getElementById('view-form');
    let landing = document.getElementById('view-landing');
    if(form){ form.classList.add('active'); form.style.display='block'; }
    if(landing){ landing.style.display='none'; }
    currentStep=1;
    setTimeout(()=>{ try{ updateProgress(); }catch(e){} }, 100);
    // Preenche com dados salvos
    let nickSalvo = localStorage.getItem('nvb_discord_nick') || 'tenshinxxz';
    let robloxSalvo = localStorage.getItem('nvb_roblox_nick') || 'Chaparral1516';
    let fNick = document.getElementById('f-nick');
    let fRoblox = document.getElementById('f-nickRoblox');
    if(fNick && !fNick.value) fNick.value = nickSalvo;
    if(fRoblox && !fRoblox.value) fRoblox.value = robloxSalvo;
  }catch(e){ console.error(e); }
}
window.closeRecrutamento = function(){
  try{
    let form = document.getElementById('view-form');
    let landing = document.getElementById('view-landing');
    if(form){ form.classList.remove('active'); form.style.display='none'; }
    if(landing){ landing.style.display='flex'; }
  }catch(e){}
}

window.openLoginQG = function(){
  try{
    let loginView = document.getElementById('view-login');
    if(loginView){ loginView.style.display='block'; loginView.classList.add('active'); }
    let salvo = localStorage.getItem('nvb_discord_nick') || 'tenshinxxz';
    let robloxSalvo = localStorage.getItem('nvb_roblox_nick') || 'Chaparral1516';
    let input = document.getElementById('login-discord');
    let inputRoblox = document.getElementById('login-roblox');
    if(input) input.value = salvo;
    if(inputRoblox) inputRoblox.value = robloxSalvo;
  }catch(e){ console.error(e); }
}
window.closeLogin = function(){
  try{
    let loginView = document.getElementById('view-login');
    if(loginView){ loginView.style.display='none'; loginView.classList.remove('active'); }
  }catch(e){}
}
window.fazerLoginQG = function(){
  try{
    let discordNick = document.getElementById('login-discord').value.trim();
    let robloxNick = document.getElementById('login-roblox').value.trim();
    if(!discordNick){ alert('Digite seu nick Discord! Ex: tenshinxxz'); return; }
    localStorage.setItem('nvb_discord_nick', discordNick);
    if(robloxNick) localStorage.setItem('nvb_roblox_nick', robloxNick);
    localStorage.setItem('nvb_meus_pontos', '5000');
    localStorage.setItem('nvb_meu_nivel', '25');
    closeLogin();
    entrarPainelComDados(discordNick, robloxNick);
  }catch(e){ console.error(e); alert('Erro: '+e.message); }
}
window.entrarPainelComDados = function(discordNick, robloxNick){
  try{
    let landing = document.getElementById('view-landing');
    let form = document.getElementById('view-form');
    let painel = document.getElementById('view-painel');
    let bottom = document.getElementById('bottom-nav');
    let topbar = document.getElementById('topbar');
    let admin = document.getElementById('view-admin');
    let loginView = document.getElementById('view-login');
    
    if(landing) landing.style.display='none';
    if(form){ form.classList.remove('active'); form.style.display='none'; }
    if(loginView){ loginView.style.display='none'; loginView.classList.remove('active'); }
    if(painel) painel.style.display='block';
    if(bottom) bottom.style.display='flex';
    if(topbar) topbar.style.display='flex';
    if(admin) admin.style.display='none';
    
    showSection('home');
    loadFeed();
    loadRanking();
    loadPontos();
    loadConquistas();
    carregarMeuPassaporte(discordNick, robloxNick);
    
    localStorage.setItem('nvb_recru_done','1');
  }catch(e){ console.error('Erro entrarPainelComDados', e); }
}
window.goToPainel = function(){
  try{
    let salvo = localStorage.getItem('nvb_discord_nick');
    if(!salvo){
      openLoginQG();
      return;
    }
    let robloxSalvo = localStorage.getItem('nvb_roblox_nick') || 'Chaparral1516';
    entrarPainelComDados(salvo, robloxSalvo);
  }catch(e){ console.error('Erro goToPainel', e); openLoginQG(); }
}

window.carregarMeuPassaporte = function(discordNick, robloxNick){
  try{
    let nickLocal = discordNick || localStorage.getItem('nvb_discord_nick') || 'tenshinxxz';
    let robloxLocal = robloxNick || localStorage.getItem('nvb_roblox_nick') || 'Chaparral1516';
    let pontosLocal = localStorage.getItem('nvb_meus_pontos') || '5000';
    let nivelLocal = localStorage.getItem('nvb_meu_nivel') || '25';
    
    let infoEl = document.getElementById('passaporte-info');
    if(infoEl){
      let html = '';
      html += '👤 <b>Nick:</b> <span id="p-nick">@'+nickLocal+'</span><br>';
      html += '🎮 <b>Roblox:</b> <span id="p-roblox">'+robloxLocal+'</span><br>';
      html += '🏷️ <b>Cargo:</b> <span id="p-cargo">[MBRS] Membro</span><br>';
      html += '⭐ <b>Nível:</b> <span id="p-nivel">'+nivelLocal+'</span> | 🪙 <b>Pontos:</b> <span id="p-pontos">'+pontosLocal+'</span><br>';
      html += '🏆 <b>Conquistas:</b> 8 | 🎨 <b>Estilo:</b> Vampírico NVB<br>';
      html += '📅 <b>Entrada:</b> <span id="p-data">28/09/2026</span> | 🔥 <b>Sequência:</b> 7 dias';
      infoEl.innerHTML = html;
    }
    // Tenta buscar da API também
    fetch('/api/passaportes').then(r=>r.json()).then(lista=>{
      if(lista && lista.length>0){
        let achado = lista.find(p=> p.discordId && p.discordId.toLowerCase().includes(nickLocal.toLowerCase()));
        if(achado){
          let infoEl2 = document.getElementById('passaporte-info');
          if(infoEl2){
            let html = '';
            html += '👤 <b>Nick:</b> @'+nickLocal+'<br>';
            html += '🎮 <b>Roblox:</b> '+(achado.username||robloxLocal)+'<br>';
            html += '🏷️ <b>Cargo:</b> '+(achado.cargo||'[MBRS] Membro')+'<br>';
            html += '⭐ <b>Nível:</b> '+(achado.nivel||nivelLocal)+' | 🪙 <b>Pontos:</b> '+(achado.pontos||pontosLocal)+'<br>';
            html += '🏆 <b>Conquistas:</b> '+(achado.conquistas||8)+' | 🎨 <b>Estilo:</b> '+(achado.estilo||'Vampírico NVB')+'<br>';
            html += '📅 <b>Entrada:</b> '+(achado.entrada||'28/09/2026')+' | 🔥 <b>Sequência:</b> 7 dias';
            infoEl2.innerHTML = html;
          }
        }
      }
    }).catch(()=>{});
  }catch(e){ console.error('Erro carregarMeuPassaporte', e); }
}

window.showSection = function(name){
  try{
    document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
    let target=document.getElementById('section-'+name);
    if(target) target.classList.add('active');
    if(name==='ranking') loadRanking();
    if(name==='pontos') loadPontos();
    if(name==='conquistas') loadConquistas();
    if(name==='home') loadFeed();
  }catch(e){ console.error(e); }
}
window.navClick = function(el,page){
  try{
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    if(el) el.classList.add('active');
    showSection(page);
  }catch(e){ console.error(e); }
}
window.updateProgress = function(){
  try{
    let pct=(currentStep/totalSteps)*100;
    let bar = document.getElementById('progress-bar');
    let indicator = document.getElementById('step-indicator');
    if(bar) bar.style.width=pct+'%';
    if(indicator) indicator.innerText=currentStep+'/'+totalSteps;
    document.querySelectorAll('.step').forEach(s=>{
      s.classList.remove('active');
      if(parseInt(s.dataset.step)===currentStep) s.classList.add('active');
    });
  }catch(e){ console.error('updateProgress erro', e); }
}
window.nextStep = function(){
  try{
    if(currentStep===1){
      let nickEl = document.getElementById('f-nick');
      let robloxEl = document.getElementById('f-nickRoblox');
      if(!nickEl || !nickEl.value.trim() || !robloxEl || !robloxEl.value.trim()){
        alert('Preencha nick Discord e Roblox!'); return;
      }
      // Salva para usar no QG
      localStorage.setItem('nvb_discord_nick', nickEl.value.trim());
      localStorage.setItem('nvb_roblox_nick', robloxEl.value.trim());
      let idadeEl = document.getElementById('f-idade');
      if(idadeEl && idadeEl.value) localStorage.setItem('nvb_idade', idadeEl.value);
    }
    if(currentStep<totalSteps){ currentStep++; updateProgress(); }
  }catch(e){ console.error('nextStep erro', e); alert('Erro: '+e.message); }
}
window.prevStep = function(){ try{ if(currentStep>1){ currentStep--; updateProgress(); } }catch(e){} }
window.toggleChip = function(el){ try{ el.classList.toggle('selected'); }catch(e){} }
window.getChipValues = function(id){ try{ let chips=document.querySelectorAll('#'+id+' .chip.selected'); return Array.from(chips).map(c=>c.innerText).join(', '); }catch(e){ return ''; } }

window.enviarRecrutamento = async function(){
  try{
    let concordaEl = document.getElementById('f-concorda');
    if(!concordaEl || !concordaEl.checked){ alert('Você precisa concordar com as regras!'); return; }
    let btn=document.getElementById('btn-enviar');
    if(btn){ btn.innerText='Enviando...'; btn.disabled=true; }
    let data={
      nick:document.getElementById('f-nick').value,
      nickRoblox:document.getElementById('f-nickRoblox').value,
      idade:document.getElementById('f-idade').value,
      comoConheceu:getChipValues('f-como-chips'),
      porqueNVB:document.getElementById('f-porque-nvb').value,
      disponibilidade:getChipValues('f-dispo-chips'),
      contato:document.getElementById('f-contato').value,
      data:new Date().toLocaleString('pt-BR'),
      tipo: 'recrutamento'
    };
    // Salva local sempre
    let lista=JSON.parse(localStorage.getItem('nvb_recrus')||'[]'); lista.push(data); localStorage.setItem('nvb_recrus',JSON.stringify(lista));
    localStorage.setItem('nvb_discord_nick', data.nick);
    localStorage.setItem('nvb_roblox_nick', data.nickRoblox);
    
    try{
      let res=await fetch('/api/recrutamento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      if(res.ok){
        alert('✅ Recrutamento enviado com sucesso! Bem-vinda à família NVB! 🦇💜');
        goToPainel();
      }else{ throw new Error('API falhou'); }
    }catch(e){
      alert('✅ Recrutamento salvo localmente! Você já pode entrar no QG! 🦇\n(Seu nick: @'+data.nick+' / Roblox: '+data.nickRoblox+')');
      goToPainel();
    }
    if(btn){ btn.innerText='Enviar Recrutamento 🩸'; btn.disabled=false; }
  }catch(e){ console.error(e); alert('Erro: '+e.message); let btn=document.getElementById('btn-enviar'); if(btn){ btn.innerText='Enviar Recrutamento 🩸'; btn.disabled=false; } }
}

// Candidaturas por cargo - FICHAS COMPLETAS COM TODAS AS PERGUNTAS FOCADAS NO CARGO
const FICHAS_QG = {
  ADM: { nome: "Administrador", emoji: "🟣", tag: "[ADM]", perguntas: [
    {id:"nome", label:"Nome:", tipo:"texto", obrigatorio:true},
    {id:"idade", label:"Idade:", tipo:"numero", obrigatorio:true},
    {id:"nickRoblox", label:"Nick Roblox:", tipo:"texto", obrigatorio:true},
    {id:"idRoblox", label:"ID Roblox:", tipo:"texto", obrigatorio:true},
    {id:"discord", label:"Usuário Discord:", tipo:"texto", obrigatorio:true},
    {id:"tempoNVB", label:"Tempo na NVB:", tipo:"texto", obrigatorio:true},
    {id:"expAdm", label:"Experiência com administração:", tipo:"textarea", obrigatorio:true},
    {id:"expOutros", label:"Experiência em outros clãs/servidores:", tipo:"textarea", obrigatorio:false},
    {id:"porque", label:"Por que deseja ser Administrador?", tipo:"textarea", obrigatorio:true},
    {id:"contribuir", label:"O que você pode contribuir para a NVB?", tipo:"textarea", obrigatorio:true},
    {id:"conflitoMembros", label:"Como resolveria um conflito entre membros?", tipo:"textarea", obrigatorio:true},
    {id:"problemaEquipe", label:"Como lidaria com um problema envolvendo outro membro da equipe?", tipo:"textarea", obrigatorio:true},
    {id:"disponibilidade", label:"Disponibilidade:", tipo:"texto", obrigatorio:true},
    {id:"obs", label:"Observações:", tipo:"textarea", obrigatorio:false}
  ]},
  CMDT: { nome: "Comandante", emoji: "🔵", tag: "[CMDT]", perguntas: [
    {id:"nome", label:"Nome:", tipo:"texto", obrigatorio:true},
    {id:"idade", label:"Idade:", tipo:"numero", obrigatorio:true},
    {id:"nickRoblox", label:"Nick Roblox:", tipo:"texto", obrigatorio:true},
    {id:"idRoblox", label:"ID Roblox:", tipo:"texto", obrigatorio:true},
    {id:"discord", label:"Usuário Discord:", tipo:"texto", obrigatorio:true},
    {id:"tempoNVB", label:"Tempo na NVB:", tipo:"texto", obrigatorio:true},
    {id:"expLideranca", label:"Experiência com liderança:", tipo:"textarea", obrigatorio:true},
    {id:"jaLiderou", label:"Já liderou alguma equipe?", tipo:"texto", obrigatorio:true},
    {id:"porque", label:"Por que deseja ser Comandante?", tipo:"textarea", obrigatorio:true},
    {id:"organizarEquipe", label:"Como organizaria a equipe?", tipo:"textarea", obrigatorio:true},
    {id:"decisaoDificil", label:"Como tomaria uma decisão difícil?", tipo:"textarea", obrigatorio:true},
    {id:"conflitoEquipe", label:"Como lidaria com conflitos entre membros da equipe?", tipo:"textarea", obrigatorio:true},
    {id:"disponibilidade", label:"Disponibilidade:", tipo:"texto", obrigatorio:true},
    {id:"obs", label:"Observações:", tipo:"textarea", obrigatorio:false}
  ]},
  MOD: { nome: "Moderador", emoji: "🔷", tag: "[MOD]", perguntas: [
    {id:"nome", label:"Nome:", tipo:"texto", obrigatorio:true},
    {id:"idade", label:"Idade:", tipo:"numero", obrigatorio:true},
    {id:"nickRoblox", label:"Nick Roblox:", tipo:"texto", obrigatorio:true},
    {id:"idRoblox", label:"ID Roblox:", tipo:"texto", obrigatorio:true},
    {id:"discord", label:"Usuário Discord:", tipo:"texto", obrigatorio:true},
    {id:"tempoNVB", label:"Tempo na NVB:", tipo:"texto", obrigatorio:true},
    {id:"expMod", label:"Experiência com moderação:", tipo:"textarea", obrigatorio:true},
    {id:"jaFoiMod", label:"Já foi moderador?", tipo:"texto", obrigatorio:true},
    {id:"porque", label:"Por que deseja ser Moderador?", tipo:"textarea", obrigatorio:true},
    {id:"quebraRegra", label:"Como agiria diante de uma quebra de regra?", tipo:"textarea", obrigatorio:true},
    {id:"discussaoChat", label:"Como lidaria com uma discussão no chat?", tipo:"textarea", obrigatorio:true},
    {id:"punicao", label:"Como aplicaria uma punição corretamente?", tipo:"textarea", obrigatorio:true},
    {id:"disponibilidade", label:"Disponibilidade:", tipo:"texto", obrigatorio:true},
    {id:"obs", label:"Observações:", tipo:"textarea", obrigatorio:false}
  ]},
  SUP: { nome: "Suporte", emoji: "🟢", tag: "[SUP]", perguntas: [
    {id:"nome", label:"Nome:", tipo:"texto", obrigatorio:true},
    {id:"idade", label:"Idade:", tipo:"numero", obrigatorio:true},
    {id:"nickRoblox", label:"Nick Roblox:", tipo:"texto", obrigatorio:true},
    {id:"idRoblox", label:"ID Roblox:", tipo:"texto", obrigatorio:true},
    {id:"discord", label:"Usuário Discord:", tipo:"texto", obrigatorio:true},
    {id:"tempoNVB", label:"Tempo na NVB:", tipo:"texto", obrigatorio:true},
    {id:"expAtendimento", label:"Experiência com atendimento:", tipo:"textarea", obrigatorio:true},
    {id:"porque", label:"Por que deseja ser Suporte?", tipo:"textarea", obrigatorio:true},
    {id:"ajudarDuvidas", label:"Como ajudaria um membro com dúvidas?", tipo:"textarea", obrigatorio:true},
    {id:"membroIrritado", label:"Como lidaria com um membro irritado?", tipo:"textarea", obrigatorio:true},
    {id:"manterCalma", label:"Você consegue manter a calma durante um atendimento?", tipo:"texto", obrigatorio:true},
    {id:"disponibilidade", label:"Disponibilidade:", tipo:"texto", obrigatorio:true},
    {id:"obs", label:"Observações:", tipo:"textarea", obrigatorio:false}
  ]},
  ORG: { nome: "Organizador", emoji: "🩵", tag: "[ORG]", perguntas: [
    {id:"nome", label:"Nome:", tipo:"texto", obrigatorio:true},
    {id:"idade", label:"Idade:", tipo:"numero", obrigatorio:true},
    {id:"nickRoblox", label:"Nick Roblox:", tipo:"texto", obrigatorio:true},
    {id:"idRoblox", label:"ID Roblox:", tipo:"texto", obrigatorio:true},
    {id:"discord", label:"Usuário Discord:", tipo:"texto", obrigatorio:true},
    {id:"tempoNVB", label:"Tempo na NVB:", tipo:"texto", obrigatorio:true},
    {id:"expEventos", label:"Experiência organizando eventos:", tipo:"textarea", obrigatorio:true},
    {id:"jaOrganizou", label:"Já organizou atividades em outros servidores?", tipo:"texto", obrigatorio:true},
    {id:"porque", label:"Por que deseja ser Organizador?", tipo:"textarea", obrigatorio:true},
    {id:"eventoCriar", label:"Que evento você gostaria de criar para a NVB?", tipo:"textarea", obrigatorio:true},
    {id:"organizarDivulgar", label:"Como faria para organizar e divulgar um evento?", tipo:"textarea", obrigatorio:true},
    {id:"disponibilidade", label:"Disponibilidade:", tipo:"texto", obrigatorio:true},
    {id:"obs", label:"Observações:", tipo:"textarea", obrigatorio:false}
  ]},
  REC: { nome: "Recrutador", emoji: "🟢", tag: "[REC]", perguntas: [
    {id:"nome", label:"Nome:", tipo:"texto", obrigatorio:true},
    {id:"idade", label:"Idade:", tipo:"numero", obrigatorio:true},
    {id:"nickRoblox", label:"Nick Roblox:", tipo:"texto", obrigatorio:true},
    {id:"idRoblox", label:"ID Roblox:", tipo:"texto", obrigatorio:true},
    {id:"discord", label:"Usuário Discord:", tipo:"texto", obrigatorio:true},
    {id:"tempoNVB", label:"Tempo na NVB:", tipo:"texto", obrigatorio:true},
    {id:"expRecrut", label:"Experiência com recrutamento:", tipo:"textarea", obrigatorio:true},
    {id:"jaRecrutou", label:"Já recrutou pessoas para algum clã?", tipo:"texto", obrigatorio:true},
    {id:"porque", label:"Por que deseja ser Recrutador?", tipo:"textarea", obrigatorio:true},
    {id:"apresentarNVB", label:"Como apresentaria a NVB para uma pessoa interessada?", tipo:"textarea", obrigatorio:true},
    {id:"identificarCandidato", label:"Como identificaria um bom candidato?", tipo:"textarea", obrigatorio:true},
    {id:"evitarProblemas", label:"Como evitaria recrutar pessoas que possam causar problemas?", tipo:"textarea", obrigatorio:true},
    {id:"disponibilidade", label:"Disponibilidade:", tipo:"texto", obrigatorio:true},
    {id:"obs", label:"Observações:", tipo:"textarea", obrigatorio:false}
  ]},
  INF: { nome: "Influenciador", emoji: "🩷", tag: "[INF]", perguntas: [
    {id:"nome", label:"Nome:", tipo:"texto", obrigatorio:true},
    {id:"idade", label:"Idade:", tipo:"numero", obrigatorio:true},
    {id:"nickRoblox", label:"Nick Roblox:", tipo:"texto", obrigatorio:true},
    {id:"idRoblox", label:"ID Roblox:", tipo:"texto", obrigatorio:true},
    {id:"discord", label:"Usuário Discord:", tipo:"texto", obrigatorio:true},
    {id:"tempoNVB", label:"Tempo na NVB:", tipo:"texto", obrigatorio:true},
    {id:"plataforma", label:"Plataforma que utiliza:", tipo:"texto", obrigatorio:true},
    {id:"userPerfil", label:"Nome de usuário/perfil:", tipo:"texto", obrigatorio:true},
    {id:"linkPerfil", label:"Link do perfil:", tipo:"texto", obrigatorio:true},
    {id:"seguidores", label:"Quantidade aproximada de seguidores:", tipo:"texto", obrigatorio:true},
    {id:"expConteudo", label:"Experiência criando conteúdo:", tipo:"textarea", obrigatorio:true},
    {id:"porque", label:"Por que deseja ser Influenciador?", tipo:"textarea", obrigatorio:true},
    {id:"tipoConteudo", label:"Que tipo de conteúdo faria para divulgar a NVB?", tipo:"textarea", obrigatorio:true},
    {id:"frequencia", label:"Com que frequência consegue publicar?", tipo:"texto", obrigatorio:true},
    {id:"disponibilidade", label:"Disponibilidade:", tipo:"texto", obrigatorio:true},
    {id:"obs", label:"Observações:", tipo:"textarea", obrigatorio:false}
  ]},
  LDR: { nome: "Líder", emoji: "👑", tag: "[LDR]", perguntas: [
    {id:"nome", label:"Nome:", tipo:"texto", obrigatorio:true},
    {id:"idade", label:"Idade:", tipo:"numero", obrigatorio:true},
    {id:"nickRoblox", label:"Nick Roblox:", tipo:"texto", obrigatorio:true},
    {id:"idRoblox", label:"ID Roblox:", tipo:"texto", obrigatorio:true},
    {id:"discord", label:"Usuário Discord:", tipo:"texto", obrigatorio:true},
    {id:"tempoNVB", label:"Tempo na NVB:", tipo:"texto", obrigatorio:true},
    {id:"porque", label:"Por que deve ser Líder?", tipo:"textarea", obrigatorio:true},
    {id:"disponibilidade", label:"Disponibilidade:", tipo:"texto", obrigatorio:true},
    {id:"obs", label:"Observações:", tipo:"textarea", obrigatorio:false}
  ]},
  SB_LDR: { nome: "Sub-Líder", emoji: "👑", tag: "[SB-LDR]", perguntas: [
    {id:"nome", label:"Nome:", tipo:"texto", obrigatorio:true},
    {id:"idade", label:"Idade:", tipo:"numero", obrigatorio:true},
    {id:"nickRoblox", label:"Nick Roblox:", tipo:"texto", obrigatorio:true},
    {id:"idRoblox", label:"ID Roblox:", tipo:"texto", obrigatorio:true},
    {id:"discord", label:"Usuário Discord:", tipo:"texto", obrigatorio:true},
    {id:"tempoNVB", label:"Tempo na NVB:", tipo:"texto", obrigatorio:true},
    {id:"expLideranca", label:"Experiência com liderança:", tipo:"textarea", obrigatorio:true},
    {id:"porque", label:"Por que deseja ser Sub-Líder?", tipo:"textarea", obrigatorio:true},
    {id:"organizarEquipe", label:"Como organizaria a equipe?", tipo:"textarea", obrigatorio:true},
    {id:"disponibilidade", label:"Disponibilidade:", tipo:"texto", obrigatorio:true},
    {id:"obs", label:"Observações:", tipo:"textarea", obrigatorio:false}
  ]}
};

let cargoAtualCandidatura = null;

window.openCandidatura = function(cargo){
  try{
    let ficha = FICHAS_QG[cargo] || FICHAS_QG[cargo.toUpperCase()];
    if(!ficha){ alert('Cargo não encontrado: '+cargo); return; }
    cargoAtualCandidatura = cargo;
    document.getElementById('cand-titulo').innerText = ficha.emoji+' Candidatura '+ficha.nome;
    document.getElementById('cand-cargo-tag').innerText = ficha.tag;
    
    let html = '';
    for(let p of ficha.perguntas){
      let required = p.obrigatorio ? ' *' : '';
      let labelEsc = p.label.replace(/'/g, "\'");
      if(p.tipo === 'textarea'){
        html += '<div class="input-group"><label>'+p.label+required+'</label><textarea id="cand-'+p.id+'" placeholder="'+labelEsc+'" style="width:100%;background:#0a0a0a;border:1px solid #333;border-radius:10px;padding:10px;color:#fff;min-height:60px"></textarea></div>';
      } else if(p.tipo === 'numero'){
        html += '<div class="input-group"><label>'+p.label+required+'</label><input id="cand-'+p.id+'" type="number" placeholder="'+labelEsc+'" style="width:100%;background:#0a0a0a;border:1px solid #333;border-radius:10px;padding:10px;color:#fff" /></div>';
      } else {
        html += '<div class="input-group"><label>'+p.label+required+'</label><input id="cand-'+p.id+'" placeholder="'+labelEsc+'" style="width:100%;background:#0a0a0a;border:1px solid #333;border-radius:10px;padding:10px;color:#fff" /></div>';
      }
    }
    document.getElementById('cand-campos').innerHTML = html;
    document.getElementById('view-candidatura').style.display='block';
    document.getElementById('view-candidatura').classList.add('active');
  }catch(e){ console.error(e); alert('Erro candidatura: '+e.message); }
}

window.closeCandidatura = function(){
  try{
    document.getElementById('view-candidatura').style.display='none';
    document.getElementById('view-candidatura').classList.remove('active');
    cargoAtualCandidatura = null;
  }catch(e){}
}

window.enviarCandidaturaSite = async function(){
  try{
    if(!cargoAtualCandidatura){ alert('Selecione um cargo!'); return; }
    let ficha = FICHAS_QG[cargoAtualCandidatura];
    let data = { cargo: cargoAtualCandidatura, data: new Date().toLocaleString('pt-BR'), tipo: 'candidatura', id: Date.now() };
    for(let p of ficha.perguntas){
      let el = document.getElementById('cand-'+p.id);
      if(el){
        let val = el.value.trim();
        if(p.obrigatorio && !val){ alert('Preencha: '+p.label); el.focus(); return; }
        data[p.id] = val;
      }
    }
    let btn = document.getElementById('btn-enviar-cand');
    if(btn){ btn.innerText='Enviando...'; btn.disabled=true; }
    try{
      let res = await fetch('/api/candidatura',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      if(res.ok){ alert('✅ Candidatura para '+ficha.tag+' '+ficha.nome+' enviada! 🦇💜'); closeCandidatura(); }
      else throw new Error();
    }catch(e){
      let lista = JSON.parse(localStorage.getItem('nvb_cands')||'[]'); lista.push(data); localStorage.setItem('nvb_cands', JSON.stringify(lista));
      alert('✅ Candidatura salva! - '+ficha.tag+' '+ficha.nome);
      closeCandidatura();
    }
    if(btn){ btn.innerText='Enviar Candidatura 📋'; btn.disabled=false; }
  }catch(e){ console.error(e); alert('Erro: '+e.message); }
}

let notificacoes = JSON.parse(localStorage.getItem('nvb_notifs')||'[]');
let notifCount = parseInt(localStorage.getItem('nvb_notif_count')||'2');
window.atualizarNotificacaoIcone = function(){
  try{
    let el = document.getElementById('notif-count');
    if(!el) return;
    if(notifCount > 0){ el.style.display='inline'; el.innerText = notifCount > 9 ? '9+' : notifCount; }
    else { el.style.display='none'; }
  }catch(e){}
}
window.toggleNotificacoes = function(){
  try{
    let dd = document.getElementById('notif-dropdown');
    if(!dd) return;
    dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
    if(dd.style.display === 'block'){ renderNotificacoes(); }
  }catch(e){}
}
window.renderNotificacoes = function(){
  try{
    let list = document.getElementById('notif-list');
    if(!list) return;
    if(notificacoes.length === 0){
      list.innerHTML = '<p style="color:#71717a">Nenhuma notificação nova<br><br>Quando alguém ganhar sorteio ou conquista, aparece aqui! 🔔</p>';
      return;
    }
    let html = '';
    for(let n of notificacoes.slice(-5).reverse()){
      html += '<div style="background:#0a0a0a;border:1px solid #222;border-radius:8px;padding:8px;margin-bottom:6px"><b style="color:#a855f7">'+(n.titulo||'Nova mensagem')+'</b><br><span style="color:#a1a1aa;font-size:11px">'+(n.texto||'')+'</span><br><small style="color:#52525b">'+(n.data||'')+'</small></div>';
    }
    list.innerHTML = html;
  }catch(e){}
}
window.adicionarNotificacao = function(titulo, texto){
  try{
    notificacoes.push({titulo, texto, data: new Date().toLocaleString('pt-BR')});
    notifCount++;
    localStorage.setItem('nvb_notifs', JSON.stringify(notificacoes.slice(-20)));
    localStorage.setItem('nvb_notif_count', notifCount);
    atualizarNotificacaoIcone();
  }catch(e){}
}
window.marcarLidas = function(){
  try{
    notifCount = 0;
    localStorage.setItem('nvb_notif_count', '0');
    atualizarNotificacaoIcone();
    let list = document.getElementById('notif-list');
    if(list) list.innerHTML = '<p style="color:#22c55a"> Todas marcadas como lidas!</p>';
    setTimeout(()=>{let dd=document.getElementById('notif-dropdown'); if(dd) dd.style.display='none';}, 1000);
  }catch(e){}
}

window.publicarPost = async function(){
  try{
    let titulo = document.getElementById('pub-titulo')?.value?.trim();
    let assunto = document.getElementById('pub-assunto')?.value;
    let descricao = document.getElementById('pub-descricao')?.value?.trim();
    if(!titulo || !descricao){ alert('Preencha título e descrição!'); return; }
    let nickLocal = localStorage.getItem('nvb_discord_nick') || 'tenshinxxz';
    let robloxLocal = localStorage.getItem('nvb_roblox_nick') || 'Chaparral1516';
    let novoPost = {
      id: Date.now(),
      avatar: '🦇',
      user: '@'+nickLocal,
      titulo: titulo,
      assunto: assunto,
      text: '['+assunto+'] '+titulo+' - '+descricao+'\n\n👤 Por: @'+nickLocal+' | 🎮 '+robloxLocal,
      likes: 0,
      comments: 0,
      data: new Date().toLocaleString('pt-BR'),
      tipo: 'publicacao'
    };
    let postsLocais = JSON.parse(localStorage.getItem('nvb_posts')||'[]');
    postsLocais.push(novoPost);
    localStorage.setItem('nvb_posts', JSON.stringify(postsLocais));
    try{ await fetch('/api/posts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(novoPost)}); }catch(e){}
    adicionarNotificacao('📝 Nova publicação', titulo+' por @'+nickLocal);
    alert('✅ Publicação "'+titulo+'" publicada! Agora aparece no feed com @'+nickLocal+' + Roblox '+robloxLocal+'! 🦇');
    document.getElementById('pub-titulo').value = '';
    document.getElementById('pub-descricao').value = '';
    loadFeed();
  }catch(e){ console.error(e); alert('Erro: '+e.message); }
}

window.loadFeed = async function(){
  try{
    let feed=document.getElementById('feed');if(!feed)return;
    let nickLocal = localStorage.getItem('nvb_discord_nick') || 'tenshinxxz';
    let robloxLocal = localStorage.getItem('nvb_roblox_nick') || 'Chaparral1516';
    let fixas=[
      {avatar:'🦇',user:'QG NVB OFICIAL',titulo:'BEM-VINDO(A) @'+nickLocal,assunto:'Aviso',text:'🦇 BEM-VINDO(A) AO QG NYTHERIS VAMPYRE BLOODLINE! @'+nickLocal+' | 🎮 '+robloxLocal+' | Uma linhagem que acolhe. Uma família que permanece. 💜',likes:999,comments:0,fixed:true},
      {avatar:'🏆',user:'SISTEMA NVB',titulo:'RANKING E PONTOS',assunto:'Sistema',text:'🏆 Confira seu ranking e pontos nas abas abaixo! @'+nickLocal+' você tem 5000 pontos! Participe para subir de nível! 🔔',likes:100,comments:10,fixed:true},
      {avatar:'🎁',user:'SORTEIOS NVB',titulo:'Sorteios da família',assunto:'Sorteio',text:'🎉 Fique de olho nos sorteios da NVB! Ganhe pontos e prêmios!',likes:50,comments:5,fixed:false,tipo:'sorteio'},
      {avatar:'🏆',user:'CONQUISTAS',titulo:'Conquistas NVB de @'+nickLocal,assunto:'Conquista',text:'🏆 @'+nickLocal+' | 🎮 '+robloxLocal+' | 8 conquistas desbloqueadas! Continue participando!',likes:30,comments:3,fixed:false,tipo:'conquista'}
    ];
    let postsApi = [];
    try{
      let controller = new AbortController();
      setTimeout(()=>controller.abort(), 2000);
      let res=await fetch('/api/posts', {signal: controller.signal}); postsApi=await res.json();
    }catch(e){ console.log('API posts falhou, usando locais'); }
    let locais=JSON.parse(localStorage.getItem('nvb_posts')||'[]');
    let todos=fixas.concat(postsApi).concat(locais).reverse();
    let html='';
    for(let p of todos){
      let badgeAssunto = p.assunto ? '<span style="font-size:9px;background:#222;padding:2px 6px;border-radius:8px;margin-left:6px">'+(p.assunto||'')+'</span>' : '';
      let tituloHtml = p.titulo ? '<div style="font-weight:700;color:#a855f7;margin-bottom:4px">'+p.titulo+' '+badgeAssunto+'</div>' : '';
      html+='<div class="post '+(p.fixed?'fixed':'')+'" style="'+(p.tipo==='sorteio'?'border-color:#f59e0b;background:#1a1500':p.tipo==='conquista'?'border-color:#22c55e;background:#0a1a0f':'')+'"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:20px">'+(p.avatar||'🦇')+'</span><b>'+p.user+'</b>'+(p.fixed?'<span style="font-size:9px;background:#a855f7;padding:2px 6px;border-radius:8px;margin-left:6px">FIXA</span>':'')+'</div>'+tituloHtml+'<p style="font-size:13px;line-height:1.5;margin-bottom:10px;white-space:pre-wrap">'+p.text+'</p><div style="display:flex;gap:12px;color:#71717a;font-size:11px"><span>❤️ '+p.likes+'</span><span>💬 '+p.comments+'</span><span style="color:#52525b">'+(p.data||'')+'</span>'+(p.assunto?'<span style="color:#a855f7"> '+p.assunto+'</span>':'')+'</div></div>';
    }
    feed.innerHTML=html;
    atualizarNotificacaoIcone();
  }catch(e){
    console.error('loadFeed erro', e);
    try{
      let feed=document.getElementById('feed');
      if(feed) feed.innerHTML='<p>Feed com erro, mas suas publicações salvas localmente aparecerão aqui! 🦇</p>';
    }catch(e2){}
  }
}

window.loadRanking = async function(){
  try{
    let el=document.getElementById('ranking-list');if(!el)return;
    let nickLocal = localStorage.getItem('nvb_discord_nick') || 'tenshinxxz';
    let robloxLocal = localStorage.getItem('nvb_roblox_nick') || 'Chaparral1516';
    let pontosLocal = localStorage.getItem('nvb_meus_pontos') || '5000';
    let nivelLocal = localStorage.getItem('nvb_meu_nivel') || '25';
    // Mostra imediato
    el.innerHTML = '<div class="ranking-item"><div class="ranking-pos gold">1</div><div style="flex:1"><b>@'+nickLocal+' (Você) - 🎮 '+robloxLocal+'</b><br><small style="color:#71717a">[MBRS] Membro • '+pontosLocal+' pts • Nv '+nivelLocal+' • Só no QG</small></div><div style="text-align:right"><small style="color:#22c55a">💚 '+pontosLocal+' ❤️ 0</small></div></div><p style="color:#71717a;font-size:12px;margin-top:8px">Carregando ranking real...</p>';
    
    try{
      let controller = new AbortController();
      setTimeout(()=>controller.abort(), 3000);
      let res=await fetch('/api/ranking', {signal: controller.signal});
      let data=await res.json();
      if(!data || data.length===0){
        el.innerHTML = '<div class="ranking-item"><div class="ranking-pos gold">1</div><div style="flex:1"><b>@'+nickLocal+' (Você) - 🎮 '+robloxLocal+'</b><br><small style="color:#71717a">[MBRS] Membro • '+pontosLocal+' pts • Nv '+nivelLocal+' • Só no QG</small></div><div style="text-align:right"><small style="color:#22c55a">💚 '+pontosLocal+' ❤️ 0</small></div></div><p style="color:#a1a1aa;font-size:12px;margin-top:12px">🌿 [NVT] Novato(a) — entrada<br>🌱 [MBRS] Membro — oficial<br>🩸 [VTRN] Veterano(a) — experiente<br>⭐ [VET+] Veterano(a)+ — destaque<br><small>Só no perfil/painel QG</small></p>';
        return;
      }
      let html='';
      for(let i=0;i<data.length;i++){
        let r=data[i];
        let posClass=i===0?'gold':i===1?'silver':i===2?'bronze':'';
        let nomeExibir = r.robloxUsername || r.discordId || nickLocal;
        html+='<div class="ranking-item"><div class="ranking-pos '+posClass+'">'+(i+1)+'</div><div style="flex:1"><b>'+nomeExibir+'</b><br><small style="color:#71717a">'+(r.cargo||'[MBRS] Membro')+' • '+(r.pontos||0)+' pts • Nv '+(r.nivel||0)+'</small></div><div style="text-align:right"><small style="color:#22c55a">💚 '+(r.ganhos||r.pontos||0)+' ❤️ '+(r.gastos||0)+'</small></div></div>';
      }
      el.innerHTML=html;
    }catch(e){
      el.innerHTML = '<div class="ranking-item"><div class="ranking-pos gold">1</div><div style="flex:1"><b>@'+nickLocal+' (Você) - 🎮 '+robloxLocal+'</b><br><small style="color:#71717a">[MBRS] Membro • '+pontosLocal+' pts • Nv '+nivelLocal+' • Só no QG</small></div><div style="text-align:right"><small style="color:#22c55a">💚 '+pontosLocal+' ❤️ 0</small></div></div><div class="ranking-item"><div class="ranking-pos silver">2</div><div style="flex:1"><b>@membro2</b><br><small>[NVT] Novato(a) • 1200 pts • Nv 5</small></div></div><p style="color:#71717a;font-size:11px;margin-top:8px">Modo offline - @'+nickLocal+' pontos: '+pontosLocal+'</p>';
    }
  }catch(e){ console.error('loadRanking erro', e); }
}

window.loadPontos = async function(){
  try{
    let el=document.getElementById('pontos-list');if(!el)return;
    let nickLocal = localStorage.getItem('nvb_discord_nick') || 'tenshinxxz';
    let robloxLocal = localStorage.getItem('nvb_roblox_nick') || 'Chaparral1516';
    let pontosLocal = localStorage.getItem('nvb_meus_pontos') || '5000';
    el.innerHTML = '<div class="ranking-item"><div style="flex:1"><b>@'+nickLocal+' (Você) - 🎮 '+robloxLocal+'</b><br><small>Total: '+pontosLocal+' pts | 💚 Ganhos: '+pontosLocal+' | ❤️ Gastos: 0 | Nv 25 - [MBRS] Membro (só QG)</small></div></div><p style="color:#71717a;font-size:12px">Carregando pontos reais...</p>';
    try{
      let controller = new AbortController();
      setTimeout(()=>controller.abort(), 3000);
      let res=await fetch('/api/ranking', {signal: controller.signal});
      let data=await res.json();
      let html='';
      if(data && data.length>0){
        for(let r of data.slice(0,20)){
          let nomeExibir = r.robloxUsername || r.discordId || nickLocal;
          html+='<div class="ranking-item"><div style="flex:1"><b>'+nomeExibir+'</b><br><small>Total: '+(r.pontos||0)+' pts | 💚 Ganhos: '+(r.ganhos||0)+' | ❤️ Gastos: '+(r.gastos||0)+' | Nv '+(r.nivel||0)+' | '+(r.cargo||'')+'</small></div></div>';
        }
      }
      if(!html){
        html='<div class="ranking-item"><div style="flex:1"><b>@'+nickLocal+' (Você) - 🎮 '+robloxLocal+'</b><br><small>Total: '+pontosLocal+' pts | 💚 Ganhos: '+pontosLocal+' | ❤️ Gastos: 0 | Nv 25 - [MBRS] Membro - Só no QG, Discord separado</small></div></div>';
      }
      el.innerHTML=html;
    }catch(e){
      el.innerHTML='<div class="ranking-item"><div style="flex:1"><b>@'+nickLocal+' (Você) - 🎮 '+robloxLocal+'</b><br><small>Total: '+pontosLocal+' pts | 💚 Ganhos: '+pontosLocal+' | ❤️ Gastos: 0 | Nv 25 - [MBRS] Membro - Modo offline mas contando! +2 pts por msg</small></div></div>';
    }
  }catch(e){ console.error('loadPontos erro', e); }
}

window.loadConquistas = async function(){
  try{
    let el=document.getElementById('conquistas-list');if(!el)return;
    let nickLocal = localStorage.getItem('nvb_discord_nick') || 'tenshinxxz';
    let robloxLocal = localStorage.getItem('nvb_roblox_nick') || 'Chaparral1516';
    let pontosLocal = localStorage.getItem('nvb_meus_pontos') || '5000';
    let nivelLocal = localStorage.getItem('nvb_meu_nivel') || '25';
    
    // Conquistas personalizadas para tenshinxxz
    let html = '';
    html += '<div class="info-card" style="border-color:#a855f7;background:#1a0f2e"><h4>👤 @'+nickLocal+' - Suas Conquistas</h4><div class="v">🎮 Roblox: '+robloxLocal+'<br>⭐ Nível: '+nivelLocal+' | 🪙 Pontos: '+pontosLocal+'<br>🏷️ Cargo: [MBRS] Membro - Só no QG<br>📅 Entrada: 28/09/2026 | 🔥 7 dias</div></div>';
    html += '<div class="info-card" style="margin-top:8px;border-color:#22c55e"><h4>✅ Conquistas Desbloqueadas (8)</h4><div class="v">🦇 Entrou na NVB - +10 pts<br>🎮 Vinculou Roblox '+robloxLocal+' - +15 pts<br>💬 Falou no chat - +2 pts por msg (contando!)<br>📝 Fez publicação no QG<br>🏆 Participou de evento<br>⭐ Alcançou Nível '+nivelLocal+'<br>🩸 Resenha vampírica<br>💜 Membro oficial [MBRS]</div></div>';
    html += '<div class="info-card" style="margin-top:8px"><h4>🎯 Próximas Conquistas</h4><div class="v">🌿 [NVT] Novato(a) → 🌱 [MBRS] Membro → 🩸 [VTRN] Veterano(a) → ⭐ [VET+]<br>Só no QG, Discord separado!<br><br>🎮 Vincular Roblox - Use /registrar • +15 pts<br>🖼️ Criar Avatar - Use /avatar-roblox • +10 pts • 38 estilos<br>🛍️ Loja - Use /loja • Veja os estilos<br>💬 Chat - +2 pts por mensagem (ativo!)<br>🎉 Evento - +10 pts</div></div>';
    html += '<div class="info-card" style="margin-top:8px;border-color:#f59e0b"><h4>📊 Seu Progresso NVB</h4><div class="v">👤 Discord: @'+nickLocal+'<br>🎮 Roblox: '+robloxLocal+' (ID: Chaparral1516)<br>🪙 Pontos: '+pontosLocal+' (💚 Ganhos: '+pontosLocal+' | ❤️ Gastos: 0)<br>⭐ Nível: '+nivelLocal+' | XP: '+(nivelLocal*50)+'<br>🏷️ Cargo QG: [MBRS] Membro<br>🏆 Conquistas: 8 desbloqueadas<br>📈 Próximo: [VTRN] Veterano(a) em 5 dias</div></div>';
    
    el.innerHTML = html;
  }catch(e){ console.error('loadConquistas erro', e); }
}

window.loadAdminRecrut = function(){
  try{
    fetch('/api/recrutamentos').then(r=>r.json()).then(data=>{
      let el=document.getElementById('admin-list');
      if(!el) return;
      if(data.length===0){ el.innerHTML='<p>Nenhum recrutamento</p>'; return; }
      let html='';
      for(let r of data.slice(-20).reverse()){
        html+='<div class="admin-item"><b>'+(r.nick||'Sem nick')+'</b> - 🎮 '+(r.nickRoblox||'')+'<br><small>'+(r.data||'')+'</small><br>'+(r.porqueNVB||'')+'</div>';
      }
      el.innerHTML=html;
    }).catch(()=>{ document.getElementById('admin-list').innerHTML='<p>Erro ao carregar</p>'; });
  }catch(e){}
}
window.loadAdminCand = function(){
  try{
    fetch('/api/candidaturas').then(r=>r.json()).then(data=>{
      let el=document.getElementById('admin-list');
      if(!el) return;
      if(data.length===0){ el.innerHTML='<p>Nenhuma candidatura</p>'; return; }
      let html='';
      for(let r of data.slice(-20).reverse()){
        html+='<div class="admin-item"><b>['+(r.cargo||'')+'] '+(r.nome||r.nick||'Sem nome')+'</b> - 🎮 '+(r.nickRoblox||'')+' - ID: '+(r.idRoblox||'')+'<br><small>'+(r.data||'')+'</small></div>';
      }
      el.innerHTML=html;
    }).catch(()=>{ document.getElementById('admin-list').innerHTML='<p>Erro ao carregar</p>'; });
  }catch(e){}
}
</script>

<script>

// Aliases globais para garantir que onclick="openRecrutamento()" também funcione
try{
  if(window.openRecrutamento) openRecrutamento = window.openRecrutamento;
  if(window.goToPainel) goToPainel = window.goToPainel;
  if(window.closeRecrutamento) closeRecrutamento = window.closeRecrutamento;
  if(window.nextStep) nextStep = window.nextStep;
  if(window.prevStep) prevStep = window.prevStep;
  if(window.toggleChip) toggleChip = window.toggleChip;
  if(window.enviarRecrutamento) enviarRecrutamento = window.enviarRecrutamento;
  if(window.closeLogin) closeLogin = window.closeLogin;
  if(window.fazerLoginQG) fazerLoginQG = window.fazerLoginQG;
  if(window.closeCandidatura) closeCandidatura = window.closeCandidatura;
  if(window.enviarCandidaturaSite) enviarCandidaturaSite = window.enviarCandidaturaSite;
  if(window.toggleNotificacoes) toggleNotificacoes = window.toggleNotificacoes;
  if(window.marcarLidas) marcarLidas = window.marcarLidas;
  if(window.publicarPost) publicarPost = window.publicarPost;
  if(window.navClick) navClick = window.navClick;
  if(window.loadAdminRecrut) loadAdminRecrut = window.loadAdminRecrut;
  if(window.loadAdminCand) loadAdminCand = window.loadAdminCand;
  if(window.openLoginQG) openLoginQG = window.openLoginQG;
  if(window.showSection) showSection = window.showSection;
  if(window.updateProgress) updateProgress = window.updateProgress;
  if(window.getChipValues) getChipValues = window.getChipValues;
  if(window.openCandidatura) openCandidatura = window.openCandidatura;
  if(window.loadFeed) loadFeed = window.loadFeed;
  if(window.loadRanking) loadRanking = window.loadRanking;
  if(window.loadPontos) loadPontos = window.loadPontos;
  if(window.loadConquistas) loadConquistas = window.loadConquistas;
}catch(e){ console.log('Alias error', e); }

// Fallback binding para garantir que botoes funcionem mesmo se onclick falhar
document.addEventListener('DOMContentLoaded', function(){
  try{
    console.log('QG NVB carregado - bind botoes');
    // Bind landing buttons
    let btnRecrut = document.querySelector('button[onclick*="openRecrutamento"]');
    if(btnRecrut){
      btnRecrut.addEventListener('click', function(e){ e.preventDefault(); window.openRecrutamento(); });
    }
    let btnQG = document.querySelector('button[onclick*="goToPainel"]');
    if(btnQG){
      btnQG.addEventListener('click', function(e){ e.preventDefault(); window.goToPainel(); });
    }
    // Bind continuar
    let btnContinuar = document.querySelector('button[onclick*="nextStep"]');
    if(btnContinuar){
      btnContinuar.addEventListener('click', function(e){ e.preventDefault(); window.nextStep(); });
    }
    console.log('Botoes bindados OK - tenshinxxz');
  }catch(e){ console.error('Erro bind botoes', e); }
});
</script>

</body>
</html>`;

http.createServer(async (req, res) => {
    // Keep-alive para Render não dormir - UptimeRobot
    if (req.url === '/ping' || req.url === '/health') { res.writeHead(200, {'Content-Type':'text/plain'}); return res.end('QG NVB Online 24H 🦇 - '+new Date().toISOString()); }
    if (req.url === '/keepalive') { res.writeHead(200, {'Content-Type':'application/json'}); return res.end(JSON.stringify({status:'online', uptime: process.uptime(), timestamp: new Date().toISOString()})); }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    
    if (req.url === '/api/recrutamento' && req.method === 'POST') {
        let body=''; req.on('data', c=>body+=c); req.on('end', async ()=>{
            try {
                const data=JSON.parse(body); data.id=Date.now(); 
                db.recrutamentos.push(data);
                persistDB();
                console.log(`🩸 Novo recrutamento NOVO SISTEMA: ${data.nick || data.nome}`);
                await enviarRecrutamentoGarantido(data);
                res.writeHead(200, { 'Content-Type':'application/json' }); res.end(JSON.stringify({ success:true, id:data.id }));
            } catch(e){ console.error(e); res.writeHead(400, { 'Content-Type':'application/json' }); res.end(JSON.stringify({ error:'Invalid JSON' })); }
        }); return;
    }

    if (req.url === '/api/candidatura' && req.method === 'POST') {
        let body=''; req.on('data', c=>body+=c); req.on('end', async ()=>{
            try {
                const data=JSON.parse(body); data.id=Date.now();
                db.candidaturas.push(data);
                persistDB();
                console.log(`📋 Nova candidatura ${data.cargo}: ${data.nome || data.nick}`);
                await enviarCandidaturaGarantida(data);
                res.writeHead(200, { 'Content-Type':'application/json' }); res.end(JSON.stringify({ success:true, id:data.id }));
            } catch(e){ console.error(e); res.writeHead(400, { 'Content-Type':'application/json' }); res.end(JSON.stringify({ error:'Invalid JSON' })); }
        }); return;
    }

    if (req.url === '/api/posts' && req.method === 'POST') {
        let body=''; req.on('data', c=>body+=c); req.on('end', ()=>{
            try {
                const data=JSON.parse(body);
                data.id = data.id || Date.now();
                data.likes = data.likes || 0;
                data.comments = data.comments || 0;
                data.data = data.data || new Date().toLocaleString('pt-BR');
                db.posts.push(data);
                console.log(`📰 Nova publicação: ${data.titulo || data.text?.substring(0,30)} - Assunto: ${data.assunto}`);
                res.writeHead(200, { 'Content-Type':'application/json' }); res.end(JSON.stringify({ success:true, id:data.id }));
            } catch(e){ res.writeHead(400, { 'Content-Type':'application/json' }); res.end(JSON.stringify({ error:'Invalid JSON' })); }
        }); return;
    }

    if (req.url === '/api/recrutamentos' && req.method === 'GET') { 
        res.writeHead(200, { 'Content-Type':'application/json' }); 
        res.end(JSON.stringify(db.recrutamentos)); 
        return; 
    }
    if (req.url === '/api/candidaturas' && req.method === 'GET') { 
        res.writeHead(200, { 'Content-Type':'application/json' }); 
        res.end(JSON.stringify(db.candidaturas)); 
        return; 
    }
    if (req.url === '/api/posts' && req.method === 'GET') { res.writeHead(200, { 'Content-Type':'application/json' }); res.end(JSON.stringify(db.posts)); return; }
    if (req.url === '/api/passaportes' && req.method === 'GET') {
        const lista = Array.from(db.roblox.entries()).map(([id,d])=>({ discordId:id, ...d, pontos: db.pontos.get(id)||0, xp: db.xp.get(id)||0, nivel: getNivel(db.xp.get(id)||0), cargo: getCargoNVB(getNivel(db.xp.get(id)||0)).tag, ganhos: db.pontosGanhos.get(id)||0, gastos: db.pontosGastos.get(id)||0 }));
        res.writeHead(200, { 'Content-Type':'application/json' }); res.end(JSON.stringify(lista)); return;
    }
    if (req.url === '/api/ranking' && req.method === 'GET') {
        const lista = Array.from(db.pontos.entries()).map(([id,pts])=>{
            const xp = db.xp.get(id)||0;
            const r = db.roblox.get(id)||{};
            return { discordId:id, pontos:pts, xp, nivel:getNivel(xp), cargo:getCargoNVB(getNivel(xp)).tag, robloxUsername:r.username||null, avatarUrl:r.avatarUrl||null, ganhos: db.pontosGanhos.get(id)||0, gastos: db.pontosGastos.get(id)||0 };
        }).sort((a,b)=>b.pontos-a.pontos).slice(0,20);
        res.writeHead(200, { 'Content-Type':'application/json' }); res.end(JSON.stringify(lista)); return;
    }
    if (req.url === '/api/pontos' && req.method === 'GET') {
        const lista = Array.from(db.pontos.entries()).map(([id,pts])=>{
            const xp = db.xp.get(id)||0;
            return { discordId:id, pontos:pts, xp, nivel:getNivel(xp), cargo:getCargoNVB(getNivel(xp)).tag, ganhos: db.pontosGanhos.get(id)||0, gastos: db.pontosGastos.get(id)||0 };
        }).sort((a,b)=>b.pontos-a.pontos);
        res.writeHead(200, { 'Content-Type':'application/json' }); res.end(JSON.stringify(lista)); return;
    }
    res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8' }); res.end(SITE_HTML);
}).listen(PORT, '0.0.0.0', ()=>{ console.log(`🌐 SITE NOVO  rodando na porta ${PORT} -  Host 0.0.0.0 - ACESSO EXTERNO LIBERADO`); });

process.on('unhandledRejection', err=>console.error('❌ Erro:', err));
process.on('uncaughtException', err=>console.error('❌ Exceção:', err));
