// 自走棋·华夏 v4 — 数据层（无限关卡+装备+宝石+宠物+翅膀）
'use strict';

// === 常量 ===
const BOARD_W = 8, BOARD_H = 8;
const BENCH_SIZE = 9, SHOP_SIZE = 5;
const MAX_PLAYER_LEVEL = 999;
const START_GOLD = 10;
const INTEREST_PER = 3, INTEREST_MAX = 8;
const XP_COST = 2, XP_PER_LEVEL = 4;
const MERGE_NEED = 2;
const REFRESH_COST = 1;

// 连胜/连败奖励
const STREAK_GOLD = {1:1, 2:2, 3:3, 4:4, 5:5, 6:6, 7:7, 8:8, 9:10};

// 商店概率（按等级）
const SHOP_ODDS = {
  1:  [100,0,0,0,0],
  2:  [70,30,0,0,0],
  3:  [50,35,15,0,0],
  4:  [35,35,20,10,0],
  5:  [25,30,25,15,5],
  6:  [20,25,30,15,10],
  7:  [15,20,30,20,15],
  8:  [10,15,30,25,20],
  9:  [8,12,25,30,25],
  10: [5,10,20,30,35],
};

// === 种族羁绊 ===
const RACES = {
  jin:  {name:"金",color:"#c8a04a",buffs:{2:{desc:"护甲+15",type:"armor",val:15},4:{desc:"护甲+30，反伤10",type:"armorReflect",val:30},6:{desc:"护甲+50，反伤25",type:"armorReflect",val:50}}},
  mu:   {name:"木",color:"#4a9eff",buffs:{2:{desc:"生命+200",type:"hp",val:200},4:{desc:"生命+500，回血1%/s",type:"hpRegen",val:500},6:{desc:"生命+1000，回血3%/s",type:"hpRegen",val:1000}}},
  shui: {name:"水",color:"#3a9eff",buffs:{2:{desc:"魔抗+20",type:"mr",val:20},4:{desc:"魔抗+40，减速攻击者",type:"mrSlow",val:40},6:{desc:"魔抗+60，攻击冰冻",type:"mrFreeze",val:60}}},
  huo:  {name:"火",color:"#ff6a3a",buffs:{2:{desc:"攻击+15%",type:"atkPct",val:0.15},4:{desc:"攻击+30%，灼烧",type:"atkBurn",val:0.3},6:{desc:"攻击+50%，范围灼烧",type:"atkAoeBurn",val:0.5}}},
  tu:   {name:"土",color:"#8a7a5a",buffs:{2:{desc:"生命+150，护甲+10",type:"hpArmor",val:150},4:{desc:"生命+400，护甲+25",type:"hpArmor2",val:400},6:{desc:"生命+800，护甲+50",type:"hpArmor3",val:800}}},
};

// === 职业羁绊 ===
const JOBS = {
  zhanshi:{name:"战士",buffs:{2:{desc:"护甲+15",type:"armor",val:15},4:{desc:"护甲+30，生命+200",type:"armorHp",val:30},6:{desc:"护甲+50，生命+500",type:"armorHp",val:50}}},
  sheshou: {name:"射手",buffs:{2:{desc:"攻击+15%",type:"atkPct",val:0.15},4:{desc:"攻击+30%，射程+1",type:"atkRange",val:0.3},6:{desc:"攻击+50%，射程+2",type:"atkRange",val:0.5}}},
  fashi:   {name:"法师",buffs:{2:{desc:"技能伤害+25%",type:"skillDmg",val:0.25},4:{desc:"技能伤害+50%，减魔抗20",type:"skillMrReduce",val:0.5},6:{desc:"技能伤害+80%，减魔抗40",type:"skillMrReduce",val:0.8}}},
};

