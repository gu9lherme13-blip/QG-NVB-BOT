require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  Client, GatewayIntentBits, Partials, REST, Routes,
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || '';
const PORT = Number(process.env.PORT || 10000);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ DISCORD_TOKEN e CLIENT_ID são obrigatórios no Render.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
});

// =========================
// BANCO JSON
// =========================
const DB_DIR = path.join(__dirname, 'database');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

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
  historico: readJson('historico.json', {})
};
function saveAll() {
  for (const [k, v] of Object.entries(db)) writeJson(`${k}.json`, v);
}
function logAction(type, userId, details = {}) {
  db.logs.push({ type, userId, details, at: new Date().toISOString() });
  if (db.logs.length > 1000) db.logs.shift();
  writeJson('logs.json', db.logs);
}
function addPoints(id, amount, reason = '') {
  db.pontos[id] = Math.max(0, Number(db.pontos[id] || 0) + Number(amount));
  db.xp[id] = Math.max(0, Number(db.xp[id] || 0) + Math.max(0, Number(amount)));
  writeJson('pontos.json', db.pontos); writeJson('xp.json', db.xp);
  logAction('pontos', id, { amount, reason });
  return db.pontos[id];
}
function removePoints(id, amount, reason = '') {
  const current = Number(db.pontos[id] || 0);
  if (current < amount) return false;
  db.pontos[id] = current - Number(amount);
  writeJson('pontos.json', db.pontos);
  logAction('pontos_remove', id, { amount, reason });
  return true;
}
function level(xp) {
  const x = Number(xp || 0);
  return Math.max(1, Math.floor(x / 100) + 1);
}

// =========================
// CARGOS / PERMISSÕES
// =========================
const roleIds = {
  LDR: process.env.ROLE_LDR || '',
  'SB-LDR': process.env.ROLE_SB_LDR || '',
  ADM: process.env.ROLE_ADM || '',
  CMDT: process.env.ROLE_CMDT || '',
  MOD: process.env.ROLE_MOD || '',
  SUP: process.env.ROLE_SUP || '',
  ORG: process.env.ROLE_ORG || '',
  REC: process.env.ROLE_REC || ''
};

const allowed = {
  recrutamento: ['REC','SUP','MOD','CMDT','ADM','SB-LDR','LDR'],
  candidaturas: ['REC','MOD','CMDT','ADM','SB-LDR','LDR'],
  aprovar: ['REC','CMDT','ADM','SB-LDR','LDR'],
  recusar: ['REC','CMDT','ADM','SB-LDR','LDR'],
  moderacao: ['MOD','CMDT','ADM','SB-LDR','LDR'],
  expulsar: ['CMDT','ADM','SB-LDR','LDR'],
  banir: ['ADM','SB-LDR','LDR'],
  admin: ['ADM','SB-LDR','LDR'],
  anunciar: ['ADM','CMDT','SB-LDR','LDR'],
  comunidade: ['ORG','CMDT','ADM'],
  chamada: ['ORG','REC','CMDT','ADM'],
  pontosAdd: ['ORG','REC','CMDT','ADM'],
  pontosRemove: ['CMDT','ADM','SB-LDR','LDR'],
  recompensa: ['ADM','CMDT','SB-LDR','LDR'],
  conquista: ['ORG','CMDT','ADM'],
  automacao: ['ADM','SB-LDR','LDR'],
  verificacao: ['ADM','CMDT','SB-LDR','LDR'],
  chamadaAuto: ['ADM','CMDT','ORG']
};
function hasRole(member, names) {
  if (!member?.roles?.cache) return false;
  return names.some(name => roleIds[name] && member.roles.cache.has(roleIds[name]));
}
function can(interaction, group) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  return hasRole(interaction.member, allowed[group] || []);
}
async function safeReply(interaction, payload) {
  try {
    if (interaction.replied) return await interaction.followUp(payload);
    if (interaction.deferred) return await interaction.editReply(payload);
    return await interaction.reply(payload);
  } catch (e) {
    if (e?.code === 10062 || e?.code === 10015) {
      console.warn('⚠️ Interação Discord expirada/desconhecida:', interaction.commandName);
      return null;
    }
    throw e;
  }
}

async function safeDefer(interaction, options = {}) {
  try {
    if (!interaction.replied && !interaction.deferred) await interaction.deferReply(options);
    return true;
  } catch (e) {
    if (e?.code === 10062 || e?.code === 10015) {
      console.warn('⚠️ Interação Discord expirou antes do defer:', interaction.commandName);
      return false;
    }
    throw e;
  }
}

async function guard(interaction, group) {
  if (can(interaction, group)) return true;
  await safeReply(interaction, { content: '❌ Você não possui o cargo necessário para usar este comando.', ephemeral: true });
  return false;
}

function optionUser(name = 'usuario', description = 'Membro do servidor', required = true) {
  return o => o.setName(name).setDescription(description).setRequired(required);
}

