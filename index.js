require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const {
  Client, GatewayIntentBits, Partials, REST, Routes,
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || '';
const PORT = Number(process.env.PORT || 10000);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CLOUDFLARE_IMAGE_MODEL = process.env.CLOUDFLARE_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell';
const MAIN_INVITE = process.env.MAIN_DISCORD_INVITE || 'https://discord.gg/bdxXc8p5t';
const RECRUIT_INVITE = process.env.RECRUIT_DISCORD_INVITE || 'https://discord.gg/X3eDn2wye';
const WELCOME_BG = path.join(__dirname, 'assets', 'nvb-welcome-bg.png');

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ DISCORD_TOKEN e CLIENT_ID são obrigatórios no Render.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
});

// =========================
// BANCO JSON
// =========================
const DB_DIR = path.join(__dirname, 'database');
const SKIN_DIR = path.join(DB_DIR, 'skin_images');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
if (!fs.existsSync(SKIN_DIR)) fs.mkdirSync(SKIN_DIR, { recursive: true });

function readJson(file, fallback) {
  try {
    const p = path.join(DB_DIR, file);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback;
  } catch (e) {
    console.error(`Erro lendo ${file}:`, e.message);
    return fallback;
  }
}
function writeJson(file, value) {
  try { fs.writeFileSync(path.join(DB_DIR, file), JSON.stringify(value, null, 2)); }
  catch (e) { console.error(`Erro salvando ${file}:`, e.message); }
}

const db = {
  pontos: readJson('pontos.json', {}),
  xp: readJson('xp.json', {}),
  roblox: readJson('roblox.json', {}),
  conquistas: readJson('conquistas.json', {}),
  skins: readJson('skins.json', {}),
  candidaturas: readJson('candidaturas.json', []),
  recrutamentos: readJson('recrutamentos.json', []),
  avisos: readJson('avisos.json', {}),
  config: readJson('config.json', {}),
  logs: readJson('logs.json', []),
  presenca: readJson('presenca.json', {}),
  recompensas: readJson('recompensas.json', []),
  historico: readJson('historico.json', {}),
  codes: readJson('codes.json', {}),
  chamadas: readJson('chamadas.json', {})
};

function writeDb(name) { writeJson(`${name}.json`, db[name]); }
function logAction(type, userId, details = {}) {
  db.logs.push({ type, userId, details, at: new Date().toISOString() });
  if (db.logs.length > 1000) db.logs.shift();
  writeDb('logs');
}
function addPoints(id, amount, reason = '') {
  db.pontos[id] = Math.max(0, Number(db.pontos[id] || 0) + Number(amount));
  db.xp[id] = Math.max(0, Number(db.xp[id] || 0) + Math.max(0, Number(amount)));
  writeDb('pontos'); writeDb('xp');
  logAction('pontos', id, { amount, reason });
  return db.pontos[id];
}
function removePoints(id, amount, reason = '') {
  const current = Number(db.pontos[id] || 0);
  if (current < Number(amount)) return false;
  db.pontos[id] = current - Number(amount);
  writeDb('pontos');
  logAction('pontos_remove', id, { amount, reason });
  return true;
}
function level(xp) { return Math.max(1, Math.floor(Number(xp || 0) / 100) + 1); }
function normalizeQG(v) { return String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' '); }

// =========================
// ROLES / PERMISSÕES
// =========================
const roleIds = {
  LDR: process.env.ROLE_LDR || '', 'SB-LDR': process.env.ROLE_SB_LDR || '', ADM: process.env.ROLE_ADM || '',
  CMDT: process.env.ROLE_CMDT || '', MOD: process.env.ROLE_MOD || '', SUP: process.env.ROLE_SUP || '',
  ORG: process.env.ROLE_ORG || '', REC: process.env.ROLE_REC || '', INF: process.env.ROLE_INF || '',
  EDT: process.env.ROLE_EDT || '', BSTR: process.env.ROLE_BSTR || '', PCR: process.env.ROLE_PCR || '',
  MBRS: process.env.ROLE_MBRS || '', NVT: process.env.ROLE_NVT || '', TRN_STAFF: process.env.ROLE_TRN_STAFF || ''
};
const roleNames = {
  ADM: '[ADM] ADMINISTRADOR', CMDT: '[CMDT] COMANDANTE', MOD: '[MOD] MODERADOR', SUP: '[SUP] SUPORTE',
  ORG: '[ORG] ORGANIZADOR', REC: '[REC] RECRUTADOR', INF: '[INF] INFLUENCIADOR', EDT: '[EDT] EDITOR',
  LDR: '[LDR] Alfa', 'SB-LDR': '[SB-LDR] Beta', BSTR: '[BSTR] Booster', PCR: '[PCR] Parceiro',
  MBRS: '[MBRS] Membro', NVT: '[NVT] Novato'
};
const allowed = {
  recrutamento: ['REC','SUP','MOD','CMDT','ADM','SB-LDR','LDR'],
  candidaturas: ['REC','MOD','CMDT','ADM','SB-LDR','LDR'], aprovar: ['REC','CMDT','ADM','SB-LDR','LDR'],
  recusar: ['REC','CMDT','ADM','SB-LDR','LDR'], moderacao: ['MOD','CMDT','ADM','SB-LDR','LDR'],
  expulsar: ['CMDT','ADM','SB-LDR','LDR'], banir: ['ADM','SB-LDR','LDR'], admin: ['ADM','SB-LDR','LDR'],
  comunidade: ['ORG','CMDT','ADM'], chamada: ['ORG','REC','CMDT','ADM'], pontosAdd: ['ORG','REC','CMDT','ADM'],
  pontosRemove: ['CMDT','ADM','SB-LDR','LDR'], recompensa: ['ADM','CMDT','SB-LDR','LDR'], conquista: ['ORG','CMDT','ADM'],
  automacao: ['ADM','SB-LDR','LDR']
};
function hasRole(member, names) { return names.some(n => roleIds[n] && member?.roles?.cache?.has(roleIds[n])); }
function can(i, group) { return i.memberPermissions?.has(PermissionFlagsBits.Administrator) || hasRole(i.member, allowed[group] || []); }
async function guard(i, group) {
  if (can(i, group)) return true;
  await safeReply(i, { content: '❌ Você não possui o cargo necessário para usar este comando.', ephemeral: true });
  return false;
}
async function safeReply(i, payload) {
  try {
    if (i.replied) return await i.followUp(payload);
    if (i.deferred) return await i.editReply(payload);
    return await i.reply(payload);
  } catch (e) {
    if (e?.code === 10062 || e?.code === 10015) { console.warn(`⚠️ Interação expirada: /${i.commandName || i.customId}`); return null; }
    throw e;
  }
}
async function safeDefer(i, options = {}) {
  try { if (!i.replied && !i.deferred) await i.deferReply(options); return true; }
  catch (e) { if (e?.code === 10062) return false; throw e; }
}
function optionUser(name='usuario', description='Membro do servidor', required=true) {
  return o => o.setName(name).setDescription(description).setRequired(required);
}

// =========================
// 38 ESTILOS OFICIAIS
// =========================
const STYLE_LIST = [
  ['Original',0],['Dark',10],['Dark Neon',15],['Dark Roxo',10],['Vampírico NVB',25],['Anime',25],['Gótico',15],['Cinemático',20],
  ['Neon Dark',15],['Neon Rosa Choque',15],['Neon Azul Elétrico',15],['Neon Roxo NVB',15],['Cyberpunk',25],['Noite Vampírica',20],
  ['Anjo Dark',20],['Flamejante',15],['Gelado',15],['Natureza',10],['Sombrio',15],['Luz',15],['Inferno',20],['Céu',15],
  ['Espaço',20],['Deserto',15],['Cidade',15],['Mar',15],['Floresta Sombria',20],['Vulcão',20],['Arco-Íris',15],['Preto e Branco',10],
  ['Metálico',20],['Pixel',15],['Samurai',20],['Caçador',15],['Palhaço Sombrio',15],['Halloween',15],['Natal',15],['Escondido',25]
];
const STYLE_NAMES = STYLE_LIST.map(x => x[0]);
function styleChoices() { return STYLE_LIST.slice(0,25).map(([name])=>({name,value:name})); }
function stylePrompt(style) {
  const secondary = {
    Dark:'floresta sombria, árvores altas, neblina e lua entre os galhos', 'Dark Neon':'cidade gótica noturna com neon', 'Dark Roxo':'castelo escuro com névoa roxa',
    'Vampírico NVB':'castelo vampírico, morcegos e lua cheia', Anime:'cidade noturna com iluminação de anime', Gótico:'catedral gótica e neblina', Cinemático:'castelo cinematográfico com luz volumétrica',
    'Neon Dark':'becos escuros com neon', 'Neon Rosa Choque':'cidade noturna com neon rosa', 'Neon Azul Elétrico':'cidade noturna com neon azul', 'Neon Roxo NVB':'castelo futurista roxo',
    Cyberpunk:'cidade cyberpunk chuvosa', 'Noite Vampírica':'noite de lua cheia e morcegos', 'Anjo Dark':'céu escuro com asas e ruínas', Flamejante:'ruínas com fogo', Gelado:'palácio de gelo', Natureza:'floresta viva', Sombrio:'floresta quase sem luz', Luz:'santuário luminoso', Inferno:'paisagem infernal', Céu:'céu celestial', Espaço:'espaço profundo', Deserto:'deserto ao entardecer', Cidade:'cidade moderna', Mar:'oceano noturno', 'Floresta Sombria':'floresta densa com neblina', Vulcão:'vulcão em erupção', 'Arco-Íris':'céu colorido', 'Preto e Branco':'cenário monocromático', Metálico:'cidade industrial', Pixel:'mundo pixelado', Samurai:'templo japonês', Caçador:'floresta de caça', 'Palhaço Sombrio':'circo abandonado', Halloween:'cidade de Halloween', Natal:'cidade natalina', Escondido:'ruínas secretas'
  };
  return `estilo ${style}; cenário secundário: ${secondary[style] || 'cenário dark elegante'}; estética NVB, morcegos discretos, azul/roxo/verde, corpo inteiro da cabeça aos pés, sem corte, sem texto.`;
}