// === 单位 ===
const UNITS = {
  // 1费
  bingjiang:{name:"冰将",emoji:"❄️",cost:1,race:"shui",job:"zhanshi",base:{hp:600,atk:55,range:1,atkSpd:1.0,armor:15,mr:0},skill:{name:"寒冰斩",desc:"15%概率冻结",type:"freeze",val:1.5}},
  liehuoshou:{name:"猎火兽",emoji:"🔥",cost:1,race:"huo",job:"sheshou",base:{hp:500,atk:60,range:3,atkSpd:0.9,armor:8,mr:0},skill:{name:"火箭",desc:"附带灼烧",type:"burn",val:0.3}},
  mujingling:{name:"木精灵",emoji:"🌿",cost:1,race:"mu",job:"fashi",base:{hp:450,atk:65,range:4,atkSpd:0.8,armor:5,mr:20},skill:{name:"缠绕",desc:"减速30%",type:"slow",val:0.3}},
  jinweishi:{name:"金卫士",emoji:"⚔️",cost:1,race:"jin",job:"zhanshi",base:{hp:700,atk:45,range:1,atkSpd:1.0,armor:25,mr:0},skill:{name:"铁壁",desc:"减伤20%",type:"dmgReduct",val:0.2}},
  tuwushi:{name:"土巫师",emoji:"🪨",cost:1,race:"tu",job:"fashi",base:{hp:480,atk:55,range:4,atkSpd:0.7,armor:5,mr:15},skill:{name:"落石",desc:"溅射",type:"splash",val:0.4}},
  // 2费
  shuishen:{name:"水神",emoji:"💧",cost:2,race:"shui",job:"fashi",base:{hp:700,atk:80,range:5,atkSpd:0.75,armor:5,mr:30},skill:{name:"水龙波",desc:"AOE",type:"aoe",val:0.5}},
  huolong:{name:"火龙",emoji:"🐉",cost:2,race:"huo",job:"sheshou",base:{hp:750,atk:85,range:3,atkSpd:0.85,armor:10,mr:0},skill:{name:"龙息",desc:"范围灼烧",type:"aoeBurn",val:0.3}},
  mushuwang:{name:"木鼠王",emoji:"🐭",cost:2,race:"mu",job:"zhanshi",base:{hp:900,atk:70,range:1,atkSpd:1.1,armor:18,mr:0},skill:{name:"狂暴",desc:"低血攻速+50%",type:"enrage",val:0.5}},
  jinbiashi:{name:"金镖师",emoji:"🪙",cost:2,race:"jin",job:"sheshou",base:{hp:600,atk:75,range:3,atkSpd:1.0,armor:10,mr:0},skill:{name:"飞镖",desc:"穿透",type:"pierce",val:0.5}},
  tuling:{name:"土灵",emoji:"🗿",cost:2,race:"tu",job:"fashi",base:{hp:800,atk:70,range:4,atkSpd:0.7,armor:15,mr:20},skill:{name:"石化",desc:"20%石化",type:"petrify",val:0.2}},
  // 3费
  hailongwang:{name:"海龙王",emoji:"🌊",cost:3,race:"shui",job:"fashi",base:{hp:1000,atk:100,range:5,atkSpd:0.8,armor:8,mr:35},skill:{name:"海啸",desc:"大AOE+减速",type:"aoeSlow",val:0.6}},
  yanlong:{name:"炎龙",emoji:"🌋",cost:3,race:"huo",job:"zhanshi",base:{hp:1100,atk:95,range:1,atkSpd:0.9,armor:20,mr:0},skill:{name:"烈焰冲撞",desc:"冲阵灼烧",type:"chargeBurn",val:0.4}},
  shushen:{name:"树神",emoji:"🌳",cost:3,race:"mu",job:"fashi",base:{hp:950,atk:105,range:5,atkSpd:0.75,armor:8,mr:30},skill:{name:"生命之愈",desc:"治疗友军",type:"heal",val:30}},
  jiangshi:{name:"僵尸",emoji:"🧟",cost:3,race:"tu",job:"zhanshi",base:{hp:1200,atk:80,range:1,atkSpd:0.8,armor:25,mr:0},skill:{name:"不灭",desc:"复活50%",type:"revive",val:0.5}},
  jinshen:{name:"金神",emoji:"✨",cost:3,race:"jin",job:"sheshou",base:{hp:850,atk:100,range:4,atkSpd:1.0,armor:12,mr:10},skill:{name:"金光斩",desc:"暴击+30%",type:"crit",val:0.3}},
  // 4费
  xuanwu:{name:"玄武",emoji:"🐢",cost:4,race:"shui",job:"zhanshi",base:{hp:1400,atk:110,range:1,atkSpd:0.85,armor:35,mr:20},skill:{name:"玄甲",desc:"护盾500",type:"shield",val:500}},
  zhuque:{name:"朱雀",emoji:"🦅",cost:4,race:"huo",job:"fashi",base:{hp:1100,atk:130,range:5,atkSpd:0.8,armor:8,mr:35},skill:{name:"涅槃",desc:"复活满血",type:"revive",val:1.0}},
  qinglong:{name:"青龙",emoji:"🐲",cost:4,race:"mu",job:"sheshou",base:{hp:1200,atk:120,range:3,atkSpd:1.0,armor:15,mr:15},skill:{name:"龙吟",desc:"闪电链",type:"chain",val:0.4}},
  baihu:{name:"白虎",emoji:"🐅",cost:4,race:"jin",job:"zhanshi",base:{hp:1300,atk:125,range:1,atkSpd:1.0,armor:30,mr:10},skill:{name:"虎啸",desc:"首击双倍",type:"firstDouble",val:2.0}},
  kunlunling:{name:"昆仑灵",emoji:"🏔️",cost:4,race:"tu",job:"fashi",base:{hp:1150,atk:125,range:5,atkSpd:0.75,armor:10,mr:35},skill:{name:"山崩",desc:"AOE+眩晕",type:"aoeStun",val:0.5}},
  // 5费
  longwang:{name:"龙王",emoji:"👑",cost:5,race:"shui",job:"fashi",base:{hp:1600,atk:150,range:6,atkSpd:0.85,armor:15,mr:40},skill:{name:"龙神降临",desc:"全场AOE+减速",type:"ultimate",val:0.8}},
  fenghuang:{name:"凤凰",emoji:"🦚",cost:5,race:"huo",job:"fashi",base:{hp:1400,atk:155,range:5,atkSpd:0.85,armor:10,mr:40},skill:{name:"浴火重生",desc:"复活+灼烧",type:"reviveBurn",val:1.0}},
};