// =========================
// 65 COMANDOS OFICIAIS
// =========================
const commands = [
  new SlashCommandBuilder().setName('nvb').setDescription('🦇 Abre o painel principal da NVB'),
  new SlashCommandBuilder().setName('perfil').setDescription('Mostra seu perfil NVB'),
  new SlashCommandBuilder().setName('roblox').setDescription('Mostra seu Roblox'),
  new SlashCommandBuilder().setName('avatar').setDescription('Mostra seu avatar'),
  new SlashCommandBuilder().setName('cargos').setDescription('Mostra seus cargos'),
  new SlashCommandBuilder().setName('conquistas').setDescription('Mostra suas conquistas'),
  new SlashCommandBuilder().setName('nivel').setDescription('Mostra seu nível'),
  new SlashCommandBuilder().setName('pontos').setDescription('Mostra seus pontos'),
  new SlashCommandBuilder().setName('ranking').setDescription('Mostra o ranking de pontos'),
  new SlashCommandBuilder().setName('ajuda').setDescription('Mostra a ajuda da NVB'),

  new SlashCommandBuilder().setName('recrutamento').setDescription('Abre o sistema de recrutamento'),
  new SlashCommandBuilder().setName('candidatura').setDescription('Envia uma candidatura'),
  new SlashCommandBuilder().setName('candidaturas').setDescription('Lista as candidaturas'),
  new SlashCommandBuilder().setName('aprovar').setDescription('Aprova uma candidatura').addStringOption(o=>o.setName('id').setDescription('ID da candidatura').setRequired(true)),
  new SlashCommandBuilder().setName('recusar').setDescription('Recusa uma candidatura').addStringOption(o=>o.setName('id').setDescription('ID da candidatura').setRequired(true)),
  new SlashCommandBuilder().setName('status').setDescription('Consulta uma candidatura').addStringOption(o=>o.setName('id').setDescription('ID da candidatura').setRequired(false)),

  new SlashCommandBuilder().setName('aviso').setDescription('Aplica um aviso').addUserOption(optionUser()).addStringOption(o=>o.setName('motivo').setDescription('Motivo').setRequired(true)),
  new SlashCommandBuilder().setName('silenciar').setDescription('Silencia um membro').addUserOption(optionUser()).addIntegerOption(o=>o.setName('minutos').setDescription('Duração em minutos').setMinValue(1).setMaxValue(10080).setRequired(true)),
  new SlashCommandBuilder().setName('dessilenciar').setDescription('Remove o silenciamento').addUserOption(optionUser()),
  new SlashCommandBuilder().setName('expulsar').setDescription('Expulsa um membro').addUserOption(optionUser()).addStringOption(o=>o.setName('motivo').setDescription('Motivo').setRequired(false)),
  new SlashCommandBuilder().setName('banir').setDescription('Bane um membro').addUserOption(optionUser()).addStringOption(o=>o.setName('motivo').setDescription('Motivo').setRequired(false)),
  new SlashCommandBuilder().setName('desbanir').setDescription('Remove um banimento').addStringOption(o=>o.setName('id').setDescription('ID do usuário').setRequired(true)),
  new SlashCommandBuilder().setName('limpar').setDescription('Limpa mensagens').addIntegerOption(o=>o.setName('quantidade').setDescription('Quantidade').setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName('trancar').setDescription('Tranca o canal atual'),
  new SlashCommandBuilder().setName('destrancar').setDescription('Destranca o canal atual'),
  new SlashCommandBuilder().setName('historico').setDescription('Consulta o histórico de moderação').addUserOption(o=>o.setName('usuario').setDescription('Membro').setRequired(false)),

  new SlashCommandBuilder().setName('skin').setDescription('Mostra a skin atual'),
  new SlashCommandBuilder().setName('skin-ia').setDescription('Gera uma skin visual com IA').addStringOption(o=>o.setName('estilo').setDescription('Estilo desejado').setRequired(true)),
  new SlashCommandBuilder().setName('criar-skin').setDescription('Cria uma skin').addStringOption(o=>o.setName('nome').setDescription('Nome da skin').setRequired(true)).addStringOption(o=>o.setName('estilo').setDescription('Estilo').setRequired(true)),
  new SlashCommandBuilder().setName('editar-skin').setDescription('Edita sua skin').addStringOption(o=>o.setName('nome').setDescription('Nome').setRequired(true)).addStringOption(o=>o.setName('detalhes').setDescription('Novos detalhes').setRequired(true)),
  new SlashCommandBuilder().setName('analisar-skin').setDescription('Analisa uma skin').addStringOption(o=>o.setName('nome').setDescription('Nome da skin').setRequired(false)),
  new SlashCommandBuilder().setName('melhorar-skin').setDescription('Sugere melhorias para uma skin').addStringOption(o=>o.setName('nome').setDescription('Nome da skin').setRequired(false)),
  new SlashCommandBuilder().setName('skin-nvb').setDescription('Aplica o conceito visual NVB'),
  new SlashCommandBuilder().setName('template-skin').setDescription('Mostra informações do template NVB'),
  new SlashCommandBuilder().setName('avaliar-skin').setDescription('Avalia uma skin').addStringOption(o=>o.setName('nome').setDescription('Nome da skin').setRequired(false)),
  new SlashCommandBuilder().setName('salvar-skin').setDescription('Salva uma skin').addStringOption(o=>o.setName('nome').setDescription('Nome').setRequired(true)).addStringOption(o=>o.setName('dados').setDescription('Dados da skin').setRequired(true)),
  new SlashCommandBuilder().setName('skins').setDescription('Lista suas skins'),
  new SlashCommandBuilder().setName('skin-atual').setDescription('Mostra sua skin atual'),
  new SlashCommandBuilder().setName('skin-random').setDescription('Escolhe um estilo aleatório'),
  new SlashCommandBuilder().setName('skin-personalizada').setDescription('Cria uma skin personalizada').addStringOption(o=>o.setName('descricao').setDescription('Descrição').setRequired(true)),

  new SlashCommandBuilder().setName('cargo').setDescription('Consulta seus cargos'),
  new SlashCommandBuilder().setName('dar-cargo').setDescription('Dá um cargo').addUserOption(optionUser()).addRoleOption(o=>o.setName('cargo').setDescription('Cargo').setRequired(true)),
  new SlashCommandBuilder().setName('remover-cargo').setDescription('Remove um cargo').addUserOption(optionUser()).addRoleOption(o=>o.setName('cargo').setDescription('Cargo').setRequired(true)),
  new SlashCommandBuilder().setName('setcargo').setDescription('Define um cargo do sistema').addStringOption(o=>o.setName('nome').setDescription('Nome interno').setRequired(true)).addRoleOption(o=>o.setName('cargo').setDescription('Cargo do Discord').setRequired(true)),
  new SlashCommandBuilder().setName('config').setDescription('Mostra a configuração do bot'),
  new SlashCommandBuilder().setName('logs').setDescription('Mostra os últimos logs').addIntegerOption(o=>o.setName('quantidade').setDescription('Quantidade').setMinValue(1).setMaxValue(20).setRequired(false)),
  new SlashCommandBuilder().setName('painel').setDescription('Abre o painel administrativo'),
  new SlashCommandBuilder().setName('anunciar').setDescription('Envia um anúncio').addStringOption(o=>o.setName('titulo').setDescription('Título').setRequired(true)).addStringOption(o=>o.setName('mensagem').setDescription('Mensagem').setRequired(true)),
  new SlashCommandBuilder().setName('embed').setDescription('Envia um embed').addStringOption(o=>o.setName('titulo').setDescription('Título').setRequired(true)).addStringOption(o=>o.setName('descricao').setDescription('Descrição').setRequired(true)),

  new SlashCommandBuilder().setName('evento').setDescription('Cria um evento').addStringOption(o=>o.setName('nome').setDescription('Nome').setRequired(true)),
  new SlashCommandBuilder().setName('jogatina').setDescription('Registra uma jogatina').addStringOption(o=>o.setName('jogo').setDescription('Jogo').setRequired(true)),
  new SlashCommandBuilder().setName('resenha').setDescription('Registra uma resenha').addStringOption(o=>o.setName('tema').setDescription('Tema').setRequired(true)),
  new SlashCommandBuilder().setName('chamada').setDescription('Faz uma chamada'),
  new SlashCommandBuilder().setName('presenca').setDescription('Registra sua presença'),
  new SlashCommandBuilder().setName('pontos-add').setDescription('Adiciona pontos').addUserOption(optionUser()).addIntegerOption(o=>o.setName('quantidade').setDescription('Pontos').setMinValue(1).setRequired(true)).addStringOption(o=>o.setName('motivo').setDescription('Motivo').setRequired(false)),
  new SlashCommandBuilder().setName('pontos-remove').setDescription('Remove pontos').addUserOption(optionUser()).addIntegerOption(o=>o.setName('quantidade').setDescription('Pontos').setMinValue(1).setRequired(true)).addStringOption(o=>o.setName('motivo').setDescription('Motivo').setRequired(false)),
  new SlashCommandBuilder().setName('recompensa').setDescription('Registra uma recompensa').addUserOption(optionUser()).addStringOption(o=>o.setName('nome').setDescription('Recompensa').setRequired(true)).addIntegerOption(o=>o.setName('pontos').setDescription('Custo em pontos').setMinValue(0).setRequired(true)),
  new SlashCommandBuilder().setName('conquista-add').setDescription('Adiciona uma conquista').addUserOption(optionUser()).addStringOption(o=>o.setName('nome').setDescription('Conquista').setRequired(true)),

  new SlashCommandBuilder().setName('boasvindas').setDescription('Configura boas-vindas').addChannelOption(o=>o.setName('canal').setDescription('Canal').setRequired(true)),
  new SlashCommandBuilder().setName('entrada').setDescription('Configura mensagem de entrada').addStringOption(o=>o.setName('mensagem').setDescription('Mensagem').setRequired(true)),
  new SlashCommandBuilder().setName('saida').setDescription('Configura mensagem de saída').addStringOption(o=>o.setName('mensagem').setDescription('Mensagem').setRequired(true)),
  new SlashCommandBuilder().setName('autocargo').setDescription('Configura cargo automático').addRoleOption(o=>o.setName('cargo').setDescription('Cargo').setRequired(true)),
  new SlashCommandBuilder().setName('verificacao').setDescription('Configura verificação').addChannelOption(o=>o.setName('canal').setDescription('Canal').setRequired(true)),
  new SlashCommandBuilder().setName('chamada-auto').setDescription('Configura chamada automática').addChannelOption(o=>o.setName('canal').setDescription('Canal').setRequired(true)),
  new SlashCommandBuilder().setName('anuncio-auto').setDescription('Configura anúncio automático').addChannelOption(o=>o.setName('canal').setDescription('Canal').setRequired(true))
].map(c => c.toJSON());

if (commands.length !== 65) {
  throw new Error(`Quantidade de comandos incorreta: ${commands.length}. Esperado: 65.`);
}

// =========================
// REGISTRO
// =========================
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(
    GUILD_ID ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID) : Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  );
  console.log(`✅ ${commands.length} comandos NVB registrados.`);
}