// =========================
// ROBLOX / IA
// =========================
async function robloxUser(username) {
  const r = await fetch('https://users.roblox.com/v1/usernames/users', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({usernames:[username], excludeBannedUsers:false}) });
  if (!r.ok) throw new Error('Não foi possível consultar o Roblox.');
  const data = await r.json();
  const u = data.data?.[0];
  if (!u) throw new Error('Usuário Roblox não encontrado.');
  const t = await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${u.id}&size=720x720&format=Png&isCircular=false`);
  const tj = await t.json();
  return { id:u.id, username:u.name, displayName:u.displayName, avatarUrl:tj.data?.[0]?.imageUrl || '' };
}
async function cloudflareImage(prompt, steps=4) {
  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN não estão configurados no Render.');
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/${CLOUDFLARE_IMAGE_MODEL}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt, steps: Math.min(8, Math.max(1, Number(steps) || 4)) })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) {
    const msg = j.errors?.map?.(x => x.message || x.code).filter(Boolean).join('; ') || j.error?.message || `Falha no Cloudflare (${r.status}).`;
    throw new Error(msg);
  }
  const b64 = j.result?.image || j.image;
  if (!b64) throw new Error('O Cloudflare não retornou a imagem.');
  return Buffer.from(b64, 'base64');
}

async function openAIImage(prompt, inputBuffer=null) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY não está configurada no Render.');
  if (inputBuffer) {
    const form = new FormData();
    form.append('model', OPENAI_IMAGE_MODEL);
    form.append('prompt', prompt);
    form.append('size', '1024x1536');
    form.append('quality', 'high');
    form.append('image[]', new Blob([inputBuffer], {type:'image/png'}), 'avatar.png');
    const r = await fetch('https://api.openai.com/v1/images/edits', {method:'POST', headers:{Authorization:`Bearer ${OPENAI_API_KEY}`}, body:form});
    const j = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(j.error?.message || `Falha na IA (${r.status}).`);
    const b64=j.data?.[0]?.b64_json; if (!b64) throw new Error('A IA não retornou a imagem.');
    return Buffer.from(b64,'base64');
  }
  const r = await fetch('https://api.openai.com/v1/images/generations', {method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${OPENAI_API_KEY}`}, body:JSON.stringify({model:OPENAI_IMAGE_MODEL,prompt,size:'1024x1536',quality:'high'})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error?.message || `Falha na IA (${r.status}).`);
  const b64=j.data?.[0]?.b64_json; if(!b64) throw new Error('A IA não retornou a imagem.');
  return Buffer.from(b64,'base64');
}
async function fetchBuffer(url) { const r=await fetch(url); if(!r.ok) throw new Error('Não foi possível baixar a imagem.'); return Buffer.from(await r.arrayBuffer()); }
async function saveSkinImage(userId, name, buffer) { const safe=normalizeQG(name).replace(/[^a-z0-9_-]/g,'_').slice(0,60) || `skin_${Date.now()}`; const file=path.join(SKIN_DIR,`${userId}_${safe}_${Date.now()}.png`); await fs.promises.writeFile(file,buffer); return file; }

// =========================
// WELCOME CARD
// =========================
async function getMemberRoblox(member) {
  const stored=db.roblox[member.id];
  if(stored?.username) return stored;
  const rec=[...db.recrutamentos].reverse().find(x=>{if(!x.roblox)return false;const id=String(x.discordId||x.userId||'');if(id&&id===member.id)return true;const d=normalizeQG(x.discord||x.discordNick||x.nickDiscord||'').replace(/^@/,'');return d===normalizeQG(member.user.username)||d===normalizeQG(member.user.tag)||d===normalizeQG(member.displayName||'');});
  if(rec?.roblox) { const r=await robloxUser(String(rec.roblox).replace(/^@/,'' )).catch(()=>null); if(r){ db.roblox[member.id]=r; writeDb('roblox'); return r; } }
  return null;
}
async function makeWelcomeCard(member, roblox) {
  if(!fs.existsSync(WELCOME_BG)) return null;
  const name=roblox?.username || 'Roblox não vinculado';
  const display=roblox?.displayName && roblox.displayName!==name ? roblox.displayName : '';
  const date=new Date(); const dateText=date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
  const overlay=Buffer.from(`<svg width="1024" height="1536" xmlns="http://www.w3.org/2000/svg"><rect x="130" y="395" width="764" height="440" rx="38" fill="#05030d" fill-opacity="0.93" stroke="#9b5cff" stroke-width="6"/><text x="510" y="455" text-anchor="middle" fill="#d9c5ff" font-size="25" font-family="Arial" font-weight="bold">NOVO MEMBRO • NVB</text><text x="420" y="585" fill="#ffffff" font-size="43" font-family="Arial" font-weight="bold">${escapeXml(name.slice(0,22))}</text><text x="420" y="635" fill="#bfa8e8" font-size="25" font-family="Arial">${escapeXml(display.slice(0,25))}</text><text x="420" y="705" fill="#f4efff" font-size="31" font-family="Arial" font-weight="bold">BEM-VINDO(A) À NVB!</text><text x="420" y="755" fill="#b9a7d0" font-size="21" font-family="Arial">Nytheris Vampyre Bloodline</text><rect x="150" y="1245" width="724" height="95" rx="20" fill="#05030d" fill-opacity="0.9" stroke="#7c3aed" stroke-width="3"/><text x="512" y="1285" text-anchor="middle" fill="#bfa8e8" font-size="19" font-family="Arial">VOCÊ ENTROU EM NOSSA LINHAGEM EM</text><text x="512" y="1317" text-anchor="middle" fill="#ffffff" font-size="23" font-family="Arial" font-weight="bold">${escapeXml(dateText)}</text></svg>`);
  let base=sharp(WELCOME_BG).resize(1024,1536).composite([{input:overlay,left:0,top:0}]);
  const avatarUrl=roblox?.avatarUrl || member.user.displayAvatarURL({extension:'png',size:512});
  const avatar=await fetchBuffer(avatarUrl).catch(()=>null);
  if(avatar){
    const circle=Buffer.from(`<svg width="230" height="230" xmlns="http://www.w3.org/2000/svg"><circle cx="115" cy="115" r="112" fill="white"/></svg>`);
    const circleAvatar=await sharp(avatar).resize(220,220,{fit:'cover'}).composite([{input:circle,blend:'dest-in'}]).png().toBuffer();
    base=base.composite([{input:circleAvatar,left:175,top:495}]);
  }
  return base.png().toBuffer();
}
function escapeXml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}

// =========================
// CHAMADAS
// =========================
function callsChannelId(guild) { const configured=db.config.callsChannel || process.env.CALLS_CHANNEL_ID || ''; if(configured)return configured; const found=guild?.channels?.cache?.find(c=>c.isTextBased() && /chamada|chamadas/i.test(c.name||'')); return found?.id || ''; }
function activeCall(guildId) { const c=db.chamadas[guildId]; return c && c.status==='aberta' ? c : null; }
async function updateCallMessage(call) {
  if(!call?.channelId || !call.messageId) return;
  const ch=await client.channels.fetch(call.channelId).catch(()=>null); if(!ch?.isTextBased()) return;
  const msg=await ch.messages.fetch(call.messageId).catch(()=>null); if(!msg) return;
  const list=Object.values(call.presencas||{});
  const desc=list.length ? list.map((p,i)=>`${i+1}. <@${p.userId}> — ${p.resposta}`).join('\n') : 'Ainda não há presenças confirmadas.';
  const e=new EmbedBuilder().setColor(call.status==='aberta'?0x7c3aed:0x22c55e).setTitle(`📢 ${call.titulo}`).addFields(
    {name:'🎯 Tema',value:call.tema,inline:true},{name:'🕖 Horário',value:call.horario,inline:true},{name:'📝 Descrição',value:call.descricao},
    {name:`👥 Presenças (${list.length})`,value:desc.slice(0,1024)}
  ).setFooter({text:call.status==='aberta'?'Clique em Presença ou use /presenca.':'Chamada encerrada • lista final salva'});
  const row=call.status==='aberta'?new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`call_presence_${call.id}`).setLabel('🟢 Responder presença').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`call_close_${call.id}`).setLabel('🔒 Encerrar chamada').setStyle(ButtonStyle.Danger)):null;
  await msg.edit({embeds:[e],components:row?[row]:[]}).catch(()=>{});
}
function presenceModal(callId){ return new ModalBuilder().setCustomId(`presence_modal_${callId}`).setTitle('🟢 Responder chamada').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('resposta').setLabel('Resposta à chamada').setPlaceholder('Ex.: Estou presente e posso participar.').setStyle(TextInputStyle.Paragraph).setMaxLength(300).setRequired(true))); }
function jogatinaModal(){ return new ModalBuilder().setCustomId('jogatina_modal').setTitle('🎮 Nova Jogatina NVB').addComponents(
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(true)),
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tema').setLabel('Tema').setStyle(TextInputStyle.Short).setRequired(true)),
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(true)),
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('imagem').setLabel('Foto do jogo (URL)').setStyle(TextInputStyle.Short).setRequired(false))
 ); }
function resenhaModal(){ return new ModalBuilder().setCustomId('resenha_modal').setTitle('💬 Nova Resenha NVB').addComponents(
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(true)),
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tema').setLabel('Tema').setStyle(TextInputStyle.Short).setRequired(true)),
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(true))
 ); }
function chamadaModal(){ return new ModalBuilder().setCustomId('chamada_modal').setTitle('📢 Nova Chamada NVB').addComponents(
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(true)),
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tema').setLabel('Tema').setStyle(TextInputStyle.Short).setRequired(true)),
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(true)),
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('horario').setLabel('Horário (ex.: 19:00)').setStyle(TextInputStyle.Short).setRequired(true))
 ); }