// === 装备系统 ===
const EQUIP_SLOTS = ['weapon','armor','accessory'];
const EQUIP_SLOTS_NAME = {weapon:'武器',armor:'护甲',accessory:'饰品'};

const EQUIPMENT = {
  // 武器
  w1:  {name:"木剑",slot:"weapon",rarity:1,stats:{atk:10},emoji:"🗡️"},
  w2:  {name:"铁剑",slot:"weapon",rarity:2,stats:{atk:25},emoji:"⚔️"},
  w3:  {name:"青龙刀",slot:"weapon",rarity:3,stats:{atk:50,atkSpd:0.1},emoji:"🗡️"},
  w4:  {name:"轩辕剑",slot:"weapon",rarity:4,stats:{atk:100,atkSpd:0.15,crit:0.15},emoji:"🌟"},
  w5:  {name:"盘古斧",slot:"weapon",rarity:5,stats:{atk:200,atkSpd:0.2,crit:0.25},emoji:"⚡"},
  // 护甲
  a1:  {name:"皮甲",slot:"armor",rarity:1,stats:{hp:100,armor:5},emoji:"🛡️"},
  a2:  {name:"铁甲",slot:"armor",rarity:2,stats:{hp:250,armor:15},emoji:"🛡️"},
  a3:  {name:"玄龟甲",slot:"armor",rarity:3,stats:{hp:500,armor:30,mr:15},emoji:"🐢"},
  a4:  {name:"天蚕甲",slot:"armor",rarity:4,stats:{hp:1000,armor:50,mr:30},emoji:"✨"},
  a5:  {name:"混沌甲",slot:"armor",rarity:5,stats:{hp:2000,armor:80,mr:50,dmgReduct:0.1},emoji:"💠"},
  // 饰品
  a6:  {name:"玉佩",slot:"accessory",rarity:1,stats:{hp:50,mr:10},emoji:"📿"},
  a7:  {name:"龙珠",slot:"accessory",rarity:2,stats:{atk:20,hp:150,mr:20},emoji:"🔮"},
  a8:  {name:"昆仑玉",slot:"accessory",rarity:3,stats:{atk:40,hp:300,mr:30,atkSpd:0.1},emoji:"💎"},
  a9:  {name:"天地环",slot:"accessory",rarity:4,stats:{atk:80,hp:600,mr:40,crit:0.1},emoji:"🌐"},
  a10: {name:"造化珠",slot:"accessory",rarity:5,stats:{atk:150,hp:1200,mr:60,crit:0.2,atkSpd:0.15},emoji:"🔯"},
};

