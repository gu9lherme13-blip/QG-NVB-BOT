require("dotenv").config();
const express=require("express");
const path=require("path");
const {Client,GatewayIntentBits,REST,Routes,SlashCommandBuilder,PermissionFlagsBits,EmbedBuilder}=require("discord.js");

const TOKEN=process.env.DISCORD_TOKEN;
const CLIENT_ID=process.env.CLIENT_ID;
const GUILD_ID=process.env.GUILD_ID;
const PORT=process.env.PORT||3000;
if(!TOKEN){console.error("DISCORD_TOKEN não configurado.");process.exit(1);}

const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers]});
const commands=[
  new SlashCommandBuilder().setName('nvb').setDescription('Abre o painel principal da NVB'),
  new SlashCommandBuilder().setName('perfil').setDescription('Mostra seu perfil NVB'),
  new SlashCommandBuilder().setName('roblox').setDescription('Mostra seu Roblox'),
  new SlashCommandBuilder().setName('avatar').setDescription('Mostra seu avatar'),
  new SlashCommandBuilder().setName('cargos').setDescription('Mostra seus cargos'),
  new SlashCommandBuilder().setName('conquistas').setDescription('Mostra suas conquistas'),
  new SlashCommandBuilder().setName('nivel').setDescription('Mostra seu nível'),
  new SlashCommandBuilder().setName('pontos').setDescription('Mostra seus pontos'),
  new SlashCommandBuilder().setName('ranking').setDescription('Mostra o ranking'),
  new SlashCommandBuilder().setName('ajuda').setDescription('Mostra a ajuda'),
  new SlashCommandBuilder().setName('recrutamento').setDescription('Abre o recrutamento'),
  new SlashCommandBuilder().setName('candidatura').setDescription('Envia candidatura'),
  new SlashCommandBuilder().setName('candidaturas').setDescription('Lista candidaturas'),
  new SlashCommandBuilder().setName('aprovar').setDescription('Aprova candidatura'),
  new SlashCommandBuilder().setName('recusar').setDescription('Recusa candidatura'),
  new SlashCommandBuilder().setName('status').setDescription('Consulta status'),
  new SlashCommandBuilder().setName('aviso').setDescription('Aplica aviso'),
  new SlashCommandBuilder().setName('silenciar').setDescription('Silencia membro'),
  new SlashCommandBuilder().setName('dessilenciar').setDescription('Remove silenciamento'),
  new SlashCommandBuilder().setName('expulsar').setDescription('Expulsa membro'),
  new SlashCommandBuilder().setName('banir').setDescription('Bane membro'),
  new SlashCommandBuilder().setName('desbanir').setDescription('Remove banimento'),
  new SlashCommandBuilder().setName('limpar').setDescription('Limpa mensagens'),
  new SlashCommandBuilder().setName('trancar').setDescription('Tranca canal'),
  new SlashCommandBuilder().setName('destrancar').setDescription('Destranca canal'),
  new SlashCommandBuilder().setName('histórico').setDescription('Consulta histórico'),
  new SlashCommandBuilder().setName('skin').setDescription('Mostra uma skin'),
  new SlashCommandBuilder().setName('skin-ia').setDescription('Gera skin com IA'),
  new SlashCommandBuilder().setName('criar-skin').setDescription('Cria skin'),
  new SlashCommandBuilder().setName('editar-skin').setDescription('Edita skin'),
  new SlashCommandBuilder().setName('analisar-skin').setDescription('Analisa skin'),
  new SlashCommandBuilder().setName('melhorar-skin').setDescription('Melhora skin'),
  new SlashCommandBuilder().setName('skin-nvb').setDescription('Aplica estilo NVB'),
  new SlashCommandBuilder().setName('template-skin').setDescription('Mostra template'),
  new SlashCommandBuilder().setName('avaliar-skin').setDescription('Avalia skin'),
  new SlashCommandBuilder().setName('salvar-skin').setDescription('Salva skin'),
  new SlashCommandBuilder().setName('skins').setDescription('Lista skins'),
  new SlashCommandBuilder().setName('skin-atual').setDescription('Mostra skin atual'),
  new SlashCommandBuilder().setName('skin-random').setDescription('Skin aleatória'),
  new SlashCommandBuilder().setName('skin-personalizada').setDescription('Cria skin personalizada'),
  new SlashCommandBuilder().setName('cargo').setDescription('Consulta cargo'),
  new SlashCommandBuilder().setName('dar-cargo').setDescription('Dá cargo'),
  new SlashCommandBuilder().setName('remover-cargo').setDescription('Remove cargo'),
  new SlashCommandBuilder().setName('setcargo').setDescription('Define cargo'),
  new SlashCommandBuilder().setName('config').setDescription('Configura bot'),
  new SlashCommandBuilder().setName('logs').setDescription('Logs'),
  new SlashCommandBuilder().setName('painel').setDescription('Painel administrativo'),
  new SlashCommandBuilder().setName('anunciar').setDescription('Anúncio'),
  new SlashCommandBuilder().setName('embed').setDescription('Cria embed'),
  new SlashCommandBuilder().setName('evento').setDescription('Cria evento'),
  new SlashCommandBuilder().setName('jogatina').setDescription('Agenda jogatina'),
  new SlashCommandBuilder().setName('resenha').setDescription('Agenda resenha'),
  new SlashCommandBuilder().setName('chamada').setDescription('Faz chamada'),
  new SlashCommandBuilder().setName('presença').setDescription('Registra presença'),
  new SlashCommandBuilder().setName('pontos-add').setDescription('Adiciona pontos'),
  new SlashCommandBuilder().setName('pontos-remove').setDescription('Remove pontos'),
  new SlashCommandBuilder().setName('recompensa').setDescription('Gerencia recompensa'),
  new SlashCommandBuilder().setName('conquista-add').setDescription('Adiciona conquista'),
  new SlashCommandBuilder().setName('boasvindas').setDescription('Configura boas-vindas'),
  new SlashCommandBuilder().setName('entrada').setDescription('Configura entrada'),
  new SlashCommandBuilder().setName('saida').setDescription('Configura saída'),
  new SlashCommandBuilder().setName('autocargo').setDescription('Configura autocargo'),
  new SlashCommandBuilder().setName('verificação').setDescription('Configura verificação'),
  new SlashCommandBuilder().setName('chamada-auto').setDescription('Configura chamada automática'),
  new SlashCommandBuilder().setName('anuncio-auto').setDescription('Configura anúncio automático')
];