// =========================
// COMANDOS ATUAIS
// =========================
const commands = [
  new SlashCommandBuilder().setName('nvb').setDescription('🦇 Abre o QG NVB'),
  new SlashCommandBuilder().setName('perfil').setDescription('Mostra seu perfil completo'),
  new SlashCommandBuilder().setName('roblox').setDescription('Vincula ou mostra seu Roblox').addStringOption(o=>o.setName('nick').setDescription('Seu nome de usuário no Roblox').setRequired(false)),
  new SlashCommandBuilder().setName('avatar').setDescription('Mostra seu avatar do Discord'),
  new SlashCommandBuilder().setName('cargos').setDescription('Mostra seus cargos NVB'),
  new SlashCommandBuilder().setName('consulta-cargo').setDescription('Consulta os cargos NVB de outro membro').addUserOption(optionUser()),
  new SlashCommandBuilder().setName('conquistas').setDescription('Mostra suas conquistas'),
  new SlashCommandBuilder().setName('nivel').setDescription('Mostra seu nível'),
  new SlashCommandBuilder().setName('pontos').setDescription('Mostra seus pontos'),
  new SlashCommandBuilder().setName('ranking').setDescription('Mostra o ranking de pontos'),
  new SlashCommandBuilder().setName('ajuda').setDescription('Mostra os comandos atuais da NVB'),
  new SlashCommandBuilder().setName('status').setDescription('Mostra seu status atual na NVB'),

  new SlashCommandBuilder().setName('recrutamento').setDescription('Abre/anuncia o recrutamento NVB'),
  new SlashCommandBuilder().setName('candidaturas').setDescription('Lista candidaturas da equipe'),
  new SlashCommandBuilder().setName('aprovar').setDescription('Aprova uma candidatura').addStringOption(o=>o.setName('id').setDescription('ID').setRequired(true)),
  new SlashCommandBuilder().setName('recusar').setDescription('Recusa uma candidatura').addStringOption(o=>o.setName('id').setDescription('ID').setRequired(true)),

  new SlashCommandBuilder().setName('aviso').setDescription('Aplica um aviso').addUserOption(optionUser()).addStringOption(o=>o.setName('motivo').setDescription('Motivo').setRequired(true)),
  new SlashCommandBuilder().setName('silenciar').setDescription('Silencia um membro').addUserOption(optionUser()).addIntegerOption(o=>o.setName('minutos').setDescription('Minutos').setMinValue(1).setMaxValue(10080).setRequired(true)),
  new SlashCommandBuilder().setName('dessilenciar').setDescription('Remove o silenciamento').addUserOption(optionUser()),
  new SlashCommandBuilder().setName('expulsar').setDescription('Expulsa um membro').addUserOption(optionUser()).addStringOption(o=>o.setName('motivo').setDescription('Motivo').setRequired(false)),
  new SlashCommandBuilder().setName('banir').setDescription('Bane um membro').addUserOption(optionUser()).addStringOption(o=>o.setName('motivo').setDescription('Motivo').setRequired(false)),
  new SlashCommandBuilder().setName('desbanir').setDescription('Remove um banimento').addStringOption(o=>o.setName('id').setDescription('ID').setRequired(true)),
  new SlashCommandBuilder().setName('limpar').setDescription('Limpa mensagens').addIntegerOption(o=>o.setName('quantidade').setDescription('Quantidade').setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName('historico').setDescription('Mostra histórico de moderação').addUserOption(o=>o.setName('usuario').setDescription('Membro').setRequired(false)),

  new SlashCommandBuilder().setName('skin').setDescription('Abre o sistema de skins NVB'),
  new SlashCommandBuilder().setName('avatar-roblox-ia').setDescription('Gera seu avatar Roblox em um dos 38 estilos').addStringOption(o=>o.setName('roblox').setDescription('Nick do Roblox').setRequired(true)).addStringOption(o=>o.setName('estilo').setDescription('Estilo').setRequired(true).setAutocomplete(true)),
  new SlashCommandBuilder().setName('criar-skin').setDescription('Cria uma skin com IA').addStringOption(o=>o.setName('nome').setDescription('Nome').setRequired(true)).addStringOption(o=>o.setName('detalhes').setDescription('Tema, roupa, cabelo, acessórios e cores').setRequired(true)),
  new SlashCommandBuilder().setName('editar-skin').setDescription('Edita uma skin salva com IA').addStringOption(o=>o.setName('nome').setDescription('Nome da skin').setRequired(true)).addStringOption(o=>o.setName('detalhes').setDescription('Alterações').setRequired(true)),
  new SlashCommandBuilder().setName('melhorar-skin').setDescription('Melhora uma skin salva com IA').addStringOption(o=>o.setName('nome').setDescription('Nome da skin').setRequired(true)),
  new SlashCommandBuilder().setName('skin-nvb').setDescription('Gera uma skin no estilo oficial Vampírico NVB'),
  new SlashCommandBuilder().setName('salvar-skin').setDescription('Salva a última skin criada').addStringOption(o=>o.setName('nome').setDescription('Nome para salvar').setRequired(true)),
  new SlashCommandBuilder().setName('skins').setDescription('Lista suas skins salvas'),

  new SlashCommandBuilder().setName('dar-cargo').setDescription('Dá um cargo').addUserOption(optionUser()).addRoleOption(o=>o.setName('cargo').setDescription('Cargo').setRequired(true)),
  new SlashCommandBuilder().setName('remover-cargo').setDescription('Remove um cargo').addUserOption(optionUser()).addRoleOption(o=>o.setName('cargo').setDescription('Cargo').setRequired(true)),
  new SlashCommandBuilder().setName('logs').setDescription('Mostra os últimos logs').addIntegerOption(o=>o.setName('quantidade').setDescription('Quantidade').setMinValue(1).setMaxValue(20).setRequired(false)),

  new SlashCommandBuilder().setName('evento').setDescription('Cria um evento').addStringOption(o=>o.setName('nome').setDescription('Nome').setRequired(true)),
  new SlashCommandBuilder().setName('jogatina').setDescription('Abre o painel de jogatina'),
  new SlashCommandBuilder().setName('resenha').setDescription('Abre o painel de resenha'),
  new SlashCommandBuilder().setName('chamada').setDescription('Abre o painel de chamada'),
  new SlashCommandBuilder().setName('presenca').setDescription('Responde à chamada ativa'),
  new SlashCommandBuilder().setName('pontos-add').setDescription('Adiciona pontos').addUserOption(optionUser()).addIntegerOption(o=>o.setName('quantidade').setDescription('Pontos').setMinValue(1).setRequired(true)).addStringOption(o=>o.setName('motivo').setDescription('Motivo').setRequired(false)),
  new SlashCommandBuilder().setName('pontos-remove').setDescription('Remove pontos').addUserOption(optionUser()).addIntegerOption(o=>o.setName('quantidade').setDescription('Pontos').setMinValue(1).setRequired(true)).addStringOption(o=>o.setName('motivo').setDescription('Motivo').setRequired(false)),
  new SlashCommandBuilder().setName('recompensa').setDescription('Registra uma recompensa').addUserOption(optionUser()).addStringOption(o=>o.setName('nome').setDescription('Nome').setRequired(true)).addIntegerOption(o=>o.setName('pontos').setDescription('Custo').setMinValue(0).setRequired(true)),
  new SlashCommandBuilder().setName('conquista-add').setDescription('Adiciona conquista').addUserOption(optionUser()).addStringOption(o=>o.setName('nome').setDescription('Nome').setRequired(true)),

  new SlashCommandBuilder().setName('boasvindas').setDescription('Configura o canal de boas-vindas').addChannelOption(o=>o.setName('canal').setDescription('Canal').setRequired(true))
].map(c=>c.toJSON());

// =========================
// REGISTRO
// =========================
async function registerCommands(){
  const rest=new REST({version:'10'}).setToken(TOKEN);
  await rest.put(GUILD_ID?Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID):Routes.applicationCommands(CLIENT_ID),{body:commands});
  console.log(`✅ ${commands.length} comandos NVB registrados.`);
}
async function sendToChannel(envName,payload){
  const id=process.env[envName]; if(!id)return false;
  const ch=await client.channels.fetch(id).catch(()=>null); if(!ch?.isTextBased())return false;
  await ch.send(payload).catch(()=>null); return true;
}
async function modHistory(userId,action,details){db.historico[userId] ||= [];db.historico[userId].push({action,details,at:new Date().toISOString()});writeDb('historico');}
function nvRoles(member){ return member?.roles?.cache?.filter(r=>r.id!==member.guild.id && /\[(LDR|SB-LDR|ADM|CMDT|MOD|SUP|TRN|INF|EDT|ORG|REC|BSTR|PCR|MBRS|NVT)\]/i.test(r.name)).map(r=>r.toString()) || []; }
function rankPosition(userId){const arr=Object.entries(db.pontos).sort((a,b)=>Number(b[1])-Number(a[1]));const i=arr.findIndex(x=>x[0]===userId);return i<0?'—':String(i+1);}
function recruitmentFor(userId){return [...db.recrutamentos].reverse().find(x=>String(x.discordId||x.userId)===String(userId)) || null;}
function memberRoleLabel(member){const r=nvRoles(member);return r.length?r.join(', '):'⚪ [MBRS] Membro';}