// 装备掉落概率（按稀有度）
const EQUIP_DROP_RATES = [
  {rarity:1, chance:40}, // 白
  {rarity:2, chance:30}, // 绿
  {rarity:3, chance:18}, // 蓝
  {rarity:4, chance:9},  // 紫
  {rarity:5, chance:3}, // 橙
];
const RARITY_COLORS = {1:'#aaa',2:'#4a9',3:'#4af',4:'#c4f',5:'#f80'};
const RARITY_NAMES = {1:'普通',2:'精良',3:'稀有',4:'史诗',5:'传说'};

// === 宝石系统 ===
const GEM_TYPES = {
  red:   {name:"红宝石",emoji:"🔴",stat:"atk",valPerLevel:8,color:"#f55"},
  blue:  {name:"蓝宝石",emoji:"🔵",stat:"mr",valPerLevel:5,color:"#5af"},
  green: {name:"绿宝石",emoji:"🟢",stat:"hp",valPerLevel:80,color:"#5f5"},
  yellow:{name:"黄宝石",emoji:"🟡",stat:"atkSpd",valPerLevel:0.03,color:"#fc5"},
  purple:{name:"紫宝石",emoji:"🟣",stat:"crit",valPerLevel:0.02,color:"#c4f"},
};
const GEM_MAX_LEVEL = 5;
const GEM_MERGE_COST = 2; // 3个同级合成1个高1级

// === 宠物系统 ===
const PETS = {
  p1:{name:"小灵狐",emoji:"🦊",skill:{type:"goldBonus",val:0.1,desc:"金币+10%"},cost:0},
  p2:{name:"玄龟仔",emoji:"🐢",skill:{type:"hpBonus",val:0.05,desc:"全队生命+5%"},cost:30},
  p3:{name:"火精灵",emoji:"🔥",skill:{type:"atkBonus",val:0.05,desc:"全队攻击+5%"},cost:100},
  p4:{name:"小青龙",emoji:"🐲",skill:{type:"expBonus",val:0.3,desc:"经验+30%"},cost:200},
  p5:{name:"凤凰雏",emoji:"🦚",skill:{type:"revive",val:0.3,desc:"全军复活30%血(每场一次)"},cost:500},
  p6:{name:"麒麟兽",emoji:"🦄",skill:{type:"allBonus",val:0.1,desc:"全队属性+10%"},cost:1000},
};
const PET_UNLOCK_WAVE = 3; // 第3波解锁