const roles={
LDR:process.env.ROLE_LDR,"SB-LDR":process.env.ROLE_SB_LDR,ADM:process.env.ROLE_ADM,
CMDT:process.env.ROLE_CMDT,MOD:process.env.ROLE_MOD,SUP:process.env.ROLE_SUP,
ORG:process.env.ROLE_ORG,REC:process.env.ROLE_REC
};
const allowed={
recrutamento:["REC","SUP","MOD","CMDT","ADM","SB-LDR","LDR"],
candidaturas:["REC","MOD","CMDT","ADM","SB-LDR","LDR"],
aprovar:["REC","CMDT","ADM","SB-LDR","LDR"],recusar:["REC","CMDT","ADM","SB-LDR","LDR"],
moderacao:["MOD","CMDT","ADM","SB-LDR","LDR"],expulsar:["CMDT","ADM","SB-LDR","LDR"],
banir:["ADM","SB-LDR","LDR"],admin:["ADM","SB-LDR","LDR"],
anunciar:["ADM","CMDT","SB-LDR","LDR"],comunidade:["ORG","CMDT","ADM"],
chamada:["ORG","REC","CMDT","ADM"],pontosAdd:["ORG","REC","CMDT","ADM"],
pontosRemove:["CMDT","ADM","SB-LDR","LDR"],recompensa:["ADM","CMDT","SB-LDR","LDR"],
conquista:["ORG","CMDT","ADM"],automacao:["ADM","SB-LDR","LDR"],
verificacao:["ADM","CMDT","SB-LDR","LDR"],chamadaAuto:["ADM","CMDT","ORG"]
};
function has(m,list){return m?.roles?.cache && list.some(x=>roles[x]&&m.roles.cache.has(roles[x]));}
function deny(i){return i.reply({content:"❌ Você não possui o cargo necessário.",ephemeral:true});}
function can(i,g){return i.member?.permissions?.has(PermissionFlagsBits.Administrator)||has(i.member,allowed[g]||[]);}

client.once("ready",async()=>{
 console.log(`NVB BOT online: ${client.user.tag}`);
 if(!CLIENT_ID)return;
 const rest=new REST({version:"10"}).setToken(TOKEN);
 try{await rest.put(GUILD_ID?Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID):Routes.applicationCommands(CLIENT_ID),{body:commands.map(c=>c.toJSON())});console.log(`{commands.length} comandos NVB registrados.`);}
 catch(e){console.error("Erro ao registrar comandos:",e);}
});

client.on("interactionCreate",async i=>{
 if(!i.isChatInputCommand())return;
 const c=i.commandName;
 const groups={
   recrutamento:["recrutamento","candidaturas"],aprovar:["aprovar"],recusar:["recusar"],
   moderacao:["aviso","silenciar","dessilenciar","limpar","trancar","destrancar","histórico"],
   expulsar:["expulsar"],banir:["banir","desbanir"],admin:["cargo","dar-cargo","remover-cargo","setcargo","config","logs","painel","embed"],
   anunciar:["anunciar"],comunidade:["evento","jogatina","resenha","conquista-add"],
   chamada:["chamada","presença"],pontosAdd:["pontos-add"],pontosRemove:["pontos-remove"],
   recompensa:["recompensa"],automacao:["boasvindas","entrada","saida","autocargo","anuncio-auto"],
   verificacao:["verificação"],chamadaAuto:["chamada-auto"]
 };
 for(const [g,list] of Object.entries(groups))if(list.includes(c)&&!can(i,g))return deny(i);
 return i.reply({embeds:[new EmbedBuilder().setColor(0x7c3aed).setTitle(`NVB • /${c}`).setDescription(`O comando **/${c}** está registrado no novo NVB BOT.`)]});
});

const app=express();
app.use(express.json());
app.use(express.static(path.join(__dirname,"site")));
app.get("/api/status",(req,res)=>res.json({ok:true,bot:client.user?.tag||"NVB BOT",commands:commands.length}));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"site","index.html")));
app.listen(PORT,()=>console.log(`QG NVB na porta ${PORT}`));
client.login(TOKEN);
    