// =========================
// INTERAÇÕES
// =========================
client.on('interactionCreate',async interaction=>{
  try{
    // autocomplete dos 38 estilos
    if(interaction.isAutocomplete()){
      if(interaction.commandName==='avatar-roblox-ia'){
        const q=(interaction.options.getString('estilo')||'').toLowerCase();
        return interaction.respond(STYLE_LIST.filter(([n])=>n.toLowerCase().includes(q)).slice(0,25).map(([name,price])=>({name:`${name} • ${price} pts`,value:name})));
      }
      return interaction.respond([]);
    }

    if(interaction.isButton()){
      if(interaction.customId.startsWith('call_presence_')) return interaction.showModal(presenceModal(interaction.customId.replace('call_presence_','')));
      if(interaction.customId.startsWith('call_close_')){
        const id=interaction.customId.replace('call_close_','');const call=db.chamadas[interaction.guildId];
        if(!call||call.id!==id)return safeReply(interaction,{content:'❌ Chamada não encontrada.',ephemeral:true});
        if(!await guard(interaction,'chamada'))return;
        call.status='encerrada';call.encerradaEm=new Date().toISOString();writeDb('chamadas');await updateCallMessage(call);
        const ch=await client.channels.fetch(call.channelId).catch(()=>null);if(ch?.isTextBased())await ch.send({embeds:[new EmbedBuilder().setColor(0x22c55e).setTitle('🔒 CHAMADA ENCERRADA').setDescription(`**${call.titulo}**\n\n👥 **Presentes:** ${Object.keys(call.presencas||{}).length}\n\n${Object.values(call.presencas||{}).map((p,i)=>`${i+1}. <@${p.userId}> — ${p.resposta}`).join('\n')||'Nenhuma presença registrada.'}`).setFooter({text:'NVB • Lista final salva no canal de chamadas'})]}).catch(()=>{});
        logAction('chamada_encerrada',interaction.user.id,{callId:id});return safeReply(interaction,{content:'🔒 Chamada encerrada e lista final salva no canal de chamadas.',ephemeral:true});
      }
      if(interaction.customId.startsWith('qg_recrut_')){
        const parts=interaction.customId.split('_');
        const action=parts[2], id=parts.slice(3).join('_');
        const item=db.recrutamentos.find(x=>String(x.id)===String(id));
        if(!item)return safeReply(interaction,{content:'❌ Recrutamento não encontrado no sistema.',ephemeral:true});
        if(!await guard(interaction,action==='aprovar'?'aprovar':'recusar'))return;
        if(item.status==='Aprovado'||item.status==='Recusado')return safeReply(interaction,{content:`⚠️ Este recrutamento já foi **${item.status.toLowerCase()}**.`,ephemeral:true});
        if(action==='aprovar'){
          const discord=String(item.discord||item.discordNick||item.nickDiscord||'').trim();
          const principal=String(item.principal||item.principalDiscord||'').trim();
          let discordId=String(item.discordId||item.userId||'').trim();
          const mention=discord.match(/<@!?([0-9]+)>/); if(!discordId&&mention)discordId=mention[1];
          const code=`NVB-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
          db.codes[code]={discord,principal,discordId,userId:discordId,cargo:roleNames.MBRS,status:'Ativo',recrutamentoId:item.id,roblox:item.roblox||'',createdAt:new Date().toISOString()};writeDb('codes');
          item.status='Aprovado';item.codigoEntrada=code;item.aprovadoPor=interaction.user.id;item.updatedAt=new Date().toISOString();writeDb('recrutamentos');
          const member=discordId?await interaction.guild.members.fetch(discordId).catch(()=>null):null;
          if(member&&roleIds.MBRS)await member.roles.add(roleIds.MBRS).catch(()=>{});
          let dmOk=false;
          if(discordId){
            const user=await client.users.fetch(discordId).catch(()=>null);
            if(user){
              dmOk=await user.send(`🩸 **BEM-VINDO À NVB!**\n\nSua entrada na **Nytheris Vampyre Bloodline** foi aprovada. 🦇💜\n\n🌐 **Servidor oficial:** ${MAIN_INVITE}\n🔐 **Senha/código de entrada:** \`${code}\`\n\nEntre no servidor pelo convite acima. O código é usado para acessar o QG.`).then(()=>true).catch(()=>false);
            }
          }
          item.dmEnviada=dmOk; item.dmEnviadaEm=dmOk?new Date().toISOString():null; writeDb('recrutamentos');
          const e=EmbedBuilder.from(interaction.message.embeds[0]||new EmbedBuilder()).setColor(0x22c55e).setTitle('🟢 RECRUTAMENTO APROVADO').setDescription(`**ID:** ${id}\n**Status:** Aprovado\n**Código:** \`${code}\`\n**Servidor oficial:** ${MAIN_INVITE}\n**DM enviada:** ${dmOk?'✅ Sim':'❌ Não — DM fechada ou usuário não encontrado'}`);
          await interaction.update({embeds:[e],components:[]}).catch(()=>{});
          return;
        }
        item.status='Recusado';item.recusadoPor=interaction.user.id;item.updatedAt=new Date().toISOString();writeDb('recrutamentos');
        const member=String(item.discordId||item.userId||'')?await interaction.guild.members.fetch(String(item.discordId||item.userId)).catch(()=>null):null;if(member)await member.send(`🩸 Seu recrutamento **${id}** na NVB foi recusado.`).catch(()=>{});
        const e=EmbedBuilder.from(interaction.message.embeds[0]||new EmbedBuilder()).setColor(0xef4444).setTitle('🔴 RECRUTAMENTO RECUSADO').setDescription(`**ID:** ${id}\n**Status:** Recusado`);
        await interaction.update({embeds:[e],components:[]}).catch(()=>{});return;
      }

      if(interaction.customId.startsWith('qg_cand_')){
        const [, , action, id]=interaction.customId.split('_'); const item=db.candidaturas.find(x=>x.id===id);
        if(!item)return safeReply(interaction,{content:'❌ Candidatura não encontrada.',ephemeral:true});
        if(!await guard(interaction,action==='aprovar'?'aprovar':'recusar'))return;
        if(action==='aprovar'){
          item.status='aprovada';item.updatedAt=new Date().toISOString();item.aprovadoPor=interaction.user.id;writeDb('candidaturas');
          const roleKey=item.cargo;const roleId=roleIds[roleKey];let roleOk=false;
          const member=await interaction.guild.members.fetch(item.userId).catch(()=>null);
          if(member){const role=roleId?interaction.guild.roles.cache.get(roleId):interaction.guild.roles.cache.find(r=>normalizeQG(r.name)===normalizeQG(roleNames[roleKey]||''));if(role){roleOk=await member.roles.add(role).then(()=>true).catch(()=>false);}}
          await interaction.update({embeds:[EmbedBuilder.from(interaction.message.embeds[0]||new EmbedBuilder()).setColor(0x22c55e).setTitle('🟢 CANDIDATURA APROVADA').setDescription(`**ID:** ${id}\n**Cargo:** ${roleNames[roleKey]||roleKey}\n**Cargo no Discord:** ${roleOk?'adicionado ao membro':'não foi possível adicionar automaticamente'}`)],components:[]}).catch(()=>{});
          if(member)await member.send(`🩸 Sua candidatura para **${roleNames[roleKey]||roleKey}** foi aprovada na NVB. ${roleOk?'Seu cargo já foi aplicado no Discord.':'A equipe precisará aplicar o cargo manualmente.'}`).catch(()=>{});
          return;
        }
        item.status='recusada';item.updatedAt=new Date().toISOString();item.recusadoPor=interaction.user.id;writeDb('candidaturas');
        await interaction.update({embeds:[EmbedBuilder.from(interaction.message.embeds[0]||new EmbedBuilder()).setColor(0xef4444).setTitle('🔴 CANDIDATURA RECUSADA').setDescription(`**ID:** ${id}\n**Cargo:** ${roleNames[item.cargo]||item.cargo}`)],components:[]}).catch(()=>{});return;
      }
      return;
    }

    if(interaction.isModalSubmit()){
      const id=interaction.customId;
      if(id==='jogatina_modal'){
        if(!await guard(interaction,'comunidade'))return;const title=interaction.fields.getTextInputValue('titulo'),theme=interaction.fields.getTextInputValue('tema'),desc=interaction.fields.getTextInputValue('descricao'),img=interaction.fields.getTextInputValue('imagem').trim();
        const e=new EmbedBuilder().setColor(0x7c3aed).setTitle(`🎮 ${title}`).addFields({name:'🎯 Tema',value:theme,inline:true},{name:'👤 Usuário',value:`${interaction.user}`,inline:true},{name:'📝 Descrição',value:desc}).setFooter({text:'NVB • JOGATINA'}).setTimestamp();if(img)e.setImage(img);
        await interaction.channel.send({embeds:[e]});addPoints(interaction.user.id,5,'jogatina');return safeReply(interaction,{content:'🎮 Jogatina anunciada com sucesso.',ephemeral:true});
      }
      if(id==='resenha_modal'){
        if(!await guard(interaction,'comunidade'))return;const title=interaction.fields.getTextInputValue('titulo'),theme=interaction.fields.getTextInputValue('tema'),desc=interaction.fields.getTextInputValue('descricao');
        const e=new EmbedBuilder().setColor(0x8b5cf6).setTitle(`💬 ${title}`).addFields({name:'🎯 Tema',value:theme},{name:'📝 Descrição',value:desc},{name:'👤 Usuário',value:`${interaction.user}`}).setFooter({text:'NVB • RESENHA'}).setTimestamp();await interaction.channel.send({embeds:[e]});addPoints(interaction.user.id,5,'resenha');return safeReply(interaction,{content:'💬 Resenha anunciada com sucesso.',ephemeral:true});
      }
      if(id==='chamada_modal'){
        if(!await guard(interaction,'chamada'))return;const call={id:`CALL-${Date.now().toString(36).toUpperCase()}`,guildId:interaction.guildId,titulo:interaction.fields.getTextInputValue('titulo'),tema:interaction.fields.getTextInputValue('tema'),descricao:interaction.fields.getTextInputValue('descricao'),horario:interaction.fields.getTextInputValue('horario'),status:'aberta',criadaPor:interaction.user.id,criadaEm:new Date().toISOString(),channelId:callsChannelId(interaction.guild)||interaction.channelId,presencas:{}};const ch=await client.channels.fetch(call.channelId).catch(()=>null);if(!ch?.isTextBased())return safeReply(interaction,{content:'❌ Configure o canal de chamadas em CALLS_CHANNEL_ID.',ephemeral:true});const e=new EmbedBuilder().setColor(0x7c3aed).setTitle(`📢 ${call.titulo}`).addFields({name:'🎯 Tema',value:call.tema,inline:true},{name:'🕖 Horário',value:call.horario,inline:true},{name:'📝 Descrição',value:call.descricao},{name:'👥 Presenças (0)',value:'Ainda não há presenças confirmadas.'}).setFooter({text:'Clique em Presença ou use /presenca.'}).setTimestamp();const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`call_presence_${call.id}`).setLabel('🟢 Responder presença').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`call_close_${call.id}`).setLabel('🔒 Encerrar chamada').setStyle(ButtonStyle.Danger));const msg=await ch.send({embeds:[e],components:[row]});call.messageId=msg.id;db.chamadas[interaction.guildId]=call;writeDb('chamadas');logAction('chamada_criada',interaction.user.id,{callId:call.id});return safeReply(interaction,{content:`📢 Chamada criada no canal de chamadas: ${ch}.`,ephemeral:true});
      }
      if(id.startsWith('presence_modal_')){
        const callId=id.replace('presence_modal_','');const call=db.chamadas[interaction.guildId];if(!call||call.id!==callId||call.status!=='aberta')return safeReply(interaction,{content:'❌ Não existe uma chamada aberta.',ephemeral:true});const resposta=interaction.fields.getTextInputValue('resposta').trim();call.presencas[interaction.user.id]={userId:interaction.user.id,resposta,at:new Date().toISOString()};db.presenca[interaction.user.id]={callId,at:new Date().toISOString(),resposta};writeDb('chamadas');writeDb('presenca');addPoints(interaction.user.id,5,'presença');await updateCallMessage(call);const ch=await client.channels.fetch(call.channelId).catch(()=>null);if(ch?.isTextBased())await ch.send(`🟢 **Presença registrada!** ${interaction.user} — ${resposta}`).catch(()=>{});return safeReply(interaction,{content:'🟢 Sua presença foi registrada e adicionada à lista da chamada.',ephemeral:true});
      }
      if(id==='criar_skin_modal'){
        if(!await safeDefer(interaction,{ephemeral:true}))return;return;
      }
      return;
    }

    if(!interaction.isChatInputCommand())return;
    const c=interaction.commandName,u=interaction.user;
    if(c==='avatar-roblox-ia'){
      if(!await safeDefer(interaction,{ephemeral:false}))return;const nick=interaction.options.getString('roblox'),style=interaction.options.getString('estilo');if(!STYLE_NAMES.includes(style))return safeReply(interaction,{content:'❌ Escolha um dos 38 estilos oficiais da lista.',ephemeral:true});
      try{const rb=await robloxUser(nick);const src=await fetchBuffer(rb.avatarUrl);const prompt=`Transforme o avatar Roblox de referência em uma nova arte completa, mantendo claramente reconhecíveis roupas, cabelo, cores, acessórios, proporções e identidade visual do avatar. ${stylePrompt(style)} O resultado deve ser uma nova imagem gerada por IA, não uma simples cópia da referência. Mostrar o personagem inteiro, da cabeça aos pés, sem cortar mãos, pés ou acessórios.`;const out=await openAIImage(prompt,src);const file=await saveSkinImage(u.id,`${style}-${rb.username}`,out);db.skins[u.id] ||= {};db.skins[u.id].lastCreated={name:`${style}-${rb.username}`,style,roblox:rb.username,robloxId:rb.id,file,createdAt:new Date().toISOString()};writeDb('skins');return safeReply(interaction,{content:`🦇 **Avatar Roblox IA**\n🎮 ${rb.username}\n🎨 ${style}\n💰 ${STYLE_LIST.find(x=>x[0]===style)?.[1]||0} pontos`,files:[{attachment:out,name:'avatar-roblox-ia.png'}],ephemeral:false});}catch(e){return safeReply(interaction,{content:`❌ ${e.message}`,ephemeral:true});}
    }

    if(c==='nvb')return safeReply(interaction,{embeds:[new EmbedBuilder().setColor(0x7c3aed).setTitle('🦇 QG NVB').setDescription('**Nytheris Vampyre Bloodline**\nUma linhagem que acolhe. Uma família que permanece.')],ephemeral:true});
    if(c==='avatar')return safeReply(interaction,{embeds:[new EmbedBuilder().setColor(0x7c3aed).setTitle(`🖼️ Avatar de ${u.username}`).setImage(u.displayAvatarURL({size:1024}))],ephemeral:true});
    if(c==='roblox'){
      const nick=interaction.options.getString('nick')?.trim();
      if(!nick){
        const r=db.roblox[u.id];
        return safeReply(interaction,{content:r?`🎮 **Roblox vinculado:** ${r.username}\n🆔 **ID:** ${r.id}\n👤 **Display:** ${r.displayName||r.username}\n🖼️ ${r.avatarUrl||'sem avatar'}\n\nPara vincular ou trocar: **/roblox nick:SeuNick**`:'❌ Nenhum Roblox vinculado.\n\nUse **/roblox nick:SeuNick** para vincular seu Roblox.',ephemeral:true});
      }
      if(!await safeDefer(interaction,{ephemeral:true})) return;
      try{
        const rData=await robloxUser(nick);
        const antigo=db.roblox[u.id];
        const mesmoNick=antigo?.id && String(antigo.id)===String(rData.id);
        db.roblox[u.id]={id:rData.id,username:rData.username,displayName:rData.displayName,avatarUrl:rData.avatarUrl,linkedAt:antigo?.linkedAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
        writeDb('roblox');
        let pontosGanhos=0;
        if(!antigo?.id){
          db.conquistas[u.id] ||= [];
          if(!db.conquistas[u.id].includes('Vinculou o Roblox')){db.conquistas[u.id].push('Vinculou o Roblox');writeDb('conquistas');}
          pontosGanhos=10; addPoints(u.id,pontosGanhos,'Vinculou o Roblox');
        }
        logAction('roblox_vinculado',u.id,{robloxId:rData.id,username:rData.username,alterou:!mesmoNick});
        return safeReply(interaction,{content:`🦇 **ROBLOX VINCULADO COM SUCESSO!**\n\n🎮 **Nick:** ${rData.username}\n👤 **Display:** ${rData.displayName}\n🆔 **ID:** ${rData.id}\n${pontosGanhos?`🪙 **+${pontosGanhos} pontos** por completar o vínculo.\n`:''}\nAgora seu Roblox está salvo no seu perfil NVB.\nUse **/perfil** ou **/roblox** para consultar.`,ephemeral:true});
      }catch(e){
        return safeReply(interaction,{content:`❌ Não consegui vincular **${nick}**. ${e.message||'Verifique o nome de usuário e tente novamente.'}`,ephemeral:true});
      }
    }
    if(c==='cargos'){return safeReply(interaction,{content:`🏷️ **Seus cargos NVB**\n${nvRoles(interaction.member).join('\n')||'⚪ [MBRS] Membro'}`,ephemeral:true});}
    if(c==='consulta-cargo'){const m=interaction.options.getMember('usuario');return safeReply(interaction,{content:m?`🏷️ **Cargos de ${m.user.username}**\n${nvRoles(m).join('\n')||'⚪ [MBRS] Membro'}`:'❌ Membro não encontrado.',ephemeral:true});}
    if(c==='conquistas'){const list=db.conquistas[u.id]||[];return safeReply(interaction,{content:list.length?`🏆 **Suas conquistas (${list.length})**\n${list.map((x,i)=>`${i+1}. ${x}`).join('\n')}`:'🏆 Você ainda não possui conquistas.',ephemeral:true});}
    if(c==='nivel')return safeReply(interaction,{content:`⭐ **Nível:** ${level(db.xp[u.id]||0)}\n✨ XP: ${db.xp[u.id]||0}`,ephemeral:true});
    if(c==='pontos')return safeReply(interaction,{content:`🪙 **Seus pontos:** ${db.pontos[u.id]||0}`,ephemeral:true});
    if(c==='ranking'){const top=Object.entries(db.pontos).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,15);return safeReply(interaction,{content:top.length?`🏆 **RANKING NVB**\n${top.map(([id,p],i)=>`${i+1}. <@${id}> — ${p} 🪙`).join('\n')}`:'🏆 Ainda não há ranking.',ephemeral:true});}
    if(c==='perfil'){const r=db.roblox[u.id],rec=recruitmentFor(u.id),member=interaction.member,list=db.conquistas[u.id]||[];const e=new EmbedBuilder().setColor(0x8b5cf6).setTitle('🪪 PERFIL NVB').setThumbnail(u.displayAvatarURL({size:512})).addFields(
      {name:'👤 Discord',value:`${u}`,inline:true},{name:'🆔 ID',value:u.id,inline:true},{name:'🎮 Roblox',value:r?.username||rec?.roblox||'Não vinculado',inline:true},{name:'🏷️ Cargo',value:memberRoleLabel(member),inline:true},
      {name:'📅 Entrada',value:rec?.data?new Date(rec.data).toLocaleDateString('pt-BR'):'Não registrada',inline:true},{name:'⭐ Nível',value:String(level(db.xp[u.id]||0)),inline:true},{name:'🪙 Pontos',value:String(db.pontos[u.id]||0),inline:true},{name:'🏆 Conquistas',value:String(list.length),inline:true},
      {name:'🏅 Ranking',value:`#${rankPosition(u.id)}`,inline:true},{name:'📋 Recrutamento',value:rec?.status||'Não registrado',inline:true},{name:'👥 Recrutado por',value:rec?.recrutador||rec?.recrutadoPor||'Não registrado',inline:true},{name:'📊 Presenças',value:String(Object.values(db.presenca).filter(x=>x?.userId===u.id||x?.userId===u.id).length),inline:true}
    );return safeReply(interaction,{embeds:[e],ephemeral:true});}
    if(c==='status'){const rec=recruitmentFor(u.id);const desc=`👤 ${u}\n🏷️ ${memberRoleLabel(interaction.member)}\n🟢 Status: **Ativo**\n📅 Entrada: **${rec?.data?new Date(rec.data).toLocaleDateString('pt-BR'):'não registrada'}**\n🎮 Roblox: **${db.roblox[u.id]?.username||rec?.roblox||'não vinculado'}**\n⭐ Nível: **${level(db.xp[u.id]||0)}**\n🪙 Pontos: **${db.pontos[u.id]||0}**\n🏆 Conquistas: **${(db.conquistas[u.id]||[]).length}**\n🏅 Ranking: **#${rankPosition(u.id)}**\n🩸 Recrutamento: **${rec?.status||'não registrado'}**\n👤 Recrutado por: **${rec?.recrutador||'não registrado'}**`;return safeReply(interaction,{embeds:[new EmbedBuilder().setColor(0x7c3aed).setTitle('📊 MEU STATUS NVB').setDescription(desc)],ephemeral:true});}
    if(c==='ajuda'){const groups=[['👤 Membro',['nvb','perfil','roblox','avatar','cargos','consulta-cargo','conquistas','nivel','pontos','ranking','status','ajuda']],['🩸 Recrutamento',['recrutamento','candidaturas','aprovar','recusar']],['🛡️ Moderação',['aviso','silenciar','dessilenciar','expulsar','banir','desbanir','limpar','historico']],['🎨 Roblox + IA',['skin','avatar-roblox-ia','criar-skin','editar-skin','melhorar-skin','skin-nvb','salvar-skin','skins']],['👑 Administração',['dar-cargo','remover-cargo','logs']],['🎮 Comunidade',['evento','jogatina','resenha','chamada','presenca','pontos-add','pontos-remove','recompensa','conquista-add']],['🤖 Automação',['boasvindas']]];const txt=groups.map(([g,arr])=>`**${g}**\n${arr.map(x=>`/${x}`).join(' • ')}`).join('\n\n');return safeReply(interaction,{content:`🦇 **AJUDA NVB — ${commands.length} comandos**\n\n${txt}\n\nOs comandos acima são os comandos atuais; comandos removidos não aparecem aqui.`,ephemeral:true});}

    // Recrutamento / candidaturas
    if(c==='recrutamento'){if(!await guard(interaction,'recrutamento'))return;const e=new EmbedBuilder().setColor(0x8b5cf6).setTitle('🩸 RECRUTAMENTO NVB').setDescription(`O recrutamento está aberto.\n\n🌐 QG: ${MAIN_INVITE}\n🩸 Servidor de recrutamento: ${RECRUIT_INVITE}`);await sendToChannel('RECRUT_CHANNEL_ID',{embeds:[e]});return safeReply(interaction,{embeds:[e],ephemeral:true});}
    if(c==='candidaturas'){if(!await guard(interaction,'candidaturas'))return;const list=db.candidaturas.slice(-15).reverse();return safeReply(interaction,{content:list.length?list.map(x=>`**${x.id}** — <@${x.userId}> — ${x.status} — ${roleNames[x.cargo]||x.cargo}`).join('\n'):'📋 Nenhuma candidatura.',ephemeral:true});}
    if(c==='aprovar'||c==='recusar'){
      if(!await guard(interaction,c))return;
      const id=interaction.options.getString('id');
      const cand=db.candidaturas.find(x=>String(x.id)===String(id));
      if(cand){
        cand.status=c==='aprovar'?'aprovada':'recusada';cand.updatedAt=new Date().toISOString();if(c==='aprovar')cand.aprovadoPor=u.id;else cand.recusadoPor=u.id;writeDb('candidaturas');
        if(c==='aprovar'){
          const member=String(cand.userId||'')?await interaction.guild.members.fetch(String(cand.userId)).catch(()=>null):null;
          const roleId=roleIds[cand.cargo]; const role=member&&(roleId?interaction.guild.roles.cache.get(roleId):interaction.guild.roles.cache.find(r=>normalizeQG(r.name)===normalizeQG(roleNames[cand.cargo]||'')));
          const roleOk=!!(member&&role&&await member.roles.add(role).then(()=>true).catch(()=>false));
          const user=String(cand.userId||'')?await client.users.fetch(String(cand.userId)).catch(()=>null):null;
          const dmOk=!!(user&&await user.send(`🩸 **BEM-VINDO À NVB!**\n\nSua candidatura para **${roleNames[cand.cargo]||cand.cargo}** foi aprovada. 🦇💜\n\nSeu cargo ${roleOk?'já foi aplicado no Discord.':'será aplicado pela equipe.'}`).then(()=>true).catch(()=>false));
          return safeReply(interaction,{content:`🟢 Candidatura **${id}** aprovada.\n🎖️ Cargo: ${roleOk?'aplicado':'não aplicado'}\n💬 DM: ${dmOk?'enviada':'não enviada'}`,ephemeral:true});
        }
        return safeReply(interaction,{content:`🔴 Candidatura **${id}** recusada.`,ephemeral:true});
      }
      const rec=db.recrutamentos.find(x=>String(x.id)===String(id));
      if(!rec)return safeReply(interaction,{content:'❌ Candidatura/recrutamento não encontrado.',ephemeral:true});
      if(c==='recusar'){rec.status='Recusado';rec.recusadoPor=u.id;rec.updatedAt=new Date().toISOString();writeDb('recrutamentos');return safeReply(interaction,{content:`🔴 Recrutamento **${id}** recusado.`,ephemeral:true});}
      const discordId=String(rec.discordId||rec.userId||'').trim();
      const code=rec.codigoEntrada||`NVB-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      rec.status='Aprovado';rec.codigoEntrada=code;rec.aprovadoPor=u.id;rec.updatedAt=new Date().toISOString();
      const member=discordId?await interaction.guild.members.fetch(discordId).catch(()=>null):null;
      if(member&&roleIds.MBRS)await member.roles.add(roleIds.MBRS).catch(()=>{});
      const user=discordId?await client.users.fetch(discordId).catch(()=>null):null;
      const dmOk=!!(user&&await user.send(`🩸 **BEM-VINDO À NVB!**\n\nSeu recrutamento foi **aprovado**! 🦇💜\n\n🌐 **Servidor oficial:** ${MAIN_INVITE}\n🔐 **Senha/código de entrada:** \`${code}\`\n\nEntre pelo convite acima e use seu código para acessar o QG.`).then(()=>true).catch(()=>false));
      rec.dmEnviada=dmOk;rec.dmEnviadaEm=dmOk?new Date().toISOString():null;db.codes[code]={discord:rec.discord||'',principal:rec.principal||'',discordId,userId:discordId,cargo:roleNames.MBRS,status:'Ativo',recrutamentoId:rec.id,roblox:rec.roblox||'',createdAt:new Date().toISOString()};writeDb('recrutamentos');writeDb('codes');
      return safeReply(interaction,{content:`🟢 Recrutamento **${id}** aprovado.\n🌐 Convite enviado: ${MAIN_INVITE}\n🔐 Código: \`${code}\`\n💬 DM: ${dmOk?'enviada':'não enviada — DM fechada ou usuário não encontrado'}`,ephemeral:true});
    }

    // Moderação
    if(['aviso','silenciar','dessilenciar','expulsar','banir','desbanir','limpar','historico'].includes(c)&&!await guard(interaction,c==='banir'||c==='desbanir'?'banir':'moderacao'))return;
    if(c==='aviso'){const m=interaction.options.getMember('usuario'),reason=interaction.options.getString('motivo');if(!m)return safeReply(interaction,{content:'❌ Membro não encontrado.',ephemeral:true});db.avisos[m.id] ||= [];db.avisos[m.id].push({by:u.id,reason,at:new Date().toISOString()});writeDb('avisos');await modHistory(m.id,'aviso',reason);return safeReply(interaction,`⚠️ Aviso aplicado a ${m}.`);}
    if(c==='silenciar'){const m=interaction.options.getMember('usuario'),mins=interaction.options.getInteger('minutos');if(!m)return safeReply(interaction,{content:'❌ Membro não encontrado.',ephemeral:true});const until=Date.now()+mins*60000;await m.timeout(mins*60000,'NVB').then(()=>true).catch(()=>false);await modHistory(m.id,'silenciar',`${mins} min`);return safeReply(interaction,`🔇 ${m} silenciado por ${mins} minutos.`);}
    if(c==='dessilenciar'){const m=interaction.options.getMember('usuario');if(!m)return safeReply(interaction,{content:'❌ Membro não encontrado.',ephemeral:true});await m.timeout(null,'NVB').catch(()=>{});await modHistory(m.id,'dessilenciar','');return safeReply(interaction,`🔊 Silenciamento removido de ${m}.`);}
    if(c==='expulsar'){const m=interaction.options.getMember('usuario');if(!m)return safeReply(interaction,{content:'❌ Membro não encontrado.',ephemeral:true});await m.kick(interaction.options.getString('motivo')||'NVB').catch(()=>{});await modHistory(m.id,'expulsar',interaction.options.getString('motivo')||'');return safeReply(interaction,'👢 Membro expulso.');}
    if(c==='banir'){const m=interaction.options.getMember('usuario');if(!m)return safeReply(interaction,{content:'❌ Membro não encontrado.',ephemeral:true});await m.ban({reason:interaction.options.getString('motivo')||'NVB'}).catch(()=>{});await modHistory(m.id,'banir',interaction.options.getString('motivo')||'');return safeReply(interaction,'🔨 Membro banido.');}
    if(c==='desbanir'){const id=interaction.options.getString('id');await interaction.guild.bans.remove(id).catch(()=>{});return safeReply(interaction,`🔓 Banimento removido de ${id}.`);}
    if(c==='limpar'){const q=interaction.options.getInteger('quantidade');await interaction.channel.bulkDelete(q,true).catch(()=>{});return safeReply(interaction,`🧹 ${q} mensagens removidas.`);}
    if(c==='historico'){const m=interaction.options.getUser('usuario')||u;const h=db.historico[m.id]||[];return safeReply(interaction,{content:h.length?`📜 **Histórico de ${m.username}**\n${h.slice(-15).reverse().map(x=>`• ${x.action} — ${x.details||'sem motivo'} — ${new Date(x.at).toLocaleString('pt-BR')}`).join('\n')}`:'📜 Nenhum histórico registrado.',ephemeral:true});}

    // Skins
    if(c==='skin'){
      if(!await safeDefer(interaction,{ephemeral:false}))return;
      try{
        const prompt='Crie uma skin de personagem inspirada em avatar de Roblox, corpo inteiro da cabeça aos pés, personagem único centralizado, visual oficial Nytheris Vampyre Bloodline, vampírico e gótico elegante, castelo sombrio ao fundo, morcegos discretos, lua cheia, detalhes em roxo, azul e verde, roupas pretas sofisticadas com detalhes metálicos, cabelo moderno e volumoso, acessórios vampíricos, iluminação cinematográfica, alta qualidade, sem texto, sem logotipos, sem cortar cabeça, mãos ou pés.';
        const out=await cloudflareImage(prompt,4);
        const file=await saveSkinImage(u.id,'Skin NVB Cloudflare',out);
        db.skins[u.id] ||= {};
        db.skins[u.id].lastCreated={name:'Skin NVB Cloudflare',style:'Vampírico NVB',file,provider:'Cloudflare Workers AI',model:CLOUDFLARE_IMAGE_MODEL,createdAt:new Date().toISOString()};
        writeDb('skins');
        return safeReply(interaction,{content:'🦇 **SKIN NVB GERADA COM IA**\n☁️ Cloudflare Workers AI\n🎨 Estilo: Vampírico NVB',files:[{attachment:out,name:'skin-nvb-cloudflare.jpg'}],ephemeral:false});
      }catch(e){return safeReply(interaction,{content:`❌ Não foi possível gerar a skin: ${e.message}`,ephemeral:true});}
    }
    if(c==='criar-skin'){if(!await safeDefer(interaction,{ephemeral:false}))return;try{const name=interaction.options.getString('nome'),details=interaction.options.getString('detalhes');const out=await openAIImage(`Crie uma personagem inspirada em avatar de jogo estilo Roblox, corpo inteiro da cabeça aos pés, roupa, cabelo, acessórios e cores definidos por: ${details}. ${stylePrompt('Vampírico NVB')} Não cortar o personagem, sem texto.`);const file=await saveSkinImage(u.id,name,out);db.skins[u.id] ||= {};db.skins[u.id].lastCreated={name,details,file,createdAt:new Date().toISOString()};writeDb('skins');return safeReply(interaction,{content:`🎨 Skin **${name}** criada com IA.`,files:[{attachment:out,name:'skin-criada.png'}],ephemeral:false});}catch(e){return safeReply(interaction,{content:`❌ ${e.message}`,ephemeral:true});}}
    if(c==='editar-skin'||c==='melhorar-skin'){if(!await safeDefer(interaction,{ephemeral:false}))return;try{const name=interaction.options.getString('nome'),entry=db.skins[u.id]?.[name]||db.skins[u.id]?.lastCreated;if(!entry?.file||!fs.existsSync(entry.file))return safeReply(interaction,{content:'❌ Não encontrei a imagem dessa skin. Crie ou salve uma skin primeiro.',ephemeral:true});const details=c==='melhorar-skin'?'melhore detalhes, iluminação, acabamento, qualidade e composição mantendo o personagem reconhecível':interaction.options.getString('detalhes');const src=await fs.promises.readFile(entry.file);const out=await openAIImage(`Edite esta imagem mantendo o mesmo personagem e identidade visual. ${details}. Corpo inteiro, sem cortar, sem texto.`,src);const file=await saveSkinImage(u.id,name,out);entry.file=file;entry.updatedAt=new Date().toISOString();writeDb('skins');return safeReply(interaction,{content:`✨ Skin **${name}** ${c==='melhorar-skin'?'melhorada':'editada'} com IA.`,files:[{attachment:out,name:'skin-atualizada.png'}],ephemeral:false});}catch(e){return safeReply(interaction,{content:`❌ ${e.message}`,ephemeral:true});}}
    if(c==='skin-nvb'){if(!await safeDefer(interaction,{ephemeral:false}))return;try{const out=await openAIImage(`Crie uma skin de personagem estilo Roblox, corpo inteiro, tema oficial Nytheris Vampyre Bloodline: vampírico, dark castle, morcegos, roxo/azul/verde, elegante, detalhado, sem texto, sem corte.`);const file=await saveSkinImage(u.id,'Vampírico NVB',out);db.skins[u.id] ||= {};db.skins[u.id].lastCreated={name:'Vampírico NVB',style:'Vampírico NVB',file,createdAt:new Date().toISOString()};writeDb('skins');return safeReply(interaction,{content:'🦇 Skin Vampírico NVB criada.',files:[{attachment:out,name:'skin-nvb.png'}],ephemeral:false});}catch(e){return safeReply(interaction,{content:`❌ ${e.message}`,ephemeral:true});}}
    if(c==='salvar-skin'){const name=interaction.options.getString('nome'),last=db.skins[u.id]?.lastCreated;if(!last?.file||!fs.existsSync(last.file))return safeReply(interaction,{content:'❌ Nenhuma skin criada para salvar.',ephemeral:true});db.skins[u.id] ||= {};db.skins[u.id][name]={...last,name,savedAt:new Date().toISOString()};writeDb('skins');return safeReply(interaction,`💾 Skin **${name}** salva com sucesso.`);}
    if(c==='skins'){const s=db.skins[u.id]||{};const list=Object.entries(s).filter(([k])=>k!=='lastCreated');return safeReply(interaction,{content:list.length?`🎨 **Suas skins**\n${list.map(([k,v],i)=>`${i+1}. **${k}**${v.style?` — ${v.style}`:''}`).join('\n')}`:'🎨 Nenhuma skin salva.',ephemeral:true});}

    // Administração/comunidade
    if(['dar-cargo','remover-cargo','logs'].includes(c)&&!await guard(interaction,'admin'))return;
    if(c==='dar-cargo'||c==='remover-cargo'){const m=interaction.options.getMember('usuario'),role=interaction.options.getRole('cargo');if(!m||!role)return safeReply(interaction,{content:'❌ Membro/cargo inválido.',ephemeral:true});const ok=c==='dar-cargo'?await m.roles.add(role).then(()=>true).catch(()=>false):await m.roles.remove(role).then(()=>true).catch(()=>false);return safeReply(interaction,ok?`✅ Cargo ${role} ${c==='dar-cargo'?'adicionado a':'removido de'} ${m}.`:'❌ Não foi possível alterar o cargo.');}
    if(c==='logs'){const q=interaction.options.getInteger('quantidade')||10;return safeReply(interaction,{content:db.logs.slice(-q).reverse().map(x=>`• ${x.type} — <@${x.userId}> — ${new Date(x.at).toLocaleString('pt-BR')}`).join('\n')||'Nenhum log.',ephemeral:true});}
    if(c==='evento'){if(!await guard(interaction,'comunidade'))return;const nome=interaction.options.getString('nome');await interaction.channel.send({embeds:[new EmbedBuilder().setColor(0x8b5cf6).setTitle(`🦇 ${nome}`).setDescription(`Evento NVB criado por ${u}.`)]});addPoints(u.id,10,'evento');return safeReply(interaction,'🦇 Evento anunciado. +10 pontos.');}
    if(c==='jogatina'){if(!await guard(interaction,'comunidade'))return;return interaction.showModal(jogatinaModal());}
    if(c==='resenha'){if(!await guard(interaction,'comunidade'))return;return interaction.showModal(resenhaModal());}
    if(c==='chamada'){if(!await guard(interaction,'chamada'))return;return interaction.showModal(chamadaModal());}
    if(c==='presenca'){const call=activeCall(interaction.guildId);if(!call)return safeReply(interaction,{content:'❌ Não existe uma chamada aberta no momento.',ephemeral:true});return interaction.showModal(presenceModal(call.id));}
    if(c==='pontos-add'){if(!await guard(interaction,'pontosAdd'))return;const m=interaction.options.getUser('usuario'),q=interaction.options.getInteger('quantidade');return safeReply(interaction,`🪙 ${m} recebeu **${addPoints(m.id,q,interaction.options.getString('motivo')||'manual')} pontos**.`);}
    if(c==='pontos-remove'){if(!await guard(interaction,'pontosRemove'))return;const m=interaction.options.getUser('usuario'),q=interaction.options.getInteger('quantidade');return safeReply(interaction,removePoints(m.id,q,interaction.options.getString('motivo')||'manual')?`🪙 ${q} pontos removidos de ${m}.`:'❌ Pontos insuficientes.');}
    if(c==='recompensa'){if(!await guard(interaction,'recompensa'))return;const m=interaction.options.getUser('usuario'),nome=interaction.options.getString('nome'),q=interaction.options.getInteger('pontos');if(!removePoints(m.id,q,`recompensa ${nome}`))return safeReply(interaction,{content:'❌ Pontos insuficientes.',ephemeral:true});db.recompensas.push({userId:m.id,nome,pontos:q,at:new Date().toISOString()});writeDb('recompensas');return safeReply(interaction,`🎁 Recompensa **${nome}** registrada para ${m}.`);}
    if(c==='conquista-add'){if(!await guard(interaction,'conquista'))return;const m=interaction.options.getUser('usuario'),nome=interaction.options.getString('nome');db.conquistas[m.id] ||= [];db.conquistas[m.id].push(nome);writeDb('conquistas');return safeReply(interaction,`🏆 Conquista **${nome}** adicionada a ${m}.`);}
    if(c==='boasvindas'){if(!await guard(interaction,'automacao'))return;const ch=interaction.options.getChannel('canal');db.config.welcomeChannel=ch.id;writeDb('config');return safeReply(interaction,`✅ Canal de boas-vindas configurado: ${ch}.\nAs boas-vindas agora são automáticas quando alguém entrar.`);}

    return safeReply(interaction,{content:'❌ Comando não reconhecido.',ephemeral:true});
  }catch(e){console.error(`❌ Erro /${interaction.commandName||interaction.customId}:`,e);return safeReply(interaction,{content:`❌ Ocorreu um erro: ${e.message}` ,ephemeral:true}).catch(()=>{});}
});