// === 翅膀系统 ===
const WINGS = {
  w0:{name:"无翅膀",emoji:"",skill:{type:"none",val:0,desc:"未装备"},cost:0},
  w1:{name:"翠羽翼",emoji:"🪽",skill:{type:"dodge",val:0.05,desc:"闪避+5%"},cost:50},
  w2:{name:"烈焰翼",emoji:"🔥",skill:{type:"burnAura",val:0.1,desc:"近战反伤灼烧10%"},cost:300},
  w3:{name:"冰霜翼",emoji:"❄️",skill:{type:"slowAura",val:0.15,desc:"减速攻击者15%"},cost:500},
  w4:{name:"雷翼",emoji:"⚡",skill:{type:"chainLight",val:0.2,desc:"攻击20%闪电链"},cost:800},
  w5:{name:"神翼",emoji:"✨",skill:{type:"allStat",val:0.15,desc:"全属性+15%"},cost:1500},
};
const WING_UNLOCK_WAVE = 5; // 第5波解锁

// === 无限关卡生成 ===
// 10波以后程序化生成
const BOSS_WAVES = [10, 20, 30, 50, 100]; // Boss波次

function generateLevel(wave) {
  const isBoss = BOSS_WAVES.includes(wave);
  const enemyCount = isBoss ? Math.min(3, 2 + Math.floor(wave/50))
    : Math.min(9, 2 + Math.floor(wave/3));
  
  // 金币奖励递增
  const goldReward = 6 + Math.floor(wave * 2);
  
  // 敌人星级：每10波+1星
  const baseStar = Math.min(5, 1 + Math.floor((wave-1) / 30));
  
  // 敌人费用池：随波次提高
  let costPool;
  if (wave <= 5) costPool = [1,1,1,2,2];
  else if (wave <= 10) costPool = [1,2,2,3,3];
  else if (wave <= 20) costPool = [2,2,3,3,4];
  else if (wave <= 40) costPool = [2,3,3,4,5];
  else if (wave <= 60) costPool = [3,3,4,4,5];
  else if (wave <= 80) costPool = [3,4,4,5,5];
  else costPool = [4,4,5,5,5];
  
  // Boss波次加入5费Boss
  const unitIds = Object.keys(UNITS);
  
  const enemies = [];
  for (let i = 0; i < enemyCount; i++) {
    const cost = isBoss && i < 2 ? 5 : costPool[Math.floor(Math.random() * costPool.length)];
    const candidates = unitIds.filter(id => UNITS[id].cost === cost);
    if (candidates.length === 0) continue;
    const id = candidates[Math.floor(Math.random() * candidates.length)];
    // 敌人属性缩放：每波+5%
    const scale = 1 + (wave - 1) * 0.01;
    const star = isBoss ? Math.min(3, baseStar + 1) : baseStar;
    enemies.push({id, star, pos:[2 + (i % 4), Math.floor(i/4) % 2], scale});
  }
  
  return {wave, gold: goldReward, enemies, isBoss};
}

