// 自走棋·华夏 - 数据模型 v1
// 20个单位，5种族 4职业羁绊，10关PVE

// === 单位定义 ===
// cost: 1-5费, race: 种族, job: 职业, stats按星级倍率
const UNITS = {
  // --- 1费 ---
  bingjiang: {name:"冰将",emoji:"❄️",cost:1,race:"shui",job:"zhanshi",base:{hp:600,atk:55,range:1,atkSpd:1.0,armor:15,mr:0},skill:{name:"寒冰斩",desc:"攻击15%概率冻结1秒",type:"freeze",val:1.5}},
  liehuoshou:{name:"猎火兽",emoji:"🔥",cost:1,race:"huo",job:"sheshou",base:{hp:500,atk:60,range:3,atkSpd:0.9,armor:8,mr:0},skill:{name:"火箭",desc:"攻击附带灼烧",type:"burn",val:0.3}},
  mujingling:{name:"木精灵",emoji:"🌿",cost:1,race:"mu",job:"fashi",base:{hp:450,atk:65,range:4,atkSpd:0.8,armor:5,mr:20},skill:{name:"缠绕",desc:"攻击减速30%",type:"slow",val:0.3}},
  jinweishi: {name:"金卫士",emoji:"⚔️",cost:1,race:"jin",job:"zhanshi",base:{hp:700,atk:45,range:1,atkSpd:1.0,armor:25,mr:0},skill:{name:"铁壁",desc:"受击减伤20%",type:"dmgReduct",val:0.2}},
  tuwushi:   {name:"土巫师",emoji:"🪨",cost:1,race:"tu",job:"fashi",base:{hp:480,atk:55,range:4,atkSpd:0.7,armor:5,mr:15},skill:{name:"落石",desc:"攻击溅射",type:"splash",val:0.4}},

  // --- 2费 ---
  shuishen:  {name:"水神",emoji:"💧",cost:2,race:"shui",job:"fashi",base:{hp:700,atk:80,range:5,atkSpd:0.75,armor:5,mr:30},skill:{name:"水龙波",desc:"AOE伤害",type:"aoe",val:0.5}},
  huolong:   {name:"火龙",emoji:"🐉",cost:2,race:"huo",job:"sheshou",base:{hp:750,atk:85,range:3,atkSpd:0.85,armor:10,mr:0},skill:{name:"龙息",desc:"范围灼烧",type:"aoeBurn",val:0.3}},
  mushuwang: {name:"木鼠王",emoji:"🐭",cost:2,race:"mu",job:"zhanshi",base:{hp:900,atk:70,range:1,atkSpd:1.1,armor:18,mr:0},skill:{name:"狂暴",desc:"血量<40%攻速+50%",type:"enrage",val:0.5}},
  jinbiashi: {name:"金镖师",emoji:"🪙",cost:2,race:"jin",job:"sheshou",base:{hp:600,atk:75,range:3,atkSpd:1.0,armor:10,mr:0},skill:{name:"飞镖",desc:"攻击穿透",type:"pierce",val:0.5}},
  tuling:    {name:"土灵",emoji:"🗿",cost:2,race:"tu",job:"fashi",base:{hp:800,atk:70,range:4,atkSpd:0.7,armor:15,mr:20},skill:{name:"石化",desc:"20%概率石化1秒",type:"petrify",val:0.2}},

  // --- 3费 ---
  hailongwang:{name:"海龙王",emoji:"🌊",cost:3,race:"shui",job:"fashi",base:{hp:1000,atk:100,range:5,atkSpd:0.8,armor:8,mr:35},skill:{name:"海啸",desc:"大范围AOE+减速",type:"aoeSlow",val:0.6}},
  yanlong:   {name:"炎龙",emoji:"🌋",cost:3,race:"huo",job:"zhanshi",base:{hp:1100,atk:95,range:1,atkSpd:0.9,armor:20,mr:0},skill:{name:"烈焰冲撞",desc:"冲入敌阵灼烧",type:"chargeBurn",val:0.4}},
  shushen:   {name:"树神",emoji:"🌳",cost:3,race:"mu",job:"fashi",base:{hp:950,atk:105,range:5,atkSpd:0.75,armor:8,mr:30},skill:{name:"生命之愈",desc:"每秒治疗友军",type:"heal",val:30}},
  jiangshi:  {name:"僵尸",emoji:"🧟",cost:3,race:"tu",job:"zhanshi",base:{hp:1200,atk:80,range:1,atkSpd:0.8,armor:25,mr:0},skill:{name:"不灭",desc:"死亡后复活一次50%血",type:"revive",val:0.5}},
  jinshen:   {name:"金神",emoji:"✨",cost:3,race:"jin",job:"sheshou",base:{hp:850,atk:100,range:4,atkSpd:1.0,armor:12,mr:10},skill:{name:"金光斩",desc:"暴击率+30%",type:"crit",val:0.3}},

  // --- 4费 ---
  xuanwu:    {name:"玄武",emoji:"🐢",cost:4,race:"shui",job:"zhanshi",base:{hp:1400,atk:110,range:1,atkSpd:0.85,armor:35,mr:20},skill:{name:"玄甲",desc:"开局护盾500",type:"shield",val:500}},
  zhuque:    {name:"朱雀",emoji:"🦅",cost:4,race:"huo",job:"fashi",base:{hp:1100,atk:130,range:5,atkSpd:0.8,armor:8,mr:35},skill:{name:"涅槃",desc:"死亡复活100%血(一次)",type:"revive",val:1.0}},
  qinglong:  {name:"青龙",emoji:"🐲",cost:4,race:"mu",job:"sheshou",base:{hp:1200,atk:120,range:3,atkSpd:1.0,armor:15,mr:15},skill:{name:"龙吟",desc:"攻击附带闪电链",type:"chain",val:0.4}},
  baihu:     {name:"白虎",emoji:"🐅",cost:4,race:"jin",job:"zhanshi",base:{hp:1300,atk:125,range:1,atkSpd:1.0,armor:30,mr:10},skill:{name:"虎啸",desc:"首击双倍伤害",type:"firstDouble",val:2.0}},
  kunlunling:{name:"昆仑灵",emoji:"🏔️",cost:4,race:"tu",job:"fashi",base:{hp:1150,atk:125,range:5,atkSpd:0.75,armor:10,mr:35},skill:{name:"山崩",desc:"AOE+眩晕",type:"aoeStun",val:0.5}},

  // --- 5费（终极） ---
  longwang:  {name:"龙王",emoji:"👑",cost:5,race:"shui",job:"fashi",base:{hp:1600,atk:150,range:6,atkSpd:0.85,armor:15,mr:40},skill:{name:"龙神降临",desc:"全场AOE+减速50%",type:"ultimate",val:0.8}},
  fenghuang: {name:"凤凰",emoji:"🦚",cost:5,race:"huo",job:"fashi",base:{hp:1400,atk:155,range:5,atkSpd:0.85,armor:10,mr:40},skill:{name:"浴火重生",desc:"死亡复活+全场灼烧",type:"reviveBurn",val:1.0}},
};