// =========================
// APROVAÇÃO DE CANDIDATURAS DO SITE
// =========================
function candidatureButtons(id){return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`qg_cand_aprovar_${id}`).setLabel('🟢 Aprovar').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`qg_cand_recusar_${id}`).setLabel('🔴 Recusar').setStyle(ButtonStyle.Danger));}

// =========================
// BOAS-VINDAS AUTOMÁTICAS
// =========================
client.on('guildMemberAdd',async member=>{
  try{
    const channelId=db.config.welcomeChannel||process.env.WELCOME_CHANNEL_ID||member.guild.channels.cache.find(c=>c.isTextBased()&&/boas[- ]?vindas|welcome/i.test(c.name||''))?.id; if(!channelId)return;
    const ch=await member.guild.channels.fetch(channelId).catch(()=>null);if(!ch?.isTextBased())return;
    const rb=await getMemberRoblox(member).catch(()=>null);const card=await makeWelcomeCard(member,rb).catch(()=>null);
    const e=new EmbedBuilder().setColor(0x8b5cf6).setTitle('🦇 NOVO MEMBRO NA NVB!').setDescription(`Seja bem-vindo(a), ${member}!\n\n🎮 **Roblox:** ${rb?.username||'Não vinculado'}\n🩸 **Nytheris Vampyre Bloodline**\n\nUma linhagem que acolhe. Uma família que permanece.`).setThumbnail(rb?.avatarUrl||member.user.displayAvatarURL({size:512})).setFooter({text:'NVB • Novo membro'}).setTimestamp();
    if(card)await ch.send({content:`🦇 Bem-vindo(a) à NVB, ${member}!`,embeds:[e],files:[{attachment:card,name:'nvb-boas-vindas.png'}]}).catch(()=>{});else await ch.send({content:`🦇 Bem-vindo(a) à NVB, ${member}!`,embeds:[e]}).catch(()=>{});
  }catch(e){console.error('❌ Boas-vindas:',e.message);}
});