// 前10波固定关卡
const FIXED_LEVELS = [
  {wave:1, gold:6, enemies:[{id:"bingjiang",star:1,pos:[3,0]},{id:"bingjiang",star:1,pos:[4,0]}]},
  {wave:2, gold:8, enemies:[{id:"liehuoshou",star:1,pos:[3,0]},{id:"liehuoshou",star:1,pos:[4,0]},{id:"mujingling",star:1,pos:[3,1]}]},
  {wave:3, gold:9, enemies:[{id:"jinweishi",star:1,pos:[3,0]},{id:"jinweishi",star:1,pos:[4,0]},{id:"tuwushi",star:1,pos:[3,1]},{id:"tuwushi",star:1,pos:[4,1]}]},
  {wave:4, gold:10, enemies:[{id:"shuishen",star:1,pos:[3,1]},{id:"huolong",star:1,pos:[4,1]},{id:"mushuwang",star:1,pos:[3,0]},{id:"jinbiashi",star:1,pos:[4,0]}]},
  {wave:5, gold:12, enemies:[{id:"hailongwang",star:1,pos:[3,1]},{id:"yanlong",star:1,pos:[4,0]},{id:"shushen",star:1,pos:[3,0]},{id:"jiangshi",star:1,pos:[4,1]},{id:"jinshen",star:1,pos:[2,0]}]},
  {wave:6, gold:14, enemies:[{id:"xuanwu",star:1,pos:[3,0]},{id:"zhuque",star:1,pos:[4,1]},{id:"qinglong",star:1,pos:[3,1]},{id:"baihu",star:1,pos:[4,0]},{id:"kunlunling",star:1,pos:[2,1]}]},
  {wave:7, gold:16, enemies:[{id:"xuanwu",star:1,pos:[3,0]},{id:"zhuque",star:1,pos:[4,1]},{id:"qinglong",star:1,pos:[3,1]},{id:"baihu",star:1,pos:[4,0]}]},
  {wave:8, gold:18, enemies:[{id:"longwang",star:1,pos:[3,1]},{id:"fenghuang",star:1,pos:[4,1]},{id:"xuanwu",star:1,pos:[3,0]},{id:"zhuque",star:1,pos:[4,0]},{id:"qinglong",star:1,pos:[2,1]}]},
  {wave:9, gold:20, enemies:[{id:"longwang",star:1,pos:[3,1]},{id:"fenghuang",star:1,pos:[4,1]},{id:"baihu",star:1,pos:[3,0]},{id:"qinglong",star:1,pos:[4,0]},{id:"kunlunling",star:1,pos:[2,1]},{id:"zhuque",star:1,pos:[5,0]}]},
  {wave:10, gold:25, isBoss:true, enemies:[{id:"longwang",star:2,pos:[3,1]},{id:"fenghuang",star:2,pos:[4,1]},{id:"xuanwu",star:2,pos:[3,0]},{id:"zhuque",star:2,pos:[4,0]},{id:"qinglong",star:2,pos:[2,1]},{id:"baihu",star:2,pos:[5,0]},{id:"kunlunling",star:2,pos:[3,3]}]},
];

function getLevel(wave) {
  if (wave <= FIXED_LEVELS.length) return FIXED_LEVELS[wave - 1];
  return generateLevel(wave);
}

// if (typeof module !== 'undefined') module.exports = { UNITS, EQUIPMENT, GEM_TYPES, PETS, WINGS, getLevel };

// === v5 新增系统 ===

// --- 强化系统 ---
const ENHANCE_COSTS = [10, 20, 40, 80, 160, 320, 640, 1280, 2560, 5120]; // +0~+9
const ENHANCE_BONUS = {0:{hp_pct:0,atk_pct:0}, 1:{hp_pct:0.05,atk_pct:0.05}, 2:{hp_pct:0.10,atk_pct:0.10}, 3:{hp_pct:0.15,atk_pct:0.15}, 4:{hp_pct:0.22,atk_pct:0.22}, 5:{hp_pct:0.30,atk_pct:0.30}, 6:{hp_pct:0.40,atk_pct:0.40}, 7:{hp_pct:0.55,atk_pct:0.55}, 8:{hp_pct:0.75,atk_pct:0.75}, 9:{hp_pct:1.0,atk_pct:1.0}};
const ENHANCE_MAX = 9;

// --- 附魔系统 ---
const ENCHANTS = {
  none: {name:"无",emoji:"",stats:{}},
  fire: {name:"火焰附魔",emoji:"🔥",stats:{atk_pct:0.10,bonus_burn:5}},
  ice: {name:"冰霜附魔",emoji:"❄️",stats:{bonus_freeze:0.05,hp:200}},
  thunder: {name:"雷电附魔",emoji:"⚡",stats:{atkSpd:0.15,bonus_chain:0.1}},
  earth: {name:"大地附魔",emoji:"🌍",stats:{hp:500,armor:20}},
  holy: {name:"神圣附魔",emoji:"✨",stats:{hp_pct:0.10,atk_pct:0.10,mr:15}},
  dark: {name:"暗影附魔",emoji:"🌑",stats:{atk_pct:0.15,crit:0.10}},
};
const ENCHANT_COST = 30;
const ENCHANT_SCROLL_DROP = 0.10; // 10%掉落附魔卷轴

