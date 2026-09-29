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

// ===== ESTILOS AVATAR - 38 ESTILOS (CORRIGE #10 - SEM LIMITE DE CHOICES) =====
const ESTILOS_AVATAR = {
    original: { nome: "🎮 Original Roblox", custo: 0, desc: "manter o avatar praticamente igual", prompt: "original roblox", cor: 0x71717a },
    dark: { nome: "🖤 Dark", custo: 10, desc: "visual sombrio com fundo escuro e névoa", prompt: "dark aesthetic, dark foggy background, gothic castle", cor: 0x1f1f1f },
    anime: { nome: "🎌 Anime", custo: 25, desc: "transformar o avatar em arte estilo anime", prompt: "anime art style, vibrant colors, anime background", cor: 0xec4899 },
    cinematografico: { nome: "🎬 Cinematográfico", custo: 50, desc: "iluminação dramática, fundo detalhado e aparência de pôster", prompt: "cinematic lighting, movie poster background", cor: 0xf59e0b },
    vampirico_nvb: { nome: "🩸 Vampírico NVB", custo: 25, desc: "estética da linhagem, morcegos, castelo e tons roxo/azul/verde", prompt: "vampiric aesthetic purple castle bats, NVB style", cor: 0xa855f7 },
    neon: { nome: "💜 Neon", custo: 25, desc: "luzes neon e estética futurista", prompt: "neon lights futuristic city background", cor: 0xa855f7 },
    cyberpunk: { nome: "🧬 Cyberpunk", custo: 50, desc: "cidade futurista, hologramas e tecnologia", prompt: "cyberpunk city holograms technology", cor: 0x06b6d4 },
    gotico: { nome: "🥀 Gótico", custo: 25, desc: "castelo, rosas, sombras e estética gótica", prompt: "gothic castle roses shadows dark", cor: 0x7f1d1d },
    noite_vampirica: { nome: "🦇 Noite Vampírica", custo: 25, desc: "céu noturno, morcegos e lua cheia", prompt: "vampiric night sky bats full moon", cor: 0x581c87 },
    action: { nome: "⚡ Action", custo: 10, desc: "pose dinâmica", prompt: "dynamic action pose explosion background", cor: 0xf59e0b },
    premium: { nome: "👑 Premium", custo: 50, desc: "aparência de banner/perfil", prompt: "premium banner profile golden", cor: 0xfbbf24 },
    fantasia: { nome: "🌌 Fantasia", custo: 25, desc: "cenário mágico e atmosfera sobrenatural", prompt: "fantasy magical forest", cor: 0x8b5cf6 },
    elemental: { nome: "🔥 Elemental", custo: 25, desc: "fogo, gelo, eletricidade, vento", prompt: "elemental fire ice lightning", cor: 0xef4444 },
    noir: { nome: "🌑 Noir", custo: 10, desc: "preto e branco, sombras fortes", prompt: "noir black white strong shadows", cor: 0x000000 },
    anjo: { nome: "🪽 Anjo", custo: 25, desc: "asas, luz celestial e atmosfera elegante", prompt: "angel wings celestial light heaven", cor: 0xf8fafc },
    demoniaco: { nome: "😈 Demoníaco", custo: 25, desc: "aura sombria, chifres e energia sobrenatural", prompt: "demonic aura horns hell", cor: 0x7f1d1d },
    vampiro_classico: { nome: "🧛 Vampiro Clássico", custo: 25, desc: "visual tradicional de vampiro", prompt: "classic vampire dracula castle", cor: 0x991b1b },
    cidade_noturna: { nome: "🌃 Cidade Noturna", custo: 25, desc: "cidade iluminada, chuva e luzes urbanas", prompt: "night city rain urban lights", cor: 0x1e3a8a },
    chuva: { nome: "🌧️ Chuva", custo: 10, desc: "cenário chuvoso e atmosfera dramática", prompt: "rainy dramatic atmosphere", cor: 0x334155 },
    gelo: { nome: "❄️ Gelo", custo: 10, desc: "neve, cristais e efeitos congelantes", prompt: "ice snow crystals frozen", cor: 0x0ea5e9 },
    infernal: { nome: "🌋 Infernal", custo: 25, desc: "lava, fumaça e ambiente intenso", prompt: "infernal lava smoke intense", cor: 0xdc2626 },
    floresta_sombria: { nome: "🌲 Floresta Sombria", custo: 25, desc: "floresta noturna, neblina e lua", prompt: "dark forest night fog moon", cor: 0x14532d },
    lua_cheia: { nome: "🌕 Lua Cheia", custo: 10, desc: "lua gigante, névoa e iluminação lunar", prompt: "full moon giant fog lunar light", cor: 0xfde047 },
    streetwear: { nome: "🕶️ Streetwear", custo: 10, desc: "estética urbana e moderna", prompt: "streetwear urban modern", cor: 0x52525b },
    music: { nome: "🎧 Music", custo: 25, desc: "visual inspirado em capa de álbum", prompt: "music album cover aesthetic", cor: 0xec4899 },
    photoshoot: { nome: "📸 Photoshoot", custo: 25, desc: "ensaio fotográfico profissional", prompt: "professional photoshoot studio", cor: 0xf472b6 },
    poster: { nome: "🎞️ Poster", custo: 50, desc: "composição de pôster de filme/anime", prompt: "movie anime poster composition", cor: 0xf59e0b },
    fantasy_glow: { nome: "✨ Fantasy Glow", custo: 25, desc: "brilho mágico e partículas", prompt: "fantasy glow magical particles", cor: 0xa855f7 },
    luxury: { nome: "💎 Luxury", custo: 50, desc: "aparência sofisticada, dourada e elegante", prompt: "luxury sophisticated golden elegant", cor: 0xfbbf24 },
    cosmic: { nome: "🪐 Cosmic", custo: 50, desc: "espaço, estrelas e energia cósmica", prompt: "cosmic space stars energy", cor: 0x7c3aed },
    horror: { nome: "👻 Horror", custo: 25, desc: "terror, névoa e atmosfera assustadora", prompt: "horror terror fog scary", cor: 0x1f1f1f },
    glitch: { nome: "🌀 Glitch", custo: 25, desc: "distorções digitais e efeitos de glitch", prompt: "glitch digital distortion", cor: 0x06b6d4 },
    warrior: { nome: "🗡️ Warrior", custo: 25, desc: "guerreiro em cenário épico", prompt: "warrior epic scenario battlefield", cor: 0x991b1b },
    champion: { nome: "🏆 Champion", custo: 50, desc: "pose de campeão com iluminação de vitória", prompt: "champion victory lighting pose trophy", cor: 0xf59e0b },
    mystery: { nome: "🎭 Mystery", custo: 10, desc: "personagem parcialmente oculto por sombras", prompt: "mystery hidden shadows", cor: 0x1f1f1f },
    sunset: { nome: "🌅 Sunset", custo: 10, desc: "pôr do sol e iluminação quente", prompt: "sunset warm lighting", cor: 0xfb923c },
    galaxy: { nome: "🌌 Galaxy", custo: 50, desc: "nebulosas, estrelas e fundo espacial", prompt: "galaxy nebula stars space background", cor: 0x581c87 },
    mystic: { nome: "🧿 Mystic", custo: 25, desc: "símbolos, energia e atmosfera sobrenatural", prompt: "mystic symbols energy supernatural", cor: 0x7c3aed }
};