// =========================
// QG WEB
// =========================
const qgSessions=new Map();
function createQGSession(user){const token=crypto.randomBytes(32).toString('hex');qgSessions.set(token,{...user,createdAt:Date.now()});return token;}
function getQGSession(req){const h=String(req.headers.authorization||'');if(!h.startsWith('Bearer '))return null;const s=qgSessions.get(h.slice(7));if(!s)return null;if(Date.now()-s.createdAt>7*86400000){qgSessions.delete(h.slice(7));return null}return s;}
const app=express();app.use(express.json({limit:'10mb'}));app.use(express.static(__dirname));
app.get('/api/status',(req,res)=>res.json({ok:true,bot:client.user?.tag||'NVB BOT',online:client.isReady(),commands:commands.length}));
app.post('/api/recruitment',async(req,res)=>{try{const body=req.body&&typeof req.body==='object'?req.body:{};const discordId=String(body.discordId||'').trim();const id=`R${Date.now().toString(36).toUpperCase()}`;const item={...body,discordId,id,status:'Em análise',data:new Date().toISOString()};db.recrutamentos.push(item);writeDb('recrutamentos');const fields=Object.entries(body).filter(([,v])=>String(v??'').trim()).slice(0,20).map(([k,v])=>({name:String(k).slice(0,256),value:String(v).slice(0,1024),inline:false}));const e=new EmbedBuilder().setColor(0x8b5cf6).setTitle('🩸 NOVO RECRUTAMENTO NVB').setDescription(`**ID:** ${id}\n**Status:** Em análise`).addFields(fields.length?fields:[{name:'Ficha',value:'Sem dados.'}]).setTimestamp();const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`qg_recrut_aprovar_${id}`).setLabel('🟢 Aprovar').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`qg_recrut_recusar_${id}`).setLabel('🔴 Recusar').setStyle(ButtonStyle.Danger));const sent=await sendToChannel('RECRUT_CHANNEL_ID',{embeds:[e],components:[row]});res.json({ok:true,id,sent});}catch(e){console.error(e);res.status(500).json({ok:false,error:'Não foi possível enviar o recrutamento.'});}});
app.post('/api/candidature',async(req,res)=>{try{const body=req.body&&typeof req.body==='object'?req.body:{};const id=`C${Date.now().toString(36).toUpperCase()}`;const item={...body,id,userId:body.userId||'',status:'pendente',at:new Date().toISOString()};db.candidaturas.push(item);writeDb('candidaturas');const e=new EmbedBuilder().setColor(0x8b5cf6).setTitle('📋 NOVA CANDIDATURA NVB').setDescription(`**ID:** ${id}\n**Cargo solicitado:** ${roleNames[item.cargo]||item.cargo||'Não informado'}`).addFields(Object.entries(body).filter(([,v])=>String(v??'').trim()).slice(0,20).map(([k,v])=>({name:String(k).slice(0,256),value:String(v).slice(0,1024),inline:false}))).setTimestamp();const sent=await sendToChannel('CANDIDATURA_CHANNEL_ID',{embeds:[e],components:[candidatureButtons(id)]});res.json({ok:true,id,sent});}catch(e){console.error(e);res.status(500).json({ok:false,error:'Não foi possível enviar a candidatura.'});}});
app.post('/api/login',async(req,res)=>{try{const discord=String(req.body?.discord||'').trim(),principal=String(req.body?.principal||'').trim(),codigo=String(req.body?.codigo||'').trim().toUpperCase();if(!discord||!principal||!codigo)return res.status(400).json({ok:false,error:'Preencha Discord, principal do Discord e código.'});let valid=db.codes[codigo];if(!valid){const rec=[...db.recrutamentos].reverse().find(x=>x.status==='Aprovado'&&String(x.codigoEntrada||'').toUpperCase()===codigo);if(rec){valid={...rec,discordId:rec.discordId||rec.userId||'',cargo:rec.cargo||'⚪ [MBRS] Membro',status:'Ativo'};db.codes[codigo]=valid;writeDb('codes');}}if(!valid)return res.status(401).json({ok:false,error:'Código de entrada inválido.'});if(valid.discord&&normalizeQG(valid.discord)!==normalizeQG(discord))return res.status(401).json({ok:false,error:'Discord não corresponde ao código.'});if(valid.principal&&normalizeQG(valid.principal)!==normalizeQG(principal))return res.status(401).json({ok:false,error:'Principal do Discord não corresponde ao código.'});const guild=client.guilds.cache.get(GUILD_ID)||client.guilds.cache.first();const member=valid.discordId&&guild?await guild.members.fetch(valid.discordId).catch(()=>null):null;const r=valid.discordId?db.roblox[valid.discordId]:null;const user={userId:valid.discordId||'',discord:member?.user?.username||valid.discord||discord,principal:valid.principal||principal,roblox:r?.username||valid.roblox||'',cargo:memberRoleLabel(member)||valid.cargo,status:'Ativo',roles:nvRoles(member).map(x=>x.replace(/[<>@&]/g,'')),points:Number(db.pontos[valid.discordId]||0),level:level(db.xp[valid.discordId]||0),xp:Number(db.xp[valid.discordId]||0),achievements:(db.conquistas[valid.discordId]||[]).length,ranking:rankPosition(valid.discordId)};res.json({ok:true,token:createQGSession(user),user});}catch(e){console.error('❌ /api/login',e);res.status(500).json({ok:false,error:'Não foi possível entrar no QG agora.'});}});
app.post('/api/communication',async(req,res)=>{try{const s=getQGSession(req)||req.body?.user||{};const body=req.body||{};const map={'Chat Geral':'CHAT_GERAL_CHANNEL_ID','Anúncios':'ANUNCIOS_CHANNEL_ID','Enquetes':'ENQUETES_CHANNEL_ID','Opiniões':'OPINIOES_CHANNEL_ID'};const e=new EmbedBuilder().setColor(0x8b5cf6).setTitle(body.titulo||'Comunicação NVB').addFields({name:'Assunto',value:String(body.assunto||'')},{name:'Descrição',value:String(body.descricao||'')},{name:'Usuário',value:String(s.discord||body.discord||'Membro NVB')}).setTimestamp();const sent=await sendToChannel(map[body.canal]||'CHAT_GERAL_CHANNEL_ID',{embeds:[e]});res.json({ok:true,sent});}catch(e){res.status(500).json({ok:false,error:'Falha ao enviar comunicação.'});}});
app.get('/api/ranking',(req,res)=>{const guild=client.guilds.cache.get(GUILD_ID)||client.guilds.cache.first();const ranking=Object.entries(db.pontos).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,50).map(([id,p])=>({id,name:guild?.members?.cache?.get(id)?.user?.username||id,points:Number(p)}));res.json({ok:true,ranking});});
app.post('/api/points/donate',async(req,res)=>{try{const s=getQGSession(req)||req.body?.user||{},amount=Math.max(1,Number(req.body?.quantidade||0)),target=String(req.body?.membro||'');const from=s.userId;if(!from||!amount||Number(db.pontos[from]||0)<amount)return res.status(400).json({ok:false,error:'Pontos insuficientes.'});const guild=client.guilds.cache.get(GUILD_ID)||client.guilds.cache.first();const member=guild?.members.cache.find(m=>m.id===target||normalizeQG(m.user.username)===normalizeQG(target));if(!member)return res.status(404).json({ok:false,error:'Membro não encontrado.'});removePoints(from,amount,'doação');addPoints(member.id,amount,`doação de ${from}`);res.json({ok:true});}catch(e){res.status(500).json({ok:false,error:'Falha na transferência.'});}});
app.post('/api/support',async(req,res)=>{const q=String(req.body?.pergunta||'').trim();if(!q)return res.status(400).json({ok:false,answer:'Digite uma pergunta.'});const answer='Recebemos sua pergunta. A equipe NVB poderá continuar o atendimento pelo canal de suporte.';await sendToChannel('SUPPORT_CHANNEL_ID',{embeds:[new EmbedBuilder().setColor(0x8b5cf6).setTitle('🆘 SUPORTE NVB').setDescription(q).setFooter({text:`De: ${req.body?.user?.discord||'Membro'}`}).setTimestamp()]});res.json({ok:true,answer});});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.listen(PORT,()=>console.log(`🌐 QG NVB na porta ${PORT}`));

client.once('ready',async()=>{console.log(`🦇 NVB BOT online: ${client.user.tag}`);try{await registerCommands();}catch(e){console.error('❌ Erro ao registrar comandos:',e);}});
client.login(TOKEN).catch(e=>console.error('❌ Falha no login do Discord:',e.message));