// --- 坐骑系统 ---
const MOUNTS = {
  m0: {name:"无坐骑",emoji:"🚶",skill:{type:"none",val:0,desc:"未装备"},cost:0},
  m1: {name:"白马",emoji:"🐴",skill:{type:"hpBonus",val:0.08,desc:"全队生命+8%"},cost:80},
  m2: {name:"战狼",emoji:"🐺",skill:{type:"atkBonus",val:0.08,desc:"全队攻击+8%"},cost:150},
  m3: {name:"赤焰驹",emoji:"🔥",skill:{type:"atkSpd",val:0.10,desc:"全队攻速+10%"},cost:300},
  m4: {name:"玄冰鹿",emoji:"🦌",skill:{type:"dodge",val:0.08,desc:"闪避+8%"},cost:500},
  m5: {name:"麒麟",emoji:"🦄",skill:{type:"allBonus",val:0.12,desc:"全队属性+12%"},cost:1000},
  m6: {name:"神龙",emoji:"🐉",skill:{type:"allBonus",val:0.20,desc:"全队属性+20%"},cost:5000},
};
const MOUNT_UNLOCK_WAVE = 7;

// --- 钻石商店系统 ---
const START_DIAMONDS = 0;
// Boss波掉落钻石
const DIAMOND_DROP_CHANCE = 0.3; // 30%
const DIAMOND_DROP_AMOUNT = 1;
// 每通关10波送1钻石
const DIAMOND_PER_10_WAVES = 1;

const DIAMOND_SHOP = {
  // 神话级物种（只有钻石能买）
  units: {
    myth_pangu:    {name:"盘古",emoji:"🔨",cost:1,race:"tu",job:"zhanshi",base:{hp:3000,atk:300,range:1,atkSpd:0.8,armor:80,mr:50},skill:{name:"开天辟地",desc:"首击3倍伤害+全场震慑",type:"firstDouble",val:3.0},tier:"myth"},
    myth_nuwa:     {name:"女娲",emoji:"🧬",cost:1,race:"tu",job:"fashi",base:{hp:2500,atk:280,range:5,atkSpd:0.85,armor:30,mr:80},skill:{name:"造化万物",desc:"每秒治疗全军5%",type:"heal",val:150},tier:"myth"},
    myth_houyi:    {name:"后羿",emoji:"🏹",cost:1,race:"jin",job:"sheshou",base:{hp:2000,atk:350,range:6,atkSpd:1.0,armor:20,mr:30},skill:{name:"射日",desc:"攻击穿透+3目标",type:"chain",val:0.6},tier:"myth"},
    myth_xingtian: {name:"刑天",emoji:"🪓",cost:1,race:"jin",job:"zhanshi",base:{hp:4000,atk:250,range:1,atkSpd:1.0,armor:100,mr:30},skill:{name:"战神",desc:"永不倒下(复活100%×2)",type:"revive",val:1.0},tier:"myth"},
    // 传说级物种
    legend_huangdi:{name:"黄帝",emoji:"👑",cost:2,race:"tu",job:"zhanshi",base:{hp:2500,atk:250,range:2,atkSpd:0.9,armor:60,mr:40},skill:{name:"天子之威",desc:"全场AOE+友军护甲+30",type:"ultimate",val:0.6},tier:"legend"},
    legend_chiyuo: {name:"蚩尤",emoji:"👹",cost:2,race:"huo",job:"zhanshi",base:{hp:2800,atk:280,range:1,atkSpd:1.1,armor:50,mr:20},skill:{name:"兵主",desc:"攻速+50%+溅射",type:"enrage",val:0.5},tier:"legend"},
    legend_jingwei:{name:"精卫",emoji:"🐦",cost:2,race:"mu",job:"fashi",base:{hp:1800,atk:220,range:5,atkSpd:0.9,armor:15,mr:50},skill:{name:"填海",desc:"持续AOE+回血",type:"heal",val:100},tier:"legend"},
    legend_kuafu:  {name:"夸父",emoji:"🏃",cost:2,race:"huo",job:"zhanshi",base:{hp:3000,atk:200,range:2,atkSpd:0.95,armor:40,mr:15},skill:{name:"逐日",desc:"移动加速+首击双倍",type:"firstDouble",val:2.0},tier:"legend"},
  },
  // 神话传说级装备（只有钻石能买）
  equipment: {
    myth_w: {name:"开天斧",slot:"weapon",rarity:6,stats:{atk:500,atkSpd:0.2,crit:0.3},emoji:"⚡",cost:3},
    myth_a: {name:"混沌钟",slot:"armor",rarity:6,stats:{hp:5000,armor:100,mr:60,dmgReduct:0.15},emoji:"🔮",cost:3},
    myth_acc:{name:"造化玉碟",slot:"accessory",rarity:6,stats:{atk:300,hp:3000,mr:80,crit:0.25,atkSpd:0.2},emoji:"🔯",cost:3},
    legend_w:{name:"轩辕剑",slot:"weapon",rarity:5,stats:{atk:200,atkSpd:0.15,crit:0.2},emoji:"🌟",cost:1},
    legend_a:{name:"天蚕丝甲",slot:"armor",rarity:5,stats:{hp:2000,armor:60,mr:40},emoji:"✨",cost:1},
    legend_acc:{name:"昆仑镜",slot:"accessory",rarity:5,stats:{atk:120,hp:1000,mr:40,crit:0.12},emoji:"🪞",cost:1},
  },
  // 资源兑换
  gold_pack_1: {name:"金币包(100)",emoji:"💰",cost:1,type:"gold",val:100},
  gold_pack_2: {name:"金币包(500)",emoji:"💰",cost:3,type:"gold",val:500},
  gold_pack_3: {name:"金币包(2000)",emoji:"💰",cost:10,type:"gold",val:2000},
  // 附魔卷轴
  enchant_scroll: {name:"附魔卷轴",emoji:"📜",cost:2,type:"enchant_scroll",val:1},
};