async function sendToConfiguredChannel(envName, payload) {
  const id = process.env[envName];
  if (!id) return false;
  const ch = await client.channels.fetch(id).catch(() => null);
  if (!ch || !ch.isTextBased()) return false;
  await ch.send(payload).catch(() => null);
  return true;
}

async function modHistory(userId, action, details) {
  db.historico[userId] ||= [];
  db.historico[userId].push({ action, details, at: new Date().toISOString() });
  writeJson('historico.json', db.historico);
}

// =========================
// COMANDOS
// =========================
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const c = interaction.commandName;
  const u = interaction.user;

  try {
    // Toda interação é reconhecida imediatamente para evitar DiscordAPIError 10062.
    if (!await safeDefer(interaction, { ephemeral: true })) return;

    // ----- MEMBRO -----
    if (c === 'nvb') {
      const embed = new EmbedBuilder().setColor(0x7c3aed).setTitle('🦇 QG NVB').setDescription('**Nytheris Vampyre Bloodline**\nUma linhagem que acolhe. Uma família que permanece.\n\nUse os comandos oficiais do NVB para acessar seu perfil, pontos, Roblox e sistemas da comunidade.');
      return safeReply(interaction, { embeds: [embed], ephemeral: true });
    }
    if (c === 'perfil') {
      const r = db.roblox[u.id];
      const embed = new EmbedBuilder().setColor(0xa855f7).setTitle('🪪 PERFIL NVB').setThumbnail(u.displayAvatarURL()).addFields(
        { name: '👤 Discord', value: `${u}`, inline: true },
        { name: '🎮 Roblox', value: r?.username || 'Não vinculado', inline: true },
        { name: '⭐ Nível', value: String(level(db.xp[u.id] || 0)), inline: true },
        { name: '🪙 Pontos', value: String(db.pontos[u.id] || 0), inline: true }
      );
      return safeReply(interaction, { embeds: [embed], ephemeral: true });
    }
    if (c === 'roblox') {
      const r = db.roblox[u.id];
      return safeReply(interaction, { content: r ? `🎮 Roblox: **${r.username}**\n🆔 ID: ${r.id}${r.avatarUrl ? `\n🖼️ ${r.avatarUrl}` : ''}` : '❌ Nenhuma conta Roblox vinculada ainda.', ephemeral: true });
    }
    if (c === 'avatar') {
      return safeReply(interaction, { content: `🖼️ Seu avatar do Discord:\n${u.displayAvatarURL({ size: 1024 })}`, ephemeral: true });
    }
    if (c === 'cargos' || c === 'cargo') {
      const member = interaction.member;
      return safeReply(interaction, { content: `🏷️ Seus cargos:\n${member?.roles?.cache?.filter(r => r.id !== interaction.guild?.id).map(r => r.toString()).join(', ') || 'Nenhum'}`, ephemeral: true });
    }
    if (c === 'conquistas') {
      const list = db.conquistas[u.id] || [];
      return safeReply(interaction, { content: list.length ? `🏆 Suas conquistas:\n${list.map(x => `• ${x}`).join('\n')}` : '🏆 Você ainda não possui conquistas.', ephemeral: true });
    }
    if (c === 'nivel') return safeReply(interaction, { content: `⭐ Nível **${level(db.xp[u.id] || 0)}**\nXP: **${db.xp[u.id] || 0}**`, ephemeral: true });
    if (c === 'pontos') return safeReply(interaction, { content: `🪙 Você possui **${db.pontos[u.id] || 0} pontos**.`, ephemeral: true });
    if (c === 'ranking') {
      const top = Object.entries(db.pontos).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,10);
      return safeReply(interaction, { content: top.length ? `🏆 **Ranking NVB**\n${top.map(([id,p],i)=>`${i+1}. <@${id}> — ${p} 🪙`).join('\n')}` : '🏆 Ainda não há pontos registrados.', ephemeral: true });
    }
    if (c === 'ajuda') {
      const text = commands.map(x => `/${x.name}`).join(' • ');
      return safeReply(interaction, { content: `🦇 **Comandos NVB — ${commands.length}**\n${text}`, ephemeral: true });
    }

    // ----- RECRUTAMENTO -----
    if (c === 'recrutamento') {
      if (!await guard(interaction,'recrutamento')) return;
      const embed = new EmbedBuilder().setColor(0x8b5cf6).setTitle('🩸 RECRUTAMENTO NVB').setDescription('O recrutamento está aberto. Interessados podem usar `/candidatura`.');
      await sendToConfiguredChannel('RECRUT_CHANNEL_ID', { embeds: [embed] });
      return safeReply(interaction, { embeds: [embed], ephemeral: true });
    }
    if (c === 'candidatura') {
      const id = `C${Date.now().toString(36).toUpperCase()}`;
      const item = { id, userId:u.id, userTag:u.tag, status:'pendente', at:new Date().toISOString() };
      db.candidaturas.push(item); writeJson('candidaturas.json', db.candidaturas);
      const embed = new EmbedBuilder().setColor(0x7c3aed).setTitle('📋 NOVA CANDIDATURA').addFields({name:'ID',value:id},{name:'Candidato',value:`${u} (${u.id})`},{name:'Status',value:'Pendente'});
      await sendToConfiguredChannel('CANDIDATURA_CHANNEL_ID',{embeds:[embed]});
      return safeReply(interaction, { content:`✅ Candidatura enviada! Seu ID é **${id}**.`, ephemeral:true });
    }
    if (c === 'candidaturas') {
      if (!await guard(interaction,'candidaturas')) return;
      const list = db.candidaturas.slice(-15).reverse();
      return safeReply(interaction, { content:list.length ? list.map(x=>`**${x.id}** — <@${x.userId}> — ${x.status}`).join('\n') : '📋 Nenhuma candidatura registrada.', ephemeral:true });
    }
    if (c === 'aprovar' || c === 'recusar') {
      if (!await guard(interaction,c)) return;
      const id = interaction.options.getString('id');
      const item = db.candidaturas.find(x=>x.id===id);
      if (!item) return safeReply(interaction, {content:'❌ Candidatura não encontrada.',ephemeral:true});
      item.status = c === 'aprovar' ? 'aprovada' : 'recusada'; item.updatedAt = new Date().toISOString();
      writeJson('candidaturas.json',db.candidaturas); logAction(c, u.id, {candidate:item.userId,id});
      const member = await interaction.guild.members.fetch(item.userId).catch(()=>null);
      if (member) await member.send(`🩸 Sua candidatura **${id}** na NVB foi **${item.status}**.`).catch(()=>null);
      return safeReply(interaction, {content:`✅ Candidatura **${id}** marcada como **${item.status}**.`,ephemeral:true});
    }
    if (c === 'status') {
      const id = interaction.options.getString('id');
      const item = id ? db.candidaturas.find(x=>x.id===id) : [...db.candidaturas].reverse().find(x=>x.userId===u.id);
      return safeReply(interaction, {content:item ? `📋 **${item.id}** — ${item.status}` : '❌ Nenhuma candidatura encontrada.',ephemeral:true});
    }

    // ----- MODERAÇÃO -----
    if (['aviso','silenciar','dessilenciar','limpar','trancar','destrancar','historico'].includes(c) && !await guard(interaction,'moderacao')) return;
    if (c === 'aviso') {
      const m = interaction.options.getMember('usuario'); const reason=interaction.options.getString('motivo');
      if (!m) return safeReply(interaction, {content:'❌ Membro não encontrado.',ephemeral:true});
      db.avisos[m.id] ||= []; db.avisos[m.id].push({by:u.id,reason,at:new Date().toISOString()}); writeJson('avisos.json',db.avisos); await modHistory(m.id,'aviso',reason); logAction('aviso',u.id,{target:m.id,reason});
      return safeReply(interaction, `⚠️ ${m} recebeu um aviso. Motivo: **${reason}**`);
    }
    if (c === 'silenciar') {
      const m=interaction.options.getMember('usuario'); const min=interaction.options.getInteger('minutos');
      if (!m?.moderatable) return safeReply(interaction, {content:'❌ Não consigo silenciar esse membro.',ephemeral:true});
      await m.timeout(min*60000,'NVB - silenciamento').catch(e=>null); await modHistory(m.id,'silenciar',`${min} minutos`);
      return safeReply(interaction, `🔇 ${m} foi silenciado por **${min} minutos**.`);
    }
    if (c === 'dessilenciar') { const m=interaction.options.getMember('usuario'); if(!m?.moderatable)return safeReply(interaction, {content:'❌ Não consigo alterar esse membro.',ephemeral:true}); await m.timeout(null,'NVB - dessilenciar').catch(()=>null); return safeReply(interaction, `🔊 Silenciamento removido de ${m}.`); }
    if (c === 'expulsar') { if(!await guard(interaction,'expulsar'))return; const m=interaction.options.getMember('usuario'); if(!m?.kickable)return safeReply(interaction, {content:'❌ Não consigo expulsar esse membro.',ephemeral:true}); await m.kick(interaction.options.getString('motivo')||'NVB').catch(()=>null); return safeReply(interaction, `👢 ${m.user.tag} foi expulso.`); }
    if (c === 'banir') { if(!await guard(interaction,'banir'))return; const m=interaction.options.getMember('usuario'); if(!m?.bannable)return safeReply(interaction, {content:'❌ Não consigo banir esse membro.',ephemeral:true}); await m.ban({reason:interaction.options.getString('motivo')||'NVB'}).catch(()=>null); return safeReply(interaction, `🔨 ${m.user.tag} foi banido.`); }
    if (c === 'desbanir') { if(!await guard(interaction,'banir'))return; const id=interaction.options.getString('id'); await interaction.guild.bans.remove(id,'NVB').catch(()=>null); return safeReply(interaction, `✅ Banimento de **${id}** removido.`); }
    if (c === 'limpar') { const n=interaction.options.getInteger('quantidade'); const msgs=await interaction.channel.bulkDelete(n,true); return safeReply(interaction, {content:`🧹 ${msgs.size} mensagens removidas.`,ephemeral:true}); }
    if (c === 'trancar' || c === 'destrancar') { const locked=c==='trancar'; await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone,{SendMessages:!locked}).catch(()=>null); return safeReply(interaction, locked?'🔒 Canal trancado.':'🔓 Canal destrancado.'); }
    if (c === 'historico') { const m=interaction.options.getUser('usuario')||u; const h=db.historico[m.id]||[]; return safeReply(interaction, {content:h.length?h.slice(-10).map(x=>`• ${x.action} — ${x.details} — ${x.at}`).join('\n'):'Nenhum histórico registrado.',ephemeral:true}); }

    // ----- SKINS / ROBLOX -----
    const skinCommands=['skin','skin-ia','criar-skin','editar-skin','analisar-skin','melhorar-skin','skin-nvb','template-skin','avaliar-skin','salvar-skin','skins','skin-atual','skin-random','skin-personalizada'];
    if (skinCommands.includes(c)) {
      db.skins[u.id] ||= {};
      if (c === 'skin') return safeReply(interaction, {content:db.skins[u.id].current?`🎮 Skin atual: **${db.skins[u.id].current}**`:'🎮 Você ainda não definiu uma skin.',ephemeral:true});
      if (c === 'skins') { const names=Object.keys(db.skins[u.id]); return safeReply(interaction, {content:names.length?`🎨 Suas skins: ${names.join(', ')}`:'🎨 Nenhuma skin salva.',ephemeral:true}); }
      if (c === 'skin-atual') return safeReply(interaction, {content:`🎮 Skin atual: **${db.skins[u.id].current||'nenhuma'}**`,ephemeral:true});
      if (c === 'skin-random') { const styles=['Original','Dark','Dark Neon','Dark Roxo','Vampírico NVB','Anime','Gótico','Cinemático','Cyberpunk','Noite Vampírica','Anjo Dark','Metálico']; const s=styles[Math.floor(Math.random()*styles.length)]; db.skins[u.id].current=s; writeJson('skins.json',db.skins); return safeReply(interaction, `🎲 Sua skin aleatória agora é **${s}**.`); }
      if (c === 'skin-nvb') { db.skins[u.id].current='Vampírico NVB'; writeJson('skins.json',db.skins); return safeReply(interaction, '🦇 Estilo **Vampírico NVB** aplicado.'); }
      if (c === 'template-skin') return safeReply(interaction, {content:'🎨 Template NVB: corpo inteiro, roupas, acessórios e identidade visual. Use o template oficial do Roblox para edição.',ephemeral:true});
      if (c === 'criar-skin' || c === 'salvar-skin') { const name=interaction.options.getString('nome'); const data=interaction.options.getString(c==='criar-skin'?'estilo':'dados'); db.skins[u.id][name]=data; db.skins[u.id].current=name; writeJson('skins.json',db.skins); return safeReply(interaction, `✅ Skin **${name}** salva.`); }
      if (c === 'editar-skin') { const name=interaction.options.getString('nome'); if(!db.skins[u.id][name])return safeReply(interaction, {content:'❌ Skin não encontrada.',ephemeral:true}); db.skins[u.id][name]=interaction.options.getString('detalhes'); writeJson('skins.json',db.skins); return safeReply(interaction, `✅ Skin **${name}** atualizada.`); }
      if (c === 'skin-personalizada') { const desc=interaction.options.getString('descricao'); const name=`Personalizada-${Date.now()}`; db.skins[u.id][name]=desc; db.skins[u.id].current=name; writeJson('skins.json',db.skins); return safeReply(interaction, `🎨 Skin **${name}** criada.\nDescrição: ${desc}`); }
      const name=interaction.options.getString('nome'); const data=name&&db.skins[u.id][name];
      if (c === 'analisar-skin') return safeReply(interaction, {content:data?`🔎 **${name}**\nDados: ${data}`:'🔎 Informe uma skin salva para analisar.',ephemeral:true});
      if (c === 'melhorar-skin') return safeReply(interaction, {content:'✨ Sugestões: aumentar contraste, manter identidade NVB, usar azul/roxo/verde e garantir que corpo e acessórios fiquem visíveis.',ephemeral:true});
      if (c === 'avaliar-skin') return safeReply(interaction, {content:data?`⭐ Avaliação da **${name}**: identidade NVB, personalização e coerência visual podem ser avaliadas a partir de: ${data}`:'⭐ Salve uma skin primeiro.',ephemeral:true});
      if (c === 'skin-ia') {
        if (!OPENAI_API_KEY) return safeReply(interaction, {content:'⚠️ OPENAI_API_KEY não está configurada no Render. A função de IA está pronta, mas precisa da variável para gerar a imagem.',ephemeral:true});
        if (!await safeDefer(interaction)) return;
        const estilo=interaction.options.getString('estilo');
        const prompt=`Create a full-body Roblox-inspired avatar concept for Nytheris Vampyre Bloodline (NVB), style: ${estilo}. Show the entire character from head to toe, all clothing and accessories visible, dark vampire aesthetic, blue purple green accents, bat motifs, clean game-avatar presentation, no text, no crop.`;
        const res=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${OPENAI_API_KEY}`},body:JSON.stringify({model:OPENAI_IMAGE_MODEL,prompt,size:'1024x1024'})});
        if(!res.ok) return interaction.editReply(`❌ A geração por IA falhou (${res.status}). Verifique OPENAI_IMAGE_MODEL/API Key no Render.`);
        const dataImg=await res.json(); const b64=dataImg.data?.[0]?.b64_json; const url=dataImg.data?.[0]?.url;
        if(b64){const buffer=Buffer.from(b64,'base64');return interaction.editReply({content:`🦇 Skin IA — **${estilo}**`,files:[{attachment:buffer,name:'skin-nvb.png'}]});}
        if(url)return interaction.editReply({content:`🦇 Skin IA — **${estilo}**\n${url}`});
        return interaction.editReply('❌ A IA não retornou uma imagem.');
      }
    }

    // ----- ADMIN -----
    if (['dar-cargo','remover-cargo','setcargo','config','logs','painel','embed'].includes(c) && !await guard(interaction,'admin')) return;
    if (c === 'dar-cargo' || c === 'remover-cargo') { const m=interaction.options.getMember('usuario'); const role=interaction.options.getRole('cargo'); if(!m||!role)return safeReply(interaction, {content:'❌ Membro/cargo inválido.',ephemeral:true}); const ok=c==='dar-cargo'?await m.roles.add(role).then(()=>true).catch(()=>false):await m.roles.remove(role).then(()=>true).catch(()=>false); return safeReply(interaction, ok?`✅ Cargo ${role} ${c==='dar-cargo'?'adicionado a':'removido de'} ${m}.`:'❌ Não foi possível alterar o cargo.'); }
    if (c === 'setcargo') { db.config[`role_${interaction.options.getString('nome')}`]=interaction.options.getRole('cargo').id; writeJson('config.json',db.config); return safeReply(interaction, '✅ Cargo do sistema salvo.'); }
    if (c === 'config') return safeReply(interaction, {content:`⚙️ Configuração NVB\nGuild: ${GUILD_ID||'global'}\nComandos: ${commands.length}\nCanais configurados: ${Object.keys(process.env).filter(k=>/CHANNEL_ID$/.test(k)).length}`,ephemeral:true});
    if (c === 'logs') return safeReply(interaction, {content:db.logs.slice(-(interaction.options.getInteger('quantidade')||10)).reverse().map(x=>`• ${x.type} — <@${x.userId}> — ${x.at}`).join('\n')||'Nenhum log.',ephemeral:true});
    if (c === 'painel') return safeReply(interaction, {content:'👑 Painel administrativo NVB ativo. Use os comandos de Administração para gerenciar o sistema.',ephemeral:true});
    if (c === 'anunciar') { if(!await guard(interaction,'anunciar'))return; const e=new EmbedBuilder().setColor(0x7c3aed).setTitle(interaction.options.getString('titulo')).setDescription(interaction.options.getString('mensagem')).setFooter({text:'NVB • Nytheris Vampyre Bloodline'}).setTimestamp(); return interaction.channel.send({embeds:[e]}).then(()=>safeReply(interaction, {content:'✅ Anúncio enviado.',ephemeral:true})); }
    if (c === 'embed') { const e=new EmbedBuilder().setColor(0x7c3aed).setTitle(interaction.options.getString('titulo')).setDescription(interaction.options.getString('descricao')); return interaction.channel.send({embeds:[e]}).then(()=>safeReply(interaction, {content:'✅ Embed enviado.',ephemeral:true})); }

    // ----- COMUNIDADE -----
    if (['evento','jogatina','resenha','conquista-add'].includes(c) && !await guard(interaction,'comunidade')) return;
    if (c === 'evento') { const nome=interaction.options.getString('nome'); addPoints(u.id,10,'evento'); return safeReply(interaction, `🦇 Evento **${nome}** criado por ${u}. +10 pontos.`); }
    if (c === 'jogatina') { const jogo=interaction.options.getString('jogo'); addPoints(u.id,5,'jogatina'); return safeReply(interaction, `🎮 Jogatina registrada: **${jogo}**. +5 pontos.`); }
    if (c === 'resenha') { const tema=interaction.options.getString('tema'); addPoints(u.id,5,'resenha'); return safeReply(interaction, `💬 Resenha registrada: **${tema}**. +5 pontos.`); }
    if (c === 'chamada') { if(!await guard(interaction,'chamada'))return; return interaction.channel.send(`📢 **CHAMADA NVB**\n${u} chamou a comunidade!`).then(()=>safeReply(interaction, {content:'✅ Chamada enviada.',ephemeral:true})); }
    if (c === 'presenca') { if(!await guard(interaction,'chamada'))return; db.presenca[u.id]={at:new Date().toISOString(),channelId:interaction.channelId}; writeJson('presenca.json',db.presenca); addPoints(u.id,5,'presença'); return safeReply(interaction, '🟢 Presença registrada. +5 pontos.'); }
    if (c === 'pontos-add') { if(!await guard(interaction,'pontosAdd'))return; const m=interaction.options.getUser('usuario'); const q=interaction.options.getInteger('quantidade'); const novo=addPoints(m.id,q,interaction.options.getString('motivo')||'manual'); return safeReply(interaction, `🪙 ${m} recebeu **${q} pontos**. Total: **${novo}**.`); }
    if (c === 'pontos-remove') { if(!await guard(interaction,'pontosRemove'))return; const m=interaction.options.getUser('usuario'); const q=interaction.options.getInteger('quantidade'); const ok=removePoints(m.id,q,interaction.options.getString('motivo')||'manual'); return safeReply(interaction, ok?`🪙 Foram removidos **${q} pontos** de ${m}.`:'❌ O membro não possui pontos suficientes.'); }
    if (c === 'recompensa') { if(!await guard(interaction,'recompensa'))return; const m=interaction.options.getUser('usuario'); const nome=interaction.options.getString('nome'); const q=interaction.options.getInteger('pontos'); if(!removePoints(m.id,q,`recompensa: ${nome}`))return safeReply(interaction, {content:'❌ Pontos insuficientes.',ephemeral:true}); db.recompensas.push({userId:m.id,nome,pontos:q,at:new Date().toISOString()}); writeJson('recompensas.json',db.recompensas); return safeReply(interaction, `🎁 Recompensa **${nome}** registrada para ${m}.`); }
    if (c === 'conquista-add') { const m=interaction.options.getUser('usuario'); const nome=interaction.options.getString('nome'); db.conquistas[m.id] ||= []; db.conquistas[m.id].push(nome); writeJson('conquistas.json',db.conquistas); return safeReply(interaction, `🏆 Conquista **${nome}** adicionada a ${m}.`); }

    // ----- AUTOMAÇÃO -----
    if (['boasvindas','entrada','saida','autocargo','verificacao','chamada-auto','anuncio-auto'].includes(c) && !await guard(interaction, c==='chamada-auto'?'chamadaAuto':c==='verificacao'?'verificacao':'automacao')) return;
    if (c === 'boasvindas') { db.config.welcomeChannel=interaction.options.getChannel('canal').id; writeJson('config.json',db.config); return safeReply(interaction, '✅ Canal de boas-vindas configurado.'); }
    if (c === 'entrada') { db.config.entryMessage=interaction.options.getString('mensagem'); writeJson('config.json',db.config); return safeReply(interaction, '✅ Mensagem de entrada salva.'); }
    if (c === 'saida') { db.config.leaveMessage=interaction.options.getString('mensagem'); writeJson('config.json',db.config); return safeReply(interaction, '✅ Mensagem de saída salva.'); }
    if (c === 'autocargo') { db.config.autoRole=interaction.options.getRole('cargo').id; writeJson('config.json',db.config); return safeReply(interaction, '✅ Autocargo configurado.'); }
    if (c === 'verificacao') { db.config.verificationChannel=interaction.options.getChannel('canal').id; writeJson('config.json',db.config); return safeReply(interaction, '✅ Canal de verificação configurado.'); }
    if (c === 'chamada-auto') { db.config.autoCallChannel=interaction.options.getChannel('canal').id; writeJson('config.json',db.config); return safeReply(interaction, '✅ Canal da chamada automática configurado.'); }
    if (c === 'anuncio-auto') { db.config.autoAnnouncementChannel=interaction.options.getChannel('canal').id; writeJson('config.json',db.config); return safeReply(interaction, '✅ Canal de anúncio automático configurado.'); }

    return safeReply(interaction, {content:'❌ Comando não reconhecido.',ephemeral:true});
  } catch (e) {
    console.error(`Erro /${c}:`, e);
    const msg = '❌ Ocorreu um erro ao executar este comando.';
    if (interaction.replied || interaction.deferred) return interaction.followUp({content:msg,ephemeral:true}).catch(()=>{});
    return safeReply(interaction, {content:msg,ephemeral:true}).catch(()=>{});
  }
});

// =========================
// EVENTOS AUTOMÁTICOS
// =========================
client.on('guildMemberAdd', async member => {
  const channelId = db.config.welcomeChannel || process.env.WELCOME_CHANNEL_ID;
  if (channelId) {
    const ch=await member.guild.channels.fetch(channelId).catch(()=>null);
    if(ch?.isTextBased()) await ch.send((db.config.entryMessage||'🦇 Bem-vindo(a) à NVB, {user}!').replace('{user}',member.toString())).catch(()=>{});
  }
  if (db.config.autoRole) await member.roles.add(db.config.autoRole).catch(()=>{});
});
client.on('guildMemberRemove', async member => {
  const channelId = process.env.WELCOME_CHANNEL_ID;
  if (!channelId) return;
  const ch=await member.guild.channels.fetch(channelId).catch(()=>null);
  if(ch?.isTextBased()) await ch.send((db.config.leaveMessage||'🦇 {user} deixou a NVB.').replace('{user}',member.user.tag)).catch(()=>{});
});

// =========================
// QG WEB
// =========================
const app = express();
app.use(express.json({limit:'10mb'}));
app.use(express.static(__dirname));
app.get('/api/status', (req,res)=>res.json({ok:true,bot:client.user?.tag||'NVB BOT',commands:commands.length,online:client.isReady()}));
app.get('*', (req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.listen(PORT,()=>console.log(`🌐 QG NVB na porta ${PORT}`));

client.once('ready', async () => {
  console.log(`🦇 NVB BOT online: ${client.user.tag}`);
  try { await registerCommands(); }
  catch(e) { console.error('❌ Erro ao registrar comandos:',e); }
});

client.login(TOKEN).catch(e=>console.error('❌ Falha no login do Discord:',e.message));
