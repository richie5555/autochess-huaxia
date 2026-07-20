// 自走棋·华夏 v4 — 核心引擎（无限关卡+装备+宝石+宠物+翅膀）
(function() {
  'use strict';

  const STORAGE_KEY = 'autochess_huaxia_save_v4';
  let state = null, battle = null, audioCtx = null;

  function defaultState() {
    return {
      wave: 1, gold: START_GOLD, playerLevel: 3, xp: 0,
      winStreak: 0, loseStreak: 0,
      board: {}, bench: [], shop: [], lockedShop: false,
      discovered: [...Object.keys(UNITS).slice(0,5)],
      battleLog: [],
      inventory: [], gems: {red:0, blue:0, green:0, yellow:0, purple:0},
      equipped: {}, gemSlots: {}, pet: null, petUnlocked: [],
      wing: 'w0', wingUnlocked: ['w0'], totalWaves: 0,
      diamonds: 0, mount: 'm0', mountUnlocked: ['m0'],
      enhance: {}, // {unitKey: level}
      enchant: {}, // {unitKey: enchantId}
      enchantScrolls: 0,
    };
  }
  function loadState() {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) {
        state = JSON.parse(s);
        state.wave = state.wave || 1;
        // 初始化v5新增字段（兼容v4存档）
        if (state.diamonds === undefined) state.diamonds = 0;
        if (!state.mount) state.mount = 'm0';
        if (!state.mountUnlocked) state.mountUnlocked = ['m0'];
        if (!state.enhance) state.enhance = {};
        if (!state.enchant) state.enchant = {};
        return true;
      }
    } catch(e) {}
    state = defaultState(); return false;
  }
  function saveState() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {} }

  function getMaxBoard() { return state.playerLevel + 2; }
  function canPlaceOnBoard() { return Object.keys(state.board).length < getMaxBoard(); }
  function getShopOdds() { return SHOP_ODDS[Math.min(state.playerLevel, 10)] || SHOP_ODDS[10]; }
  function rollUnit() {
    const odds = getShopOdds(); const r = Math.random() * 100;
    let cost = 1, acc = 0;
    for (let i = 0; i < 5; i++) { acc += odds[i]; if (r < acc) { cost = i + 1; break; } }
    const pool = Object.keys(UNITS).filter(id => UNITS[id].cost === cost);
    return pool.length ? pool[Math.floor(Math.random()*pool.length)] : Object.keys(UNITS)[0];
  }
  function refreshShop() { if (!state.lockedShop) state.shop = Array.from({length: SHOP_SIZE}, () => rollUnit()); }
  function toggleLock() { state.lockedShop = !state.lockedShop; saveState(); render(); }
  function buyXP() {
    
    if (state.gold < XP_COST) { toast('💰金币不足！'); return; }
    state.gold -= XP_COST; state.xp += 1 + (state.pet === 'p4' ? 0.3 : 0);
    while (state.xp >= XP_PER_LEVEL) {
      state.xp -= XP_PER_LEVEL; state.playerLevel++;
      toast(`等级提升至Lv.${state.playerLevel}！可上场${getMaxBoard()}个`, '⭐');
    }
    saveState(); render();
  }
  function buyUnit(idx) {
    const id = state.shop[idx];
    if (!id) { toast('已购买'); return; }
    const cost = UNITS[id].cost;
    if (state.gold < cost) { toast('💰金币不足！'); sfx.fail(); return; }
    if (state.bench.length >= BENCH_SIZE && Object.keys(state.board).length >= getMaxBoard()) { toast('备战席和棋盘都满了！'); return; }
    state.gold -= cost; state.shop[idx] = null;
    if (!state.discovered.includes(id)) state.discovered.push(id);
    let placed = false;
    if (canPlaceOnBoard()) {
      for (let y = 4; y < 8; y++) { for (let x = 0; x < BOARD_W; x++) { const key = `${x},${y}`; if (!state.board[key]) { state.board[key] = {id, star:1}; placed = true; break; } } if (placed) break; }
    }
    if (!placed) state.bench.push({id, star:1});
    tryMerge(id, 1); saveState(); render();
  }
  function tryMerge(id, star) {
    const bench = state.bench.filter(u => u.id === id && u.star === star);
    const onBoard = Object.entries(state.board).filter(([k,v]) => v.id === id && v.star === star);
    if (bench.length + onBoard.length >= MERGE_NEED) {
      let removed = 0;
      for (let i = state.bench.length - 1; i >= 0 && removed < MERGE_NEED; i--) {
        if (state.bench[i].id === id && state.bench[i].star === star) { state.bench.splice(i, 1); removed++; }
      }
      if (removed < MERGE_NEED) { for (const [key, val] of Object.entries(state.board)) { if (removed >= MERGE_NEED) break; if (val.id === id && val.star === star) { delete state.board[key]; removed++; } } }
      const newStar = star + 1;
      state.bench.push({id, star: newStar}); toast(`${UNITS[id].emoji} ${UNITS[id].name} 升至${newStar}星！`, '⭐'); sfx.discover(); tryMerge(id, newStar);
      return true;
    }
    return false;
  }
  function placeUnit(benchIdx, x, y) {
    const unit = state.bench[benchIdx]; if (!unit) return;
    const key = `${x},${y}`; if (state.board[key]) { toast('该位置已有单位！'); return; }
    if (!canPlaceOnBoard()) { toast(`上场已达上限(${getMaxBoard()})！`); return; }
    state.board[key] = {...unit}; state.bench.splice(benchIdx, 1); saveState(); render();
  }
  function sellUnit(fromBoard, key) {
    let refund = 0;
    if (fromBoard) {
      const u = state.board[key]; if (!u) return;
      refund = Math.floor(UNITS[u.id].cost * Math.pow(3, u.star - 1) * 0.7);
      // 退回装备
      const eq = state.equipped[key];
      if (eq) { for (const slot of EQUIP_SLOTS) { if (eq[slot]) state.inventory.push(eq[slot]); } delete state.equipped[key]; }
      delete state.board[key]; delete state.enhance[key]; delete state.enchant[key];
    } else {
      // 备战席卖出
      const idx = key;
      const u = state.bench[idx]; if (!u) return;
      refund = Math.floor(UNITS[u.id].cost * Math.pow(3, u.star - 1) * 0.7);
      state.bench.splice(idx, 1);
    }
    state.gold += refund; saveState(); render();
  }


  function getSynergies(board) {
    const raceCount = {}, jobCount = {}, seen = new Set();
    for (const [key, unit] of Object.entries(board)) {
      if (seen.has(unit.id + unit.star)) continue;
      seen.add(unit.id + unit.star);
      const def = UNITS[unit.id];
      raceCount[def.race] = (raceCount[def.race]||0) + 1;
      jobCount[def.job] = (jobCount[def.job]||0) + 1;
    }
    const active = [];
    for (const [r, n] of Object.entries(raceCount)) {
      const buffs = Object.keys(RACES[r].buffs).map(Number).sort((a,b)=>a-b);
      for (const t of buffs) active.push({type:'race',key:r,name:RACES[r].name,count:n,need:t,desc:RACES[r].buffs[t].desc,active:n>=t,color:RACES[r].color});
    }
    for (const [j, n] of Object.entries(jobCount)) {
      const buffs = Object.keys(JOBS[j].buffs).map(Number).sort((a,b)=>a-b);
      for (const t of buffs) active.push({type:'job',key:j,name:JOBS[j].name,count:n,need:t,desc:JOBS[j].buffs[t].desc,active:n>=t});
    }
    return active.filter(s => s.active || s.count >= s.need);
  }
  function getSynergiesFromUnits(units) { const fb = {}; units.forEach((u,i) => fb[i] = u); return getSynergies(fb); }

  function calcStats(unit, key) {
    const def = UNITS[unit.id];
    const starMul = unit.star <= 1 ? 1 : unit.star === 2 ? 1.8 : 3 * Math.pow(1.5, unit.star - 3);
    let hp = def.base.hp * starMul, atk = def.base.atk * starMul;
    let range = def.base.range, atkSpd = def.base.atkSpd;
    let armor = def.base.armor * starMul, mr = def.base.mr * starMul;
    const eq = state.equipped[key];
    if (eq) for (const slot of EQUIP_SLOTS) { const eId = eq[slot]; if (eId && EQUIPMENT[eId]) { const s = EQUIPMENT[eId].stats; if (s.hp) hp += s.hp; if (s.atk) atk += s.atk; if (s.armor) armor += s.armor; if (s.mr) mr += s.mr; if (s.atkSpd) atkSpd += s.atkSpd; } }
    if (state.pet) { const p = PETS[state.pet]; if (p) { if (p.skill.type==='hpBonus') hp*=(1+p.skill.val); if (p.skill.type==='atkBonus') atk*=(1+p.skill.val); if (p.skill.type==='allBonus') { hp*=(1+p.skill.val); atk*=(1+p.skill.val); } } }
    if (state.wing && state.wing!=='w0') { const w = WINGS[state.wing]; if (w && w.skill.type==='allStat') { hp*=(1+w.skill.val); atk*=(1+w.skill.val); } }
    // 宝石加成
    for (const [color, g] of Object.entries(GEM_TYPES)) { const lv = state.gems[color+'_level']||0; if (lv>0) { if (g.stat==='hp') hp += g.valPerLevel*lv; if (g.stat==='atk') atk += g.valPerLevel*lv; if (g.stat==='mr') mr += g.valPerLevel*lv; if (g.stat==='atkSpd') atkSpd += g.valPerLevel*lv; if (g.stat==='crit') atk += 0; } }
    // 强化加成
    const enhLv = state.enhance[key]||0;
    if (enhLv>0) { const b=ENHANCE_BONUS[enhLv]; if(b){ hp*=(1+b.hp_pct); atk*=(1+b.atk_pct); } }
    // 附魔加成
    const ench = state.enchant[key];
    if (ench && ENCHANTS[ench]) { const es=ENCHANTS[ench].stats; if(es.hp) hp+=es.hp; if(es.atk_pct) atk*=(1+es.atk_pct); if(es.hp_pct) hp*=(1+es.hp_pct); if(es.atkSpd) atkSpd+=es.atkSpd; if(es.armor) armor+=es.armor; if(es.mr) mr+=es.mr; if(es.crit) atk+=0; }
    // 坐骑加成
    if (state.mount && state.mount!=='m0') { const m=MOUNTS[state.mount]; if(m){ if(m.skill.type==='hpBonus') hp*=(1+m.skill.val); if(m.skill.type==='atkBonus') atk*=(1+m.skill.val); if(m.skill.type==='allBonus'){ hp*=(1+m.skill.val); atk*=(1+m.skill.val); } if(m.skill.type==='atkSpd') atkSpd+=m.skill.val; } }
    return {hp:Math.round(hp), maxHp:Math.round(hp), atk:Math.round(atk), range, atkSpd, armor:Math.round(armor), mr:Math.round(mr), skill:def.skill, emoji:def.emoji, name:def.name, star:unit.star, cost:def.cost};
  }


  function makeCombatant(u, team, x, y, key) {
    const c = calcStats(u, key);
    c.team = team; c.x = x; c.y = y; c.key = key || '';
    c.atkCd = 0; c.dead = false; c.target = null;
    c.attackFlash = 0; c.skillFlash = 0; c.hitFlash = 0;
    c.deathFade = 0; c.dmgTexts = []; c.revived = false;
    c.crit = 0; c.dodge = 0; c.dmgReduct = 0;
    const eq = state.equipped[key];
    if (eq) for (const slot of EQUIP_SLOTS) { const eId = eq ? eq[slot] : null; if (eId && EQUIPMENT[eId]) { const s = EQUIPMENT[eId].stats; if (s.crit) c.crit += s.crit; if (s.dmgReduct) c.dmgReduct += s.dmgReduct; } }
    if (state.wing && state.wing!=='w0') { const w = WINGS[state.wing]; if (w && w.skill.type==='dodge') c.dodge += w.skill.val; }
    return c;
  }
  function applySynergyBuffs(units, synergies) {
    for (const s of synergies) { if (!s.active) continue; const buff = (s.type==='race'?RACES[s.key].buffs:JOBS[s.key].buffs)[s.need]; if (!buff) continue; for (const u of units) {
      if (buff.type==='armor') u.armor += buff.val;
      else if (buff.type==='armorReflect') { u.armor += buff.val; u.reflect = (u.reflect||0) + 10; }
      else if (['hp','hpArmor','hpArmor2','hpArmor3','hpRegen'].includes(buff.type)) { u.hp += buff.val; u.maxHp += buff.val; if (buff.type==='hpArmor') u.armor += 10; if (buff.type==='hpArmor2') u.armor += 25; if (buff.type==='hpArmor3') u.armor += 50; if (buff.type==='hpRegen') u.regen = (u.regen||0) + Math.ceil(u.maxHp*0.01); }
      else if (['mr','mrSlow'].includes(buff.type)) u.mr += buff.val;
      else if (['atkPct','atkBurn','atkAoeBurn'].includes(buff.type)) u.atk = Math.round(u.atk * (1+buff.val));
      else if (buff.type==='armorHp') { u.armor += buff.val; u.hp += 200; u.maxHp += 200; }
      else if (buff.type==='atkRange') u.atk = Math.round(u.atk * (1+buff.val));
      else if (['skillDmg','skillMrReduce'].includes(buff.type)) u.skillDmg = (u.skillDmg||1) * (1+buff.val);
    } }
  }
  function applySkillEffect(u, target, all) {
    const sk = u.skill; if (!sk) return; const sdm = u.skillDmg || 1;
    if (['freeze','petrify','aoeStun'].includes(sk.type)) target.stunTimer = (target.stunTimer||0) + 60 * sk.val;
    else if (['burn','aoeBurn','chargeBurn'].includes(sk.type)) { target.burnTimer = (target.burnTimer||0) + 180; target.burnDmg = Math.max(target.burnDmg||0, Math.round(u.atk*sk.val)); }
    else if (['aoe','aoeSlow','splash','ultimate'].includes(sk.type)) { const ad = Math.round(u.atk*sk.val*sdm); for (const t of all) { if (t.team===u.team||t.dead) continue; if (Math.max(Math.abs(t.x-u.x),Math.abs(t.y-u.y))<=2) { t.hp -= ad; t.dmgTexts.push({val:ad,life:40,x:0,y:0,crit:true}); t.hitFlash=10; } } if (['aoeSlow','ultimate'].includes(sk.type)) for (const t of all) if (t.team!==u.team&&!t.dead) t.slowTimer=120; }
    else if (sk.type==='heal') for (const t of all) if (t.team===u.team&&!t.dead&&t.hp<t.maxHp) t.hp = Math.min(t.maxHp, t.hp+sk.val*2);
    else if (sk.type==='chain') { let h=0, c=target; while(h<3&&c) { c.hp -= Math.round(u.atk*sk.val*sdm); c.dmgTexts.push({val:Math.round(u.atk*sk.val),life:40,x:0,y:0,crit:false}); c.hitFlash=10; let n=null,md=99; for (const t of all) if (t.team!==u.team&&!t.dead&&t!==c) { const d=Math.max(Math.abs(t.x-c.x),Math.abs(t.y-c.y)); if(d<md&&d<=3){md=d;n=t;} } c=n; h++; } }
    else if (sk.type==='crit') u.crit += sk.val;
    else if (sk.type==='firstDouble') { if (!u.firstHit) { u.firstHit=true; target.hp -= u.atk; target.dmgTexts.push({val:u.atk,life:40,x:0,y:0,crit:true}); target.hitFlash=10; } }
    else if (sk.type==='shield') u.shield = (u.shield||0) + sk.val;
    else if (['revive','reviveBurn'].includes(sk.type)) u.revivePct = sk.val;
    else if (sk.type==='dmgReduct') u.dmgReduct = (u.dmgReduct||0) + sk.val;
    else if (sk.type==='enrage') u.enrage = sk.val;
    else if (sk.type==='slow') target.slowTimer = (target.slowTimer||0) + 60;
  }


  function startBattleAnim(playerBoard, enemyUnits, callback) {
    const synergies = getSynergies(playerBoard);
    const player = [];
    for (const [key, u] of Object.entries(playerBoard)) { const [x,y] = key.split(',').map(Number); player.push(makeCombatant(u,'player',x,y,key)); }
    const enemy = [];
    for (const e of enemyUnits) { const ec = makeCombatant(e,'enemy',e.pos[0],e.pos[1]); if (e.scale) { ec.hp=Math.round(ec.hp*e.scale); ec.maxHp=ec.hp; ec.atk=Math.round(ec.atk*e.scale); } enemy.push(ec); }
    applySynergyBuffs(player, synergies); applySynergyBuffs(enemy, getSynergiesFromUnits(enemyUnits));
    if (state.pet==='p5') for (const p of player) p.revivePct = 0.3;
    const all = [...player, ...enemy];
    const overlay = document.getElementById('battle-overlay');
    const canvas = document.getElementById('battle-canvas');
    const info = document.getElementById('battle-info');
    overlay.classList.remove('hidden');
    canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight;
    const cw = canvas.width/8, ch = canvas.height/8;
    battle = {all, player, enemy, tick:0, maxTick:600, done:false, callback, cw, ch, synergies, overlay, canvas, info, lastTime:0};
    
    setTimeout(frame, 16);
  }
  function frame() {
    if (!battle || battle.done) return;
    var now = Date.now();
    var dt = battle.lastTime ? Math.min(200, now - battle.lastTime) : 16;
    battle.lastTime = now;
    var steps = Math.max(1, Math.round(dt / 16));
    for (var s = 0; s < steps && !battle.done; s++) {
      battle.tick++;
    for (const u of battle.all) {
      if (u.hp <= 0) { if (u.revivePct && !u.revived) { u.revived=true; u.hp=Math.round(u.maxHp*u.revivePct); u.shield=0; u.stunTimer=0; u.dmgTexts.push({val:0,life:40,x:0,y:0,crit:false,heal:true}); } else { u.dead=true; u.deathFade=Math.min(1,u.deathFade+0.05); continue; } }
      if (u.hitFlash>0) u.hitFlash--; if (u.attackFlash>0) u.attackFlash--; if (u.skillFlash>0) u.skillFlash--;
      u.dmgTexts = (u.dmgTexts||[]).filter(d => { d.life--; return d.life>0; });
      if (u.regen && battle.tick%60===0) u.hp = Math.min(u.maxHp, u.hp+u.regen);
      if (u.burnTimer>0) { u.burnTimer--; if (battle.tick%30===0) { u.hp -= u.burnDmg||0; u.dmgTexts.push({val:u.burnDmg,life:30,x:0,y:0,crit:false}); } }
      if (u.stunTimer>0) { u.stunTimer--; continue; }
      if (u.slowTimer>0) u.slowTimer--;
      if (!u.target || u.target.hp<=0) { let md=Infinity; for (const t of battle.all) { if (t.team===u.team||t.hp<=0) continue; const d=Math.abs(t.x-u.x)+Math.abs(t.y-u.y); if (d<md) { md=d; u.target=t; } } }
      if (!u.target) continue;
      const dist = Math.max(Math.abs(u.target.x-u.x), Math.abs(u.target.y-u.y));
      if (dist <= u.range) {
        u.atkCd--;
        const es = u.enrage && u.hp < u.maxHp*0.4 ? u.atkSpd*(1+u.enrage) : u.atkSpd;
        const sm = u.slowTimer>0 ? 0.7 : 1;
        if (u.atkCd <= 0) {
          u.atkCd = Math.ceil(60/(es*sm)); u.attackFlash = 10;
          let dmg = Math.max(1, u.atk - Math.round(u.target.armor*0.5));
          const isCrit = Math.random() < (u.crit||0);
          if (isCrit) dmg = Math.round(dmg*1.8);
          if (u.target.dodge>0 && Math.random()<u.target.dodge) { u.target.dmgTexts.push({val:0,life:30,x:0,y:0,crit:false,miss:true}); continue; }
          if (u.target.dmgReduct>0) dmg = Math.round(dmg*(1-u.target.dmgReduct));
          if (u.target.shield>0) { const ab = Math.min(u.target.shield, dmg); u.target.shield -= ab; dmg -= ab; }
          u.target.hp -= dmg; u.target.hitFlash = 10;
          u.target.dmgTexts.push({val:dmg,life:40,x:(Math.random()-0.5)*0.5,y:0,crit:isCrit});
          if (u.target.reflect) { u.hp -= Math.round(dmg*u.target.reflect/100); u.hitFlash=10; }
          if (u.skill && Math.random()<0.15) { u.skillFlash=20; applySkillEffect(u, u.target, battle.all); }
        }
      } else {
        const dx = Math.sign(u.target.x-u.x), dy = Math.sign(u.target.y-u.y);
        const sp = 0.15 * (u.slowTimer>0 ? 0.5 : 1);
        if (Math.abs(u.target.x-u.x) > Math.abs(u.target.y-u.y)) u.x += dx*sp; else u.y += dy*sp;
      }
    }
    } // end steps loop
    const pAlive = battle.player.filter(u=>u.hp>0).length;
    const eAlive = battle.enemy.filter(u=>u.hp>0).length;
    drawBattle(battle.canvas, battle);
    battle.info.innerHTML = `<span class="battle-tick">⏱ ${(battle.tick/60).toFixed(1)}s</span> <span class="battle-alive" style="color:${pAlive>eAlive?'#3fb950':pAlive<eAlive?'#f85149':'#e6edf3'}">我方 ${pAlive} vs 敌方 ${eAlive}</span>`;
    if (pAlive===0 || eAlive===0 || battle.tick>=battle.maxTick) {
      battle.done = true; const won = eAlive===0 && pAlive>0;
      const cb = battle.callback, sy = battle.synergies, ov = battle.overlay;
      setTimeout(() => { try { ov.classList.add('hidden'); cb({won, pAlive, eAlive, ticks: battle.tick, synergies: sy}); } catch(e) { console.error('battle callback error:', e.message); } battle = null; }, 300);
      return;
    }
    setTimeout(frame, 16);
  }


  function drawBattle(canvas, b) {
    const ctx = canvas.getContext('2d'), cw = b.cw, ch = b.ch;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (let y=0; y<8; y++) for (let x=0; x<8; x++) { ctx.fillStyle = y>=4 ? 'rgba(63,185,80,0.08)' : 'rgba(248,81,73,0.08)'; ctx.fillRect(x*cw,y*ch,cw,ch); ctx.strokeStyle='#30363d'; ctx.lineWidth=0.5; ctx.strokeRect(x*cw,y*ch,cw,ch); }
    ctx.strokeStyle='rgba(200,160,74,0.3)'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(0,4*ch); ctx.lineTo(canvas.width,4*ch); ctx.stroke();
    for (const u of b.all) { if (u.dead) continue; if (u.attackFlash>0 && u.target && !u.target.dead) { const px=u.x*cw+cw/2,py=u.y*ch+ch/2,tx=u.target.x*cw+cw/2,ty=u.target.y*ch+ch/2; ctx.strokeStyle=u.team==='player'?`rgba(255,255,0,${u.attackFlash/10})`:`rgba(255,100,0,${u.attackFlash/10})`; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(tx,ty); ctx.stroke(); } }
    for (const u of b.all) {
      const px=u.x*cw+cw/2, py=u.y*ch+ch/2, r=Math.min(cw,ch)*0.34;
      if (u.dead) { if (u.deathFade>=1) continue; ctx.globalAlpha=1-u.deathFade; }
      if (u.skillFlash>0) { ctx.fillStyle=`rgba(255,255,100,${u.skillFlash/20*0.35})`; ctx.beginPath(); ctx.arc(px,py,r*2.2,0,Math.PI*2); ctx.fill(); }
      ctx.fillStyle=u.team==='player'?'rgba(63,185,80,0.25)':'rgba(248,81,73,0.25)'; ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle=u.team==='player'?'#3fb950':'#f85149'; ctx.lineWidth=2; ctx.stroke();
      ctx.font=`${r*1.4}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(u.emoji, px, py);
      ctx.font='9px sans-serif'; ctx.fillStyle=u.team==='player'?'#3fb950':'#f85149'; ctx.fillText(u.name||'', px, py+r+10);
      if (u.star>1) { ctx.font='8px sans-serif'; ctx.fillStyle='#c8a04a'; ctx.fillText('★'.repeat(u.star), px, py-r-12); }
      if (!u.dead) { const bw=r*2.2, bh=4, by=py-r-8; ctx.fillStyle='#1a1410'; ctx.fillRect(px-bw/2-1,by-1,bw+2,bh+2); ctx.fillStyle='#333'; ctx.fillRect(px-bw/2,by,bw,bh); const hp= Math.max(0,u.hp/u.maxHp); ctx.fillStyle=u.team==='player'?(hp>0.5?'#3fb950':hp>0.2?'#f0c050':'#f85149'):(hp>0.5?'#f85149':hp>0.2?'#f06030':'#8a2020'); ctx.fillRect(px-bw/2,by,bw*hp,bh); }
      for (const d of (u.dmgTexts||[])) { const dx=px+d.x*cw, dy=py-10-(40-d.life)*0.5; ctx.globalAlpha=Math.min(1,d.life/20); if (d.miss) { ctx.font='bold 12px sans-serif'; ctx.fillStyle='#aaa'; ctx.fillText('闪避', dx, dy); } else if (d.heal) { ctx.font='bold 12px sans-serif'; ctx.fillStyle='#3fb950'; ctx.fillText('复活!', dx, dy); } else { ctx.font='bold 16px sans-serif'; ctx.fillStyle=d.crit?'rgba(255,100,0)':'rgba(255,220,50)'; ctx.lineWidth=4; ctx.strokeStyle='#000'; ctx.strokeText(`-${d.val}`, dx, dy); ctx.fillText(`-${d.val}`, dx, dy); } ctx.globalAlpha=1; }
      if (u.hitFlash>0) { ctx.fillStyle=`rgba(255,50,50,${u.hitFlash/10*0.3})`; ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2); ctx.fill(); }
      ctx.globalAlpha=1;
    }
  }
  function getEquipDrop() { const r=Math.random()*100; let acc=0; for (const dr of EQUIP_DROP_RATES) { acc+=dr.chance; if (r<acc) return dr.rarity; } return 1; }
  function rollEquip() { const rarity=getEquipDrop(); const pool=Object.keys(EQUIPMENT).filter(id=>EQUIPMENT[id].rarity===rarity); return pool.length?pool[Math.floor(Math.random()*pool.length)]:null; }
  function equipItem(unitKey, equipId) { const eq=state.equipped[unitKey]||{weapon:null,armor:null,accessory:null}; const slot=EQUIPMENT[equipId].slot; if (eq[slot]) state.inventory.push(eq[slot]); eq[slot]=equipId; state.equipped[unitKey]=eq; saveState(); render(); showSystems('equip'); }
  function sellEquip(equipId) { const i=state.inventory.indexOf(equipId); if(i<0) return; state.inventory.splice(i,1); state.gold+=EQUIPMENT[equipId].rarity*3; saveState(); render(); showSystems('equip'); }
  function mergeGems(color) { if ((state.gems[color]||0) < GEM_MERGE_COST) { toast('宝石不足！'); return; } state.gems[color]-=GEM_MERGE_COST; state.gems[color+'_level']=(state.gems[color+'_level']||0)+1; toast(`${GEM_TYPES[color].emoji} ${GEM_TYPES[color].name} 升至${state.gems[color+'_level']}级！`, '💎'); saveState(); render(); showSystems('gem'); }
  function unlockPet(petId) { if (state.petUnlocked.includes(petId)) { state.pet=petId; saveState(); render(); showSystems('pet'); return; } const p=PETS[petId]; if (state.gold<p.cost) { toast('💰金币不足！'); return; } state.gold-=p.cost; state.petUnlocked.push(petId); state.pet=petId; toast(`解锁${p.emoji} ${p.name}！${p.skill.desc}`, '🐾'); saveState(); render(); showSystems('pet'); }
  function unlockWing(wingId) { if (state.wingUnlocked.includes(wingId)) { state.wing=wingId; saveState(); render(); showSystems('wing'); return; } const w=WINGS[wingId]; if (state.gold<w.cost) { toast('💰金币不足！'); return; } state.gold-=w.cost; state.wingUnlocked.push(wingId); state.wing=wingId; toast(`解锁${w.emoji} ${w.name}！${w.skill.desc}`, '🪽'); saveState(); render(); showSystems('wing'); }


  function startBattle() {
    if (Object.keys(state.board).length === 0) { toast('请先放置单位！'); return; }
    const level = getLevel(state.wave);
    if (!level) { toast('已通关！'); return; }
    document.getElementById('battle-btn').disabled = true;
    document.getElementById('battle-btn').textContent = '战斗中...';
    startBattleAnim(state.board, level.enemies, (result) => {
      state.battleLog.unshift({wave:state.wave, won:result.won, pAlive:result.pAlive, eAlive:result.eAlive});
      const waveGold = level.gold || 0;
      if (result.won) {
        state.winStreak++; state.loseStreak = 0;
        const sb = STREAK_GOLD[Math.min(state.winStreak,9)]||5;
        const it = Math.min(INTEREST_MAX, Math.floor(state.gold/INTEREST_PER));
        const pb = state.pet==='p1' ? 0.1 : 0;
        const reward = Math.round(waveGold*(1+pb))+sb+it;
        state.gold += reward; toast(`胜利！+${reward}金`, '🏆'); sfx.success();
        const drop = rollEquip(); if (drop) { state.inventory.push(drop); toast(`获得${EQUIPMENT[drop].emoji} ${EQUIPMENT[drop].name}！`, '📦'); }
        if (Math.random()<0.3) { const cs=Object.keys(GEM_TYPES); const gc=cs[Math.floor(Math.random()*cs.length)]; state.gems[gc]=(state.gems[gc]||0)+1; toast(`获得${GEM_TYPES[gc].emoji} ${GEM_TYPES[gc].name}！`, '💎'); }
        if (level.isBoss) { state.gold += waveGold; toast(`Boss击破！额外+${waveGold}金！`, '👑'); if (Math.random() < 0.3) { state.diamonds = (state.diamonds||0) + 1; toast('获得1💎钻石！', '💎'); } }
      } else {
        state.loseStreak++; state.winStreak = 0;
        const lb = STREAK_GOLD[Math.min(state.loseStreak,9)]||0;
        const it = Math.min(INTEREST_MAX, Math.floor(state.gold/INTEREST_PER));
        const lg = 7+lb+it; state.gold += lg; toast(`失败...+${lg}金（继续推进）`, '💀'); sfx.fail();
      }
      if (state.wave % 10 === 0) { state.diamonds = (state.diamonds||0) + 1; toast(`通关${state.wave}波! 奖励1💎`, '🎁'); }
      // 胜利自动+1经验
      state.xp = (state.xp||0) + (result.won ? 2 : 1); while (state.xp >= XP_PER_LEVEL) { state.xp -= XP_PER_LEVEL; state.playerLevel++; }
      state.wave++; state.totalWaves = Math.max(state.totalWaves||0, state.wave-1);
      refreshShop(); saveState(); render();
    });
  }
  const sfx = {
    click() { tone(440,0.05,'square'); }, success() { tone(660,0.1,'sine'); setTimeout(()=>tone(880,0.1,'sine'),100); },
    fail() { tone(220,0.15,'sawtooth'); }, discover() { tone(880,0.05,'sine'); setTimeout(()=>tone(1100,0.05,'sine'),50); },
    win() { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,0.15,'sine'),i*100)); },
  };
  function initAudio() { if (!audioCtx) { try { audioCtx = new (window.AudioContext||window.webkitAudioContext)(); } catch(e) {} } }
  function tone(freq, dur, type) { if (!audioCtx) return; const o=audioCtx.createOscillator(); const g=audioCtx.createGain(); o.type=type; o.frequency.value=freq; g.gain.setValueAtTime(0.1,audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+dur); o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime+dur); }
  function toast(msg, icon) { const t=document.getElementById('toast'); if(!t) return; t.textContent=(icon?icon+' ':'')+msg; t.classList.add('show'); clearTimeout(t._timer); t._timer=setTimeout(()=>t.classList.remove('show'),2000); }
  function render() { renderTopBar(); renderBoard(); renderSynergies(); renderBench(); renderShop(); renderEquipBar(); }
  function renderTopBar() {
    const el=document.getElementById('topbar'); if(!el) return;
    const it=Math.min(INTEREST_MAX,Math.floor(state.gold/INTEREST_PER));
    const si=state.winStreak>0?`🔥${state.winStreak}`:state.loseStreak>0?`💀${state.loseStreak}`:'-';
    const nl=getLevel(state.wave);
    const pe=state.pet?PETS[state.pet].emoji:'';
    const we=state.wing&&state.wing!=='w0'?WINGS[state.wing].emoji:'';
    el.innerHTML=`<div class="top-info"><span class="title">华夏</span><span class="level-badge">Lv.${state.playerLevel}</span>${pe?`<span class="pet-badge">${pe}</span>`:''}${we?`<span class="wing-badge">${we}</span>`:''}</div><div class="top-stats"><span class="gold">💰${state.gold}</span><span class="diamond">💎${state.diamonds||0}</span><span class="wave">${state.wave}/∞</span><span class="streak">${si}</span><span class="interest">息+${it}</span></div><div class="top-actions"><button class="action-btn" onclick="window._ac.buyXP()">经验${`${XP_COST}💰 ${state.xp|0}/${XP_PER_LEVEL}`}</button><button class="action-btn" onclick="window._ac.toggleLock()">${state.lockedShop?'🔒':'🔓'}</button><button class="action-btn" onclick="window._ac.showSystems('equip')">🎒${state.inventory.length}</button></div>`;
  }
  function renderBoard() {
    const el=document.getElementById('board'); if(!el) return; let html='';
    for (let y=0; y<8; y++) for (let x=0; x<BOARD_W; x++) { const k=`${x},${y}`; const u=state.board[k]; const ps=y>=4; const cls=`cell ${ps?'player-side':'enemy-side'} ${u?'occupied':''}`; html+=`<div class="${cls}" data-key="${k}">`; if (u) { const d=UNITS[u.id]; const eq=state.equipped[k]; const ei=eq?[eq.weapon,eq.armor,eq.accessory].filter(Boolean).map(id=>EQUIPMENT[id]?.emoji||'').join(''):''; const enh=state.enhance[k]||0; const ench=state.enchant[k]; const enchE=ench&&ENCHANTS[ench]?ENCHANTS[ench].emoji:''; html+=`<span class="unit-emoji">${d.emoji}</span><span class="unit-stars">${'★'.repeat(u.star)}${enh>0?`+${enh}`:''}</span>${ei?`<span class="unit-eq">${ei}${enchE}</span>`:''}`; } html+='</div>'; }
    el.innerHTML=html;
    el.querySelectorAll('.cell.occupied').forEach(c => {
      let pressTimer=null;
      c.addEventListener('touchstart',()=>{ pressTimer=setTimeout(()=>{ if(confirm(`卖出 ${UNITS[state.board[c.dataset.key].id].name}?`)) sellUnit(true,c.dataset.key); pressTimer=null; },600); });
      c.addEventListener('touchend',()=>{ if(pressTimer){clearTimeout(pressTimer);pressTimer=null; showUnitInfo(c.dataset.key);} });
      c.onclick=()=>{ if(pressTimer!==null) return; showUnitInfo(c.dataset.key); };
    });
  }
  function showUnitInfo(key) {
    const u = state.board[key]; if (!u) return;
    const d = UNITS[u.id]; if (!d) return;
    const stats = calcStats(u, key);
    const eq = state.equipped[key]||{};
    const enh = state.enhance[key]||0;
    const ench = state.enchant[key];
    const enchName = ench&&ENCHANTS[ench] ? ENCHANTS[ench].emoji+ENCHANTS[ench].name : '无';
    const syns = getSynergies(state.board).filter(s=>s.active);
    const mySyn = syns.filter(s=>{ const def=d; return (s.type==='race'&&def.race===s.key)||(s.type==='job'&&def.job===s.key); });
    const eqList = EQUIP_SLOTS.map(slot=>{ const eId=eq[slot]; return eId ? EQUIPMENT[eId].emoji+EQUIPMENT[eId].name : EQUIP_SLOTS_NAME[slot]; }).join(' ');
    const modal=document.getElementById('sys-modal');
    let html=`<div class="sys-modal-content"><div class="unit-info-panel">`;
    html+=`<div class="unit-info-header"><span class="unit-info-emoji">${d.emoji}</span><span class="unit-info-name">${d.name}</span><span class="unit-info-stars">${'★'.repeat(u.star)}${enh>0?`+${enh}`:''}</span></div>`;
    html+=`<div class="unit-info-stats">`;
    html+=`<div class="stat-row"><span>❤️生命</span><span class="stat-val">${stats.hp}</span></div>`;
    html+=`<div class="stat-row"><span>⚔️攻击</span><span class="stat-val">${stats.atk}</span></div>`;
    html+=`<div class="stat-row"><span>🛡️护甲</span><span class="stat-val">${stats.armor}</span></div>`;
    html+=`<div class="stat-row"><span>🔮魔抗</span><span class="stat-val">${stats.mr}</span></div>`;
    html+=`<div class="stat-row"><span>🏹射程</span><span class="stat-val">${stats.range}</span></div>`;
    html+=`<div class="stat-row"><span>⚡攻速</span><span class="stat-val">${stats.atkSpd.toFixed(2)}</span></div>`;
    html+=`</div>`;
    html+=`<div class="unit-info-section"><h4>技能</h4><div class="skill-row">${d.skill.emoji||'✨'} ${d.skill.name}: ${d.skill.desc}</div></div>`;
    html+=`<div class="unit-info-section"><h4>种族/职业</h4><div class="race-job-row">${RACES[d.race].name}·${JOBS[d.job].name}</div>`;
    if (mySyn.length>0) html+=`<div class="syn-active">${mySyn.map(s=>`${s.name}${s.count}/${s.need} ✅`).join(' ')}</div>`;
    html+=`</div>`;
    html+=`<div class="unit-info-section"><h4>装备</h4><div class="equip-list-row">${eqList}</div></div>`;
    html+=`<div class="unit-info-section"><h4>附魔</h4><div>${enchName}</div></div>`;
    html+=`<div class="unit-info-section"><h4>强化</h4><div>+${enh} ${enh>0?`(HP/ATK +${(ENHANCE_BONUS[enh]?.hp_pct*100||0)}%)`:''}</div></div>`;
    html+=`</div><button class="sys-close" onclick="document.getElementById('sys-modal').classList.add('hidden')">关闭</button></div>`;
    modal.innerHTML=html; modal.classList.remove('hidden');
  }
  function renderBench() {
    const el=document.getElementById('bench'); if(!el) return;
    let html=`<div class="bench-label">备战席 ${state.bench.length}/${BENCH_SIZE} <span style="float:right;color:var(--text-dim);font-size:8px">长按卖出</span></div><div class="bench-slots">`;
    for (let i=0; i<BENCH_SIZE; i++) { const u=state.bench[i]; html+=`<div class="bench-slot ${u?'occupied':''}" data-idx="${i}">`; if (u) { const d=UNITS[u.id]; html+=`<span class="unit-emoji">${d.emoji}</span><span class="unit-stars">${'★'.repeat(u.star)}</span><span class="unit-cost">${d.cost}💰</span>`; } html+='</div>'; }
    el.innerHTML=html+'</div>';
    el.querySelectorAll('.bench-slot.occupied').forEach(s => {
      let pressTimer=null;
      s.addEventListener('touchstart',()=>{ pressTimer=setTimeout(()=>{ if(confirm('卖出这个单位?')) sellUnit(false,parseInt(s.dataset.idx)); pressTimer=null; },600); });
      s.addEventListener('touchend',()=>{ if(pressTimer){clearTimeout(pressTimer);pressTimer=null; const idx=parseInt(s.dataset.idx); for(let y=4;y<8;y++) for(let x=0;x<BOARD_W;x++) { const k=`${x},${y}`; if(!state.board[k]) { initAudio(); sfx.click(); placeUnit(idx,x,y); return; } } toast('棋盘已满！'); } });
      s.onclick=()=>{ if(pressTimer!==null) return; const idx=parseInt(s.dataset.idx); for(let y=4;y<8;y++) for(let x=0;x<BOARD_W;x++) { const k=`${x},${y}`; if(!state.board[k]) { initAudio(); sfx.click(); placeUnit(idx,x,y); return; } } toast('棋盘已满！'); };
    });
  }
  function renderShop() {
    const el=document.getElementById('shop'); if(!el) return;
    const odds=getShopOdds();
    let html=`<div class="shop-header"><span>商店(${Object.keys(state.board).length}/${getMaxBoard()})</span><span class="odds">${odds.map((p,i)=>`${i+1}费${p}%`).join(' ')}</span></div><div class="shop-slots">`;
    for (let i=0; i<SHOP_SIZE; i++) { const id=state.shop[i]; html+=`<div class="shop-slot ${id?'':'empty'}">`; if (id) { const d=UNITS[id]; html+=`<div class="shop-unit cost-${d.cost}" onclick="window._ac.buyUnit(${i})"><span class="unit-emoji">${d.emoji}</span><span class="unit-name">${d.name}</span><span class="unit-cost">${d.cost}💰</span></div>`; } else html+=`<div class="shop-unit empty"><span class="unit-emoji">✕</span></div>`; html+='</div>'; }
    const nl=getLevel(state.wave);
    const nd=nl?`⚔️ 第${nl.wave}波${nl.isBoss?'👑':''}(${nl.enemies.length}敌)`:'🏆 通关';
    html+=`</div><div class="shop-actions"><button id="refresh-btn" class="action-btn" onclick="window._ac.refreshShopManual()">🔄${REFRESH_COST}💰</button><button id="battle-btn" class="battle-btn" onclick="window._ac.startBattle()">${nd}</button></div>`;
    el.innerHTML=html;
  }
  function refreshShopManual() { if (state.gold<REFRESH_COST) { toast('💰不足！'); return; } initAudio(); sfx.click(); state.gold-=REFRESH_COST; refreshShop(); saveState(); render(); }
  function renderSynergies() { const el=document.getElementById('synergies'); if(!el) return; const syns=getSynergies(state.board); let html='<span class="syn-label">羁绊</span><div class="syn-list">'; if (syns.length===0) html+='<span class="syn-empty">放2个同种族激活</span>'; else for (const s of syns) { const cls=`syn-tag ${s.type} ${s.active?'':'inactive'}`; html+=`<span class="${cls}" style="${s.type==='race'&&s.color?`background:${s.color}22;color:${s.color}`:''}">${s.name}${s.count}/${s.need}</span>`; } el.innerHTML=html+'</div>'; }
  function renderEquipBar() { const el=document.getElementById('equip-bar'); if(!el) return; const pe=state.pet?PETS[state.pet].emoji:'🐾'; const we=state.wing&&state.wing!=='w0'?WINGS[state.wing].emoji:'🪽'; const gc=state.gems; const me=state.mount&&state.mount!=='m0'?MOUNTS[state.mount].emoji:'🐴'; const dm=state.diamonds||0; el.innerHTML=`<div class="equip-icons"><span class="equip-icon" onclick="window._ac.showSystems('shop')">🛒💎${dm}</span><span class="equip-icon" onclick="window._ac.showSystems('equip')">🎒${state.inventory.length}</span><span class="equip-icon" onclick="window._ac.showSystems('enhance')">⬆️</span><span class="equip-icon" onclick="window._ac.showSystems('enchant')">✨</span><span class="equip-icon" onclick="window._ac.showSystems('pet')">${pe}</span><span class="equip-icon" onclick="window._ac.showSystems('wing')">${we}</span><span class="equip-icon" onclick="window._ac.showSystems('mount')">${me}</span><span class="equip-icon" onclick="window._ac.showSystems('gem')">💎${gc.red+gc.blue+gc.green+gc.yellow+gc.purple}</span></div>`; }
  function showSystems(tab) {
    tab=tab||'equip'; const modal=document.getElementById('sys-modal'); if(!modal) return;
    let html=`<div class="sys-modal-content"><div class="sys-tabs"><button class="sys-tab ${tab==='equip'?'active':''}" onclick="window._ac.showSystems('equip')">🎒装备</button><button class="sys-tab ${tab==='gem'?'active':''}" onclick="window._ac.showSystems('gem')">💎宝石</button><button class="sys-tab ${tab==='pet'?'active':''}" onclick="window._ac.showSystems('pet')">🐾宠物</button><button class="sys-tab ${tab==='wing'?'active':''}" onclick="window._ac.showSystems('wing')">🪽翅膀</button><button class="sys-tab ${tab==='mount'?'active':''}" onclick="window._ac.showSystems('mount')">🐴坐骑</button><button class="sys-tab ${tab==='enhance'?'active':''}" onclick="window._ac.showSystems('enhance')">⬆️强化</button><button class="sys-tab ${tab==='enchant'?'active':''}" onclick="window._ac.showSystems('enchant')">✨附魔</button><button class="sys-tab ${tab==='shop'?'active':''}" onclick="window._ac.showSystems('shop')">🛒钻石</button></div><div class="sys-content">`;
    if (tab==='equip') {
        // 分类展示：武器/护甲/饰品
        const cats = {weapon:{name:'🗡️武器',items:[]}, armor:{name:'🛡️护甲',items:[]}, accessory:{name:'📿饰品',items:[]}};
        for (const eId of state.inventory) { const e=EQUIPMENT[eId]; if(e&&cats[e.slot]) cats[e.slot].items.push(eId); }
        // 一键分解按钮
        html+=`<div class="equip-toolbar"><h3>装备背包 (${state.inventory.length})</h3>`;
        if (state.inventory.length>0) html+=`<button class="decompose-all-btn" onclick="window._ac.decomposeAll()">♻️一键分解全部(${state.inventory.length}件)</button>`;
        html+='</div>';
        if (state.inventory.length===0) html+='<p class="empty-text">暂无装备，胜利后掉落</p>';
        else {
          for (const [slot,c] of Object.entries(cats)) {
            if (c.items.length===0) continue;
            html+=`<div class="equip-cat-header">${c.name} (${c.items.length}) <button class="decompose-cat-btn" onclick="window._ac.decomposeBySlot('${slot}')">♻️分解此类</button></div>`;
            html+='<div class="equip-grid">';
            for (const eId of c.items) {
              const e=EQUIPMENT[eId]; const rc=(RARITY_COLORS[e.rarity]||RARITY_COLORS_V5[e.rarity]||'#aaa');
              html+=`<div class="equip-item" style="border-color:${rc}" onclick="window._ac.selectEquipTarget('${eId}')"><span>${e.emoji}</span><span style="color:${rc}">${e.name}</span><span class="equip-stat">${Object.entries(e.stats).map(([k,v])=>`${k}+${v}`).join(' ')}</span><button class="decompose-one-btn" onclick="event.stopPropagation();window._ac.decomposeOne('${eId}')">♻️${e.rarity*3}💰</button></div>`;
            }
            html+='</div>';
          }
        }
        html+='<h3>单位装备</h3>';
        for (const [key,u] of Object.entries(state.board)) {
          const d=UNITS[u.id]; const eq=state.equipped[key]||{};
          html+=`<div class="equip-unit-row"><span>${d.emoji}${d.name}${'★'.repeat(u.star)}</span>`;
          for (const slot of EQUIP_SLOTS) {
            const eId=eq[slot];
            html+=`<span class="equip-slot-display ${eId?'filled':'empty'}" onclick="window._ac.equipSlot('${key}','${slot}')">${eId?EQUIPMENT[eId].emoji:EQUIP_SLOTS_NAME[slot]}</span>`;
          }
          html+='</div>';
        }
      }
    else if (tab==='gem') { html+='<div class="gem-grid">'; for (const [color,g] of Object.entries(GEM_TYPES)) { const c=state.gems[color]||0; const lv=state.gems[color+'_level']||0; html+=`<div class="gem-item" style="border-color:${g.color}"><span>${g.emoji}</span><span style="color:${g.color}">${g.name}</span><span>x${c}</span><span>Lv.${lv}</span>${c>=GEM_MERGE_COST?`<button onclick="window._ac.mergeGems('${color}')">合成</button>`:''}</div>`; } html+='</div>'; }
    else if (tab==='pet') { if (state.wave<PET_UNLOCK_WAVE) html+=`<p class="empty-text">第${PET_UNLOCK_WAVE}波解锁</p>`; else { html+='<div class="pet-grid">'; for (const [id,p] of Object.entries(PETS)) { const ul=state.petUnlocked.includes(id); const ac=state.pet===id; html+=`<div class="pet-item ${ac?'active':''}" ${ul||p.cost===0?`onclick="window._ac.unlockPet('${id}')"`:''}><span>${p.emoji}</span><span>${p.name}</span><span>${p.skill.desc}</span>${ul?`<span>${ac?'装备中':'点击装备'}</span>`:`<span>${p.cost}💰</span>`}</div>`; } html+='</div>'; } }
    else if (tab==='wing') { if (state.wing<WING_UNLOCK_WAVE) html+=`<p class="empty-text">第${WING_UNLOCK_WAVE}波解锁</p>`; else { html+='<div class="wing-grid">'; for (const [id,w] of Object.entries(WINGS)) { const ul=state.wingUnlocked.includes(id); const ac=state.wing===id; html+=`<div class="wing-item ${ac?'active':''}" ${ul||w.cost===0?`onclick="window._ac.unlockWing('${id}')"`:''}><span>${w.emoji||'❌'}</span><span>${w.name}</span><span>${w.skill.desc}</span>${ul?`<span>${ac?'装备中':'点击装备'}</span>`:`<span>${w.cost}💰</span>`}</div>`; } html+='</div>'; } }
    else if (tab==='mount') { if (state.wave<MOUNT_UNLOCK_WAVE) html+=`<p class="empty-text">第${MOUNT_UNLOCK_WAVE}波解锁坐骑</p>`; else { html+='<div class="mount-grid">'; for (const [id,m] of Object.entries(MOUNTS)) { const ul=state.mountUnlocked.includes(id); const ac=state.mount===id; html+=`<div class="mount-item ${ac?'active':''}" ${ul||m.cost===0?`onclick="window._ac.unlockMount('${id}')"`:''}><span>${m.emoji}</span><span>${m.name}</span><span>${m.skill.desc}</span>${ul?`<span>${ac?'装备中':'点击装备'}</span>`:`<span>${m.cost}💰</span>`}</div>`; } html+='</div>'; } }
    else if (tab==='enhance') { html+='<h3>装备强化</h3><p class="hint">选择棋盘上的单位进行强化，最高+9</p>'; for (const [key,u] of Object.entries(state.board)) { const d=UNITS[u.id]; const lv=state.enhance[key]||0; const cost=lv<ENHANCE_MAX?ENHANCE_COSTS[lv]:0; html+=`<div class="enhance-row"><span>${d.emoji}${d.name}${'★'.repeat(u.star)} +${lv}</span>${lv<ENHANCE_MAX?`<button class="enhance-btn" onclick="window._ac.enhanceUnit('${key}')">强化${cost}💰</button>`:'<span class="max-tag">已满级</span>'}</div>`; } }
    else if (tab==='enchant') { html+='<h3>附魔系统</h3>'; html+=`<p class="hint">附魔卷轴: ${state.enchantScrolls||0} | 消耗: ${ENCHANT_COST}💰+1卷轴</p>`; for (const [key,u] of Object.entries(state.board)) { const d=UNITS[u.id]; const ench=state.enchant[key]||'none'; const enchName=ENCHANTS[ench]?ENCHANTS[ench].name:'无'; const enchE=ENCHANTS[ench]?ENCHANTS[ench].emoji:''; html+=`<div class="enchant-row"><span>${d.emoji}${d.name} ${enchE}${enchName}</span><button class="enchant-btn" onclick="window._ac.enchantUnit('${key}')">附魔(${ENCHANT_COST}💰+📜)</button></div>`; } }
    else if (tab==='shop') { html+='<h3>💎钻石商店</h3>'; html+=`<p class="hint">当前钻石: ${state.diamonds||0}💎 | Boss波掉落 | 每10波送1💎</p>`; html+='<h4>神话物种(1💎)</h4><div class="shop-dia-grid">'; for (const [id,u] of Object.entries(DIAMOND_SHOP.units)) { html+=`<div class="shop-dia-item" onclick="window._ac.buyDiamondUnit('${id}')"><span>${u.emoji||'❓'}</span><span>${u.name}</span><span class="tier-${u.tier}">${u.tier==='myth'?'神话':'传说'}</span><span>${u.cost}💎</span></div>`; } html+='</div>'; html+='<h4>神话装备</h4><div class="shop-dia-grid">'; for (const [id,e] of Object.entries(DIAMOND_SHOP.equipment)) { html+=`<div class="shop-dia-item" onclick="window._ac.buyDiamondEquip('${id}')"><span>${e.emoji}</span><span>${e.name}</span><span class="tier-${e.rarity>=6?'myth':'legend'}">${e.rarity>=6?'神话':'传说'}</span><span>${e.cost}💎</span></div>`; } html+='</div>'; html+='<h4>资源兑换</h4><div class="shop-dia-grid">'; for (const [id,item] of Object.entries(DIAMOND_SHOP)) { if (id.startsWith('gold')||id.startsWith('enchant')) { html+=`<div class="shop-dia-item" onclick="window._ac.buyDiamondItem('${id}')"><span>${item.emoji}</span><span>${item.name}</span><span>${item.cost}💎</span></div>`; } } html+='</div>'; }
    html+=`</div><button class="sys-close" onclick="document.getElementById('sys-modal').classList.add('hidden')">关闭</button></div>`;
    modal.innerHTML=html; modal.classList.remove('hidden');
  }
  function selectEquipTarget(equipId) { const e=EQUIPMENT[equipId]; if(!e) return; const bk=Object.keys(state.board); if (bk.length===0) { toast('棋盘上无单位！'); return; } const modal=document.getElementById('sys-modal'); let html=`<div class="sys-modal-content"><h3>装备→${e.emoji}${e.name}</h3>`; for (const key of bk) { const u=state.board[key]; const d=UNITS[u.id]; const eq=state.equipped[key]||{}; const cu=eq[e.slot]; html+=`<div class="equip-target" onclick="window._ac.equipItem('${key}','${equipId}')">${d.emoji}${d.name}${'★'.repeat(u.star)} ${cu?`(换:${EQUIPMENT[cu].name})`:'(空)'}</div>`; } html+=`<button class="sys-close" onclick="window._ac.showSystems('equip')">返回</button></div>`; modal.innerHTML=html; }
  function equipSlot(unitKey, slot) { const cs=state.inventory.filter(eId=>EQUIPMENT[eId].slot===slot); if (cs.length===0) { toast(`无${EQUIP_SLOTS_NAME[slot]}！`); return; } const modal=document.getElementById('sys-modal'); let html=`<div class="sys-modal-content"><h3>选${EQUIP_SLOTS_NAME[slot]}</h3>`; for (const eId of cs) { const e=EQUIPMENT[eId]; html+=`<div class="equip-target" onclick="window._ac.equipItem('${unitKey}','${eId}')">${e.emoji}${e.name} ${Object.entries(e.stats).map(([k,v])=>`${k}+${v}`).join(' ')}</div>`; } html+=`<button class="sys-close" onclick="window._ac.showSystems('equip')">返回</button></div>`; modal.innerHTML=html; }
  function init() { if (!loadState()) { state=defaultState(); refreshShop(); saveState(); } render(); }

  // === v5 新增函数 ===
  function enhanceUnit(unitKey) {
    const u = state.board[unitKey]; if (!u) { toast('单位不存在！'); return; }
    const lv = state.enhance[unitKey] || 0;
    if (lv >= ENHANCE_MAX) { toast('已满级+'+ENHANCE_MAX); return; }
    const cost = ENHANCE_COSTS[lv];
    if (state.gold < cost) { toast('💰金币不足！需要'+cost); return; }
    state.gold -= cost;
    state.enhance[unitKey] = lv + 1;
    toast(`${UNITS[u.id].name} 强化至+${lv+1}！`, '⬆️');
    sfx.discover();
    saveState(); render(); showSystems('enhance');
  }
  function enchantUnit(unitKey) {
    const u = state.board[unitKey]; if (!u) { toast('单位不存在！'); return; }
    if ((state.enchantScrolls||0) < 1) { toast('需要附魔卷轴！'); return; }
    if (state.gold < ENCHANT_COST) { toast('💰金币不足！'); return; }
    state.gold -= ENCHANT_COST;
    state.enchantScrolls -= 1;
    const enchKeys = Object.keys(ENCHANTS).filter(k => k !== 'none');
    const pick = enchKeys[Math.floor(Math.random()*enchKeys.length)];
    state.enchant[unitKey] = pick;
    toast(`${UNITS[u.id].name} 附魔${ENCHANTS[pick].emoji}${ENCHANTS[pick].name}！`, '✨');
    sfx.discover();
    saveState(); render(); showSystems('enchant');
  }
  function unlockMount(mountId) {
    if (state.mountUnlocked.includes(mountId)) { state.mount = mountId; saveState(); render(); showSystems('mount'); return; }
    const m = MOUNTS[mountId]; if (!m) return;
    if (state.gold < m.cost) { toast('💰金币不足！'); return; }
    state.gold -= m.cost; state.mountUnlocked.push(mountId); state.mount = mountId;
    toast(`解锁${m.emoji} ${m.name}！${m.skill.desc}`, '🐴');
    saveState(); render(); showSystems('mount');
  }
  function buyDiamondUnit(unitId) {
    const def = DIAMOND_SHOP.units[unitId]; if (!def) return;
    if ((state.diamonds||0) < def.cost) { toast('💎钻石不足！'); return; }
    state.diamonds -= def.cost;
    // 把神话单位加入备战席
    state.bench.push({id:unitId, star:1, tier:def.tier});
    // 加入 UNITS 如果不存在
    if (!UNITS[unitId]) { UNITS[unitId] = {name:def.name, emoji:def.emoji, cost:def.cost, race:def.race, job:def.job, base:def.base, skill:def.skill}; }
    toast(`获得${def.emoji} ${def.name}！(${def.tier==='myth'?'神话':'传说'})`, '💎');
    sfx.discover();
    saveState(); render(); showSystems('shop');
  }
  function buyDiamondEquip(equipId) {
    const def = DIAMOND_SHOP.equipment[equipId]; if (!def) return;
    if ((state.diamonds||0) < def.cost) { toast('💎钻石不足！'); return; }
    state.diamonds -= def.cost;
    // 加入 EQUIPMENT 如果不存在
    if (!EQUIPMENT[equipId]) { EQUIPMENT[equipId] = {name:def.name, slot:def.slot, rarity:def.rarity, stats:def.stats, emoji:def.emoji}; }
    state.inventory.push(equipId);
    toast(`获得${def.emoji} ${def.name}！`, '💎');
    sfx.discover();
    saveState(); render(); showSystems('shop');
  }
  function buyDiamondItem(itemId) {
    const item = DIAMOND_SHOP[itemId]; if (!item) return;
    if ((state.diamonds||0) < item.cost) { toast('💎钻石不足！'); return; }
    state.diamonds -= item.cost;
    if (item.type === 'gold') { state.gold += item.val; toast(`+${item.val}💰`, '💰'); }
    else if (item.type === 'enchant_scroll') { state.enchantScrolls = (state.enchantScrolls||0) + 1; toast(`+1附魔卷轴`, '📜'); }
    saveState(); render(); showSystems('shop');
  }


  // === 装备分解系统 ===
  function decomposeOne(eId) {
    const i = state.inventory.indexOf(eId);
    if (i < 0) return;
    const e = EQUIPMENT[eId]; if (!e) return;
    const refund = e.rarity * 3;
    state.inventory.splice(i, 1);
    state.gold += refund;
    toast(`分解${e.emoji}${e.name} +${refund}💰`, '♻️');
    saveState(); render(); showSystems('equip');
  }
  function decomposeBySlot(slot) {
    let count = 0, gold = 0;
    for (let i = state.inventory.length - 1; i >= 0; i--) {
      const eId = state.inventory[i];
      const e = EQUIPMENT[eId];
      if (e && e.slot === slot) {
        state.inventory.splice(i, 1);
        gold += e.rarity * 3;
        count++;
      }
    }
    state.gold += gold;
    if (count > 0) toast(`分解${count}件${EQUIP_SLOTS_NAME[slot]} +${gold}💰`, '♻️');
    else toast(`无${EQUIP_SLOTS_NAME[slot]}可分解`);
    saveState(); render(); showSystems('equip');
  }
  function decomposeAll() {
    let count = state.inventory.length, gold = 0;
    for (const eId of state.inventory) { const e = EQUIPMENT[eId]; if (e) gold += e.rarity * 3; }
    state.inventory = [];
    state.gold += gold;
    if (count > 0) toast(`一键分解${count}件装备 +${gold}💰`, '♻️');
    saveState(); render(); showSystems('equip');
  }

  window._ac = { buyUnit, buyXP, toggleLock, startBattle, refreshShopManual, showSystems, selectEquipTarget, equipItem, equipSlot, sellEquip, decomposeOne, decomposeBySlot, decomposeAll, sellUnit, mergeGems, unlockPet, unlockWing, enhanceUnit, enchantUnit, unlockMount, buyDiamondUnit, buyDiamondEquip, buyDiamondItem };
  document.addEventListener('DOMContentLoaded', init);
})();