// ===== FICHAS POR CARGO (FINAL V3 - COM FUNÇÃO ESPECÍFICA NO COMEÇO + COMPROMISSO + RESULTADO) =====
const FUNCOES_ESPECIFICAS = {
    ADM: "organização, decisões, liderança e administração geral",
    CMDT: "liderança da equipe e coordenação das atividades",
    MOD: "regras, conflitos, punições e segurança",
    SUP: "atendimento, dúvidas e auxílio aos membros",
    ORG: "eventos, atividades e organização da comunidade",
    REC: "recrutamento, abordagem e avaliação de novos membros",
    INF: "divulgação, conteúdo e representação da NVB"
};

const PERGUNTAS_EXCLUSIVAS = {
    ADM: "Como você organizaria a administração geral da NVB e tomaria decisões importantes para a família?",
    CMDT: "Como você lideraria a equipe NVB e coordenaria as atividades diárias da família?",
    MOD: "Como você garantiria o cumprimento das regras e a segurança da comunidade NVB?",
    SUP: "Como você atenderia e auxiliaria os membros da NVB com suas dúvidas e problemas?",
    ORG: "Que tipo de eventos e atividades você organizaria para manter a comunidade NVB ativa e unida?",
    REC: "Como você abordaria e avaliaria novos candidatos para garantir que entrem pessoas que combinam com a família NVB?",
    INF: "Como você divulgaria e representaria a NVB nas redes sociais para atrair novas membros?"
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
        perguntas: [
            { id: "nome", label: "Nome:", tipo: "texto", obrigatorio: true },
            { id: "idade", label: "Idade:", tipo: "numero", obrigatorio: true },
            { id: "nickRoblox", label: "Nick Roblox:", tipo: "texto", obrigatorio: true },
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
        perguntas: [
            { id: "nome", label: "Nome:", tipo: "texto", obrigatorio: true },
            { id: "idade", label: "Idade:", tipo: "numero", obrigatorio: true },
            { id: "nickRoblox", label: "Nick Roblox:", tipo: "texto", obrigatorio: true },
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
        perguntas: [
            { id: "nome", label: "Nome:", tipo: "texto", obrigatorio: true },
            { id: "idade", label: "Idade:", tipo: "numero", obrigatorio: true },
            { id: "nickRoblox", label: "Nick Roblox:", tipo: "texto", obrigatorio: true },
            { id: "discord", label: "Usuário Discord:", tipo: "texto", obrigatorio: true },
            { id: "tempoNVB", label: "Tempo na NVB:", tipo: "texto", obrigatorio: true },
            { id: "expAtendimento", label: "Experiência com atendimento:", tipo: "texto", obrigatorio: true },
            { id: "porque", label: "Por que deseja ser Suporte?", tipo: "textarea", obrigatorio: true },
            { id: "ajudarDuvidas", label: "Como ajudaria um membro com dúvid