// === 种族羁绊 ===
const RACES = {
  jin:  {name:"金",color:"#c8a04a",buffs:{2:{desc:"护甲+15",type:"armor",val:15},4:{desc:"护甲+30，受击反伤10",type:"armorReflect",val:30}}},
  mu:   {name:"木",color:"#4a9eff",buffs:{2:{desc:"生命+200",type:"hp",val:200},4:{desc:"生命+500，每秒回血1%",type:"hpRegen",val:500}}},
  shui: {name:"水",color:"#3a9eff",buffs:{2:{desc:"魔抗+20",type:"mr",val:20},4:{desc:"魔抗+40，受击减速攻击者",type:"mrSlow",val:40}}},
  huo:  {name:"火",color:"#ff6a3a",buffs:{2:{desc:"攻击+15%",type:"atkPct",val:0.15},4:{desc:"攻击+30%，攻击附带灼烧",type:"atkBurn",val:0.3}}},
  tu:   {name:"土",color:"#8a7a5a",buffs:{2:{desc:"生命+150，护甲+10",type:"hpArmor",val:150},4:{desc:"生命+400，护甲+25",type:"hpArmor2",val:400}}},
};

// === 职业羁绊 ===
const JOBS = {
  zhanshi:{name:"战士",buffs:{3:{desc:"护甲+20",type:"armor",val:20},6:{desc:"护甲+40，生命+300",type:"armorHp",val:40}}},
  sheshou: {name:"射手",buffs:{3:{desc:"攻击+20%",type:"atkPct",val:0.2},6:{desc:"攻击+40%，射程+1",type:"atkRange",val:0.4}}},
  fashi:   {name:"法师",buffs:{3:{desc:"技能伤害+30%",type:"skillDmg",val:0.3},6:{desc:"技能伤害+60%，减敌方魔抗20",type:"skillMrReduce",val:0.6}}},
};