// 稀有度6=神话, 7=传说(用于颜色)
const RARITY_COLORS_V5 = {1:'#aaa',2:'#4a9',3:'#4af',4:'#c4f',5:'#f80',6:'#f0f',7:'#ff0'};
const RARITY_NAMES_V5 = {1:'普通',2:'精良',3:'稀有',4:'史诗',5:'传说',6:'神话',7:'神圣'};


// === 兑换码 ===
const REDEEM_CODES = {
  // 通用码
  'huaxia666':   { name:'新手大礼包', gold:500, diamonds:5, desc:'500金+5钻石' },
  'huaxia888':   { name:'进阶礼包',   gold:1000, diamonds:10, enchScrolls:3, desc:'1000金+10钻石+3附魔卷轴' },
  'huaxia999':   { name:'豪华礼包',   gold:2000, diamonds:20, enchScrolls:5, desc:'2000金+20钻石+5附魔卷轴' },
  'richie555':   { name:'开发者礼包', gold:5000, diamonds:50, enchScrolls:10, desc:'5000金+50钻石+10附魔卷轴' },
  'tianxia':     { name:'天下无敌',   gold:3000, diamonds:30, gems:{red:3,blue:3,green:3,yellow:3,purple:3}, desc:'3000金+30钻石+各色宝石x3' },
  'kaifu':       { name:'开服大礼',   gold:800, diamonds:8, desc:'800金+8钻石' },
  // 节日码（可自行扩展）
  'spring2025':  { name:'新春礼包',   gold:1500, diamonds:15, enchScrolls:5, desc:'1500金+15钻石+5附魔卷轴' },
  'vip9999999':  { name:'至尊VIP',    gold:9999999, diamonds:9999999, enchScrolls:999, desc:'9999999金+9999999钻石+999附魔卷轴' },
};