// === PVE 关卡 ===
const LEVELS = [
  {wave:1, gold:5, enemies:[{id:"bingjiang",star:1,pos:[3,0]},{id:"bingjiang",star:1,pos:[4,0]}]},
  {wave:2, gold:6, enemies:[{id:"liehuoshou",star:1,pos:[3,0]},{id:"liehuoshou",star:1,pos:[4,0]},{id:"mujingling",star:1,pos:[3,1]}]},
  {wave:3, gold:7, enemies:[{id:"jinweishi",star:1,pos:[3,0]},{id:"jinweishi",star:1,pos:[4,0]},{id:"tuwushi",star:1,pos:[3,1]},{id:"tuwushi",star:1,pos:[4,1]}]},
  {wave:4, gold:8, enemies:[{id:"shuishen",star:1,pos:[3,1]},{id:"huolong",star:1,pos:[4,1]},{id:"mushuwang",star:1,pos:[3,0]},{id:"jinbiashi",star:1,pos:[4,0]}]},
  {wave:5, gold:10, enemies:[{id:"hailongwang",star:1,pos:[3,1]},{id:"yanlong",star:1,pos:[4,0]},{id:"shushen",star:1,pos:[3,0]},{id:"jiangshi",star:1,pos:[4,1]},{id:"jinshen",star:1,pos:[2,0]}]},
  {wave:6, gold:12, enemies:[{id:"xuanwu",star:1,pos:[3,0]},{id:"zhuque",star:1,pos:[4,1]},{id:"qinglong",star:1,pos:[3,1]},{id:"baihu",star:1,pos:[4,0]},{id:"kunlunling",star:1,pos:[2,1]}]},
  {wave:7, gold:14, enemies:[{id:"xuanwu",star:2,pos:[3,0]},{id:"zhuque",star:2,pos:[4,1]},{id:"qinglong",star:2,pos:[3,1]},{id:"baihu",star:2,pos:[4,0]}]},
  {wave:8, gold:16, enemies:[{id:"longwang",star:1,pos:[3,1]},{id:"fenghuang",star:1,pos:[4,1]},{id:"xuanwu",star:2,pos:[3,0]},{id:"zhuque",star:2,pos:[4,0]},{id:"qinglong",star:2,pos:[2,1]}]},
  {wave:9, gold:18, enemies:[{id:"longwang",star:2,pos:[3,1]},{id:"fenghuang",star:2,pos:[4,1]},{id:"baihu",star:2,pos:[3,0]},{id:"qinglong",star:2,pos:[4,0]},{id:"kunlunling",star:2,pos:[2,1]},{id:"zhuque",star:2,pos:[5,0]}]},
  {wave:10, gold:20, enemies:[{id:"longwang",star:3,pos:[3,1]},{id:"fenghuang",star:3,pos:[4,1]},{id:"xuanwu",star:3,pos:[3,0]},{id:"zhuque",star:3,pos:[4,0]},{id:"qinglong",star:3,pos:[2,1]},{id:"baihu",star:3,pos:[5,0]},{id:"kunlunling",star:3,pos:[3,3]}]},
];

// 升星倍率
const STAR_MULT = {1:1, 2:1.8, 3:3.0};
// 合成需要数量
const MERGE_NEED = 3;
// 商店每回合刷新数
const SHOP_SIZE = 5;
// 棋盘大小
const BOARD_W = 8, BOARD_H = 4; // 玩家半场 8x4
// 备战席数量
const BENCH_SIZE = 9;
// 初始金币
const START_GOLD = 8;
// 利息每5金1利息，上限5
const INTEREST_PER = 5, INTEREST_MAX = 5;
// 连胜/连败奖励
const STREAK_GOLD = {1:0, 2:1, 3:2, 4:2, 5:3, 6:3, 7:4, 8:4, 9:5};
// 买经验费用（每次2金，4次升1级）
const XP_COST = 2;
const XP_PER_LEVEL = 4;
const MAX_PLAYER_LEVEL = 8;

// 商店概率（按费用）[1费,2费,3费,4费,5费]
const SHOP_ODDS = {
  1: [100,0,0,0,0],
  2: [80,20,0,0,0],
  3: [65,30,5,0,0],
  4: [50,35,12,3,0],
  5: [40,35,18,6,1],
  6: [25,35,25,10,5],
  7: [20,30,28,15,7],
  8: [15,25,30,20,10],
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UNITS, RACES, JOBS, LEVELS, STAR_MULT, MERGE_NEED, SHOP_SIZE, BOARD_W, BOARD_H, BENCH_SIZE, START_GOLD, INTEREST_PER, INTEREST_MAX, STREAK_GOLD, LEVEL_UP_COST, MAX_PLAYER_LEVEL, SHOP_ODDS };
}
