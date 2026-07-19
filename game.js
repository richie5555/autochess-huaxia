// 自走棋·华夏 - 核心引擎 v1
(function() {
  'use strict';

  const STORAGE_KEY = 'autochess_huaxia_save';

  // === 存档 ===
  // { level, gold, playerLevel, winStreak, loseStreak, board, bench, shop, lockedShop, discovered }
  let state = null;

  function defaultState() {
    return {
      level: 1, gold: START_GOLD, playerLevel: 1,
      winStreak: 0, loseStreak: 0,
      board: {}, // "x,y" -> {id, star}
      bench: [], // [{id, star}]
      shop: [], lockedShop: false,
      discovered: [...Object.keys(UNITS).slice(0,5)], // 初始可见5个1费
      battleLog: [],
    };
  }

  function loadState() {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) state = JSON.parse(s);
      else state = defaultState();
    } catch(e) { state = defaultState(); }
  }
  function saveState() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e){} }

  function resetGame() {
    state = defaultState();
    refreshShop();
    saveState();
    render();
  }

  // === 商店系统 ===
  function getShopOdds() {
    return SHOP_ODDS[Math.min(state.playerLevel, MAX_PLAYER_LEVEL)];
  }

  function rollUnit() {
    const odds = getShopOdds();
    const r = Math.random() * 100;
    let cost = 1;
    let cum = 0;
    for (let i = 0; i < 5; i++) { cum += odds[i]; if (r < cum) { cost = i+1; break; } }
    // 从对应费用池随机选
    const pool = Object.entries(UNITS).filter(([k,v]) => v.cost === cost);
    if (pool.length === 0) return Object.keys(UNITS)[0];
    return pool[Math.floor(Math.random()*pool.length)][0];
  }

  function refreshShop() {
    if (state.lockedShop) return;
    state.shop = [];
    for (let i = 0; i < SHOP_SIZE; i++) state.shop.push(rollUnit());
  }

  function buyUnit(idx) {
    const id = state.shop[idx];
    if (!id) return;
    const cost = UNITS[id].cost;
    if (state.gold < cost) { toast('金币不足！'); return; }
    if (state.bench.length >= BENCH_SIZE && !canPlaceOnBoard()) { toast('备战席已满！'); return; }
    state.gold -= cost;
    state.shop[idx] = null;
    // 先放入备战席，再检查合成
    state.bench.push({id, star:1});
    if (!state.discovered.includes(id)) state.discovered.push(id);
    // 自动合成检测
    tryMerge(id, 1);
    saveState();
    render();
  }

  // 自动合成检测：判断是否有3个同星级同类单位
  function tryMerge(id, star) {
    // 收集备战席+棋盘上同id同star的
    const bench = state.bench.filter(u => u.id === id && u.star === star);
    const onBoard = Object.entries(state.board).filter(([k,v]) => v.id === id && v.star === star);

    if (bench.length + onBoard.length >= MERGE_NEED) {
      // 移除3个最低星的
      let removed = 0;
      // 先从备战席
      for (let i = state.bench.length - 1; i >= 0 && removed < MERGE_NEED; i--) {
        if (state.bench[i].id === id && state.bench[i].star === star) {
          state.bench.splice(i, 1);
          removed++;
        }
      }
      // 再从棋盘
      if (removed < MERGE_NEED) {
        for (const [key, val] of Object.entries(state.board)) {
          if (removed >= MERGE_NEED) break;
          if (val.id === id && val.star === star) {
            delete state.board[key];
            removed++;
          }
        }
      }
      // 添加升星单位
      const newStar = star + 1;
      if (newStar <= 3) {
        state.bench.push({id, star: newStar});
        toast(`${UNITS[id].emoji} ${UNITS[id].name} 升至 ${newStar}星！`, '⭐');
        sfx.discover();
        // 递归检测更高星合成
        tryMerge(id, newStar);
      }
      return true;
    }
    return false;
  }

  function canPlaceOnBoard() {
    return Object.keys(state.board).length < state.playerLevel + 2;
  }

  function toggleLock() {
    state.lockedShop = !state.lockedShop;
    saveState(); render();
  }

  function buyXP() {
    const cost = 4;
    if (state.gold < cost) { toast('金币不足！'); return; }
    if (state.playerLevel >= MAX_PLAYER_LEVEL) { toast('已满级！'); return; }
    state.gold -= cost;
    // 简化：买4次升1级
    state.xp = (state.xp || 0) + 1;
    if (state.xp >= 4) { state.playerLevel++; state.xp = 0; toast(`等级提升至 ${state.playerLevel}！`, '⬆️'); }
    saveState(); render();
  }

  // === 棋盘操作 ===
  function placeUnit(benchIdx, x, y) {
    const unit = state.bench[benchIdx];
    if (!unit) return;
    const key = `${x},${y}`;
    if (state.board[key]) { toast('该位置已有单位！'); return; }
    if (Object.keys(state.board).length >= state.playerLevel + 2) { toast('上场数量已达上限！'); return; }
    state.board[key] = {...unit};
    state.bench.splice(benchIdx, 1);
    saveState(); render();
  }

  function sellUnit(fromBoard, key, benchIdx) {
    if (fromBoard) {
      const u = state.board[key];
      if (!u) return;
      state.gold += UNITS[u.id].cost * (u.star === 1 ? 1 : u.star === 2 ? 3 : 9);
      delete state.board[key];
    } else {
      const u = state.bench[benchIdx];
      if (!u) return;
      state.gold += UNITS[u.id].cost * (u.star === 1 ? 1 : u.star === 2 ? 3 : 9);
      state.bench.splice(benchIdx, 1);
    }
    saveState(); render();
  }

  // === 羁绊计算 ===
  function getSynergies(board) {
    const raceCount = {}, jobCount = {};
    const seen = new Set();
    for (const [key, unit] of Object.entries(board)) {
      const sig = `${unit.id}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      const def = UNITS[unit.id];
      raceCount[def.race] = (raceCount[def.race]||0) + 1;
      jobCount[def.job] = (jobCount[def.job]||0) + 1;
    }
    const active = [];
    for (const [r, n] of Object.entries(raceCount)) {
      const buffs = Object.keys(RACES[r].buffs).map(Number).sort((a,b)=>b-a);
      for (const t of buffs) if (n >= t) { active.push({type:'race',key:r,name:RACES[r].name,count:n,need:t,desc:RACES[r].buffs[t].desc}); break; }
    }
    for (const [j, n] of Object.entries(jobCount)) {
      const buffs = Object.keys(JOBS[j].buffs).map(Number).sort((a,b)=>b-a);
      for (const t of buffs) if (n >= t) { active.push({type:'job',key:j,name:JOBS[j].name,count:n,need:t,desc:JOBS[j].buffs[t].desc}); break; }
    }
    return active;
  }

  // === 战斗系统 ===
  function calcStats(unit) {
    const def = UNITS[unit.id];
    const mult = STAR_MULT[unit.star] || 1;
    let hp = Math.round(def.base.hp * mult);
    let atk = Math.round(def.base.atk * mult);
    let armor = def.base.armor;
    let mr = def.base.mr;
    let range = def.base.range;
    let atkSpd = def.base.atkSpd;
    // 羁绊加成在战斗时单独算
    return {hp, maxHp:hp, atk, armor, mr, range, atkSpd, skill: def.skill, race: def.race, job: def.job, name: def.name, emoji: def.emoji};
  }

  function applySynergyBuffs(combatants, synergies) {
    for (const s of synergies) {
      const buff = s.type === 'race' ? RACES[s.key].buffs[s.need] : JOBS[s.key].buffs[s.need];
      for (const c of combatants) {
        const isRace = s.type === 'race';
        if (isRace && c.race !== s.key) continue;
        if (!isRace && c.job !== s.key) continue;
        switch(buff.type) {
          case 'armor': c.armor += buff.val; break;
          case 'hp': case 'hpArmor': c.maxHp += buff.val; c.hp += buff.val; break;
          case 'mr': c.mr += buff.val; break;
          case 'atkPct': c.atk = Math.round(c.atk * (1 + buff.val)); break;
          case 'skillDmg': c.skillMult = (c.skillMult||1) + buff.val; break;
        }
      }
      // 全局 buff（不限种族职业的）
      if (buff.type === 'armorReflect' || buff.type === 'hpRegen' || buff.type === 'mrSlow' || buff.type === 'atkBurn' || buff.type === 'atkRange' || buff.type === 'armorHp' || buff.type === 'armorHp2' || buff.type === 'skillMrReduce') {
        for (const c of combatants) {
          if (buff.type === 'hpRegen') c.regen = (c.regen||0) + 0.01 * c.maxHp;
          if (buff.type === 'atkBurn') c.burnOnHit = true;
          if (buff.type === 'atkRange' && c.race === s.key) c.range += 1;
          if (buff.type === 'armorHp2' || buff.type === 'armorHp') { c.maxHp += buff.val; c.hp += buff.val; }
        }
      }
    }
  }

  // 战斗模拟（回合制tick）
  function simulateBattle(playerBoard, enemyUnits) {
    const synergies = getSynergies(playerBoard);
    const player = [];
    for (const [key, u] of Object.entries(playerBoard)) {
      const c = calcStats(u);
      c.team = 'player';
      const [x,y] = key.split(',').map(Number);
      c.x = x; c.y = y;
      player.push(c);
    }
    const enemy = [];
    for (const e of enemyUnits) {
      const c = calcStats(e);
      c.team = 'enemy';
      c.x = e.pos[0]; c.y = e.pos[1] + 4; // 敌方在下半场
      enemy.push(c);
    }
    applySynergyBuffs(player, synergies);

    const all = [...player, ...enemy];
    let tick = 0;
    const maxTick = 600; // 10秒@60fps 简化

    while (tick < maxTick) {
      for (const u of all) {
        if (u.hp <= 0) continue;
        // 找最近敌人
        let target = null, minDist = Infinity;
        for (const t of all) {
          if (t.team === u.team || t.hp <= 0) continue;
          const d = Math.abs(t.x - u.x) + Math.abs(t.y - u.y);
          if (d < minDist) { minDist = d; target = t; }
        }
        if (!target) continue;

        const dist = Math.max(Math.abs(target.x - u.x), Math.abs(target.y - u.y));
        if (dist <= u.range) {
          // 攻击
          if (tick % Math.ceil(60 / u.atkSpd) === 0) {
            let dmg = Math.max(1, u.atk - Math.round(target.armor * 0.5));
            target.hp -= dmg;
            // 技能触发
            if (u.skill && Math.random() < 0.15) {
              applySkillEffect(u, target, all);
            }
          }
        } else {
          // 移动
          const dx = Math.sign(target.x - u.x);
          const dy = Math.sign(target.y - u.y);
          if (Math.abs(target.x - u.x) > Math.abs(target.y - u.y)) u.x += dx;
          else u.y += dy;
        }
      }
      // 清理死亡
      // 检查胜负
      const pAlive = player.filter(u => u.hp > 0).length;
      const eAlive = enemy.filter(u => u.hp > 0).length;
      if (pAlive === 0 || eAlive === 0) break;
      tick++;
    }

    const pAlive = player.filter(u => u.hp > 0).length;
    const eAlive = enemy.filter(u => u.hp > 0).length;
    const won = eAlive === 0 && pAlive > 0;
    return { won, pAlive, eAlive, ticks: tick, synergies };
  }

  function applySkillEffect(attacker, target, all) {
    const s = attacker.skill;
    const mult = attacker.skillMult || 1;
    switch(s.type) {
      case 'burn':
        target.hp -= Math.round(attacker.atk * s.val * mult);
        break;
      case 'aoe': case 'aoeSlow': case 'aoeBurn': case 'aoeStun':
        for (const t of all) {
          if (t.team === attacker.team || t.hp <= 0) continue;
          const d = Math.abs(t.x - attacker.x) + Math.abs(t.y - attacker.y);
          if (d <= 3) t.hp -= Math.round(attacker.atk * s.val * mult);
        }
        break;
      case 'freeze': case 'petrify':
        target.stunned = (target.stunned||0) + 60; // 1秒
        break;
      case 'heal':
        for (const t of all) {
          if (t.team === attacker.team && t.hp > 0) t.hp = Math.min(t.maxHp, t.hp + s.val);
        }
        break;
      case 'shield':
        attacker.shield = s.val;
        break;
      case 'revive':
        if (!attacker.revived) attacker.revived = true;
        break;
      case 'crit':
        target.hp -= Math.round(attacker.atk * s.val * mult);
        break;
      case 'firstDouble':
        if (!attacker.firstUsed) { target.hp -= attacker.atk; attacker.firstUsed = true; }
        break;
    }
  }

  // === 关卡推进 ===
  function startBattle() {
    if (Object.keys(state.board).length === 0) { toast('请先放置单位！'); return; }
    const level = LEVELS[state.level - 1];
    if (!level) { toast('已通关全部关卡！'); return; }

    const result = simulateBattle(state.board, level.enemies);
    state.battleLog.unshift({
      wave: level.wave, won: result.won,
      pAlive: result.pAlive, eAlive: result.eAlive
    });

    if (result.won) {
      state.winStreak++; state.loseStreak = 0;
      const streakBonus = STREAK_GOLD[Math.min(state.winStreak, 9)] || 3;
      const interest = Math.min(INTEREST_MAX, Math.floor(state.gold / INTEREST_PER));
      const reward = level.gold + streakBonus + interest;
      state.gold += reward;
      toast(`胜利！+${reward}金（基础${level.gold}+连胜${streakBonus}+利息${interest}）`, '🏆');
      sfx.success();
      state.level++;
      if (state.level > LEVELS.length) {
        sfx.win();
        showWin();
      }
    } else {
      state.loseStreak++; state.winStreak = 0;
      const lossBonus = STREAK_GOLD[Math.min(state.loseStreak, 9)] || 0;
      const interest = Math.min(INTEREST_MAX, Math.floor(state.gold / INTEREST_PER));
      state.gold += 5 + lossBonus + interest;
      toast(`失败...+${5+lossBonus+interest}金（保留单位再战）`, '💀');
      sfx.fail();
    }

    refreshShop();
    saveState();
    render();
  }

  // === 音效 ===
  let audioCtx = null;
  function initAudio() { if(!audioCtx) try{audioCtx=new(window.AudioContext||window.webkitAudioContext)();}catch(e){} }
  function tone(f,d,t='sine',v=0.1){if(!audioCtx)return;try{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.connect(g);g.connect(audioCtx.destination);o.frequency.value=f;o.type=t;g.gain.setValueAtTime(v,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+d);o.start();o.stop(audioCtx.currentTime+d);}catch(e){} }
  const sfx = {
    click:()=>tone(800,0.05,'square',0.06),
    success:()=>{tone(523,0.1);setTimeout(()=>tone(659,0.1),80);setTimeout(()=>tone(784,0.15),160);},
    fail:()=>{tone(200,0.15,'sawtooth',0.08);setTimeout(()=>tone(150,0.2,'sawtooth',0.06),100);},
    discover:()=>{[523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,0.08),i*60));},
    win:()=>[523,659,784,1047,1319].forEach((f,i)=>setTimeout(()=>tone(f,0.15),i*100)),
  };

  // === UI ===
  function render() {
    renderTopBar();
    renderBoard();
    renderBench();
    renderShop();
    renderSynergies();
  }

  function renderTopBar() {
    const el = document.getElementById('topbar');
    if (!el) return;
    const interest = Math.min(INTEREST_MAX, Math.floor(state.gold / INTEREST_PER));
    el.innerHTML = `
      <div class="top-info">
        <span class="title">自走棋·华夏</span>
        <span class="level-badge">Lv.${state.playerLevel}</span>
      </div>
      <div class="top-stats">
        <span class="gold">💰${state.gold}</span>
        <span class="wave">第${state.level}/${LEVELS.length}波</span>
        <span class="streak">${state.winStreak>0?`连胜${state.winStreak}`:state.loseStreak>0?`连败${state.loseStreak}`:'-'}</span>
        <span class="interest">利息+${interest}</span>
      </div>
      <div class="top-actions">
        <button id="xp-btn" class="action-btn" onclick="">买经验(4💰)</button>
        <button id="lock-btn" class="action-btn">${state.lockedShop?'🔒':'🔓'}</button>
        <button id="reset-btn" class="action-btn">↺</button>
      </div>
    `;
    document.getElementById('xp-btn').onclick = () => { initAudio(); sfx.click(); buyXP(); };
    document.getElementById('lock-btn').onclick = () => { initAudio(); sfx.click(); toggleLock(); };
    document.getElementById('reset-btn').onclick = () => { if(confirm('重新开始？')) resetGame(); };
  }

  function renderBoard() {
    const el = document.getElementById('board');
    if (!el) return;
    let html = '';
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < BOARD_W; x++) {
        const key = `${x},${y}`;
        const unit = state.board[key];
        const isPlayerSide = y >= 4;
        const cls = `cell ${isPlayerSide?'player-side':'enemy-side'} ${unit?'occupied':''}`;
        html += `<div class="${cls}" data-x="${x}" data-y="${y}" data-key="${key}" ${unit?`data-unit="${unit.id}" data-star="${unit.star}"`:''}>`;
        if (unit) {
          const def = UNITS[unit.id];
          html += `<span class="unit-emoji">${def.emoji}</span><span class="unit-stars">${'★'.repeat(unit.star)}</span>`;
        }
        html += `</div>`;
      }
    }
    el.innerHTML = html;

    // 绑定点击（卖出/移动）
    el.querySelectorAll('.cell.occupied').forEach(c => {
      c.onclick = () => {
        const key = c.dataset.key;
        if (state.board[key]) {
          if (confirm(`卖出 ${UNITS[state.board[key].id].name}?`)) sellUnit(true, key);
        }
      };
    });
  }

  function renderBench() {
    const el = document.getElementById('bench');
    if (!el) return;
    let html = '<div class="bench-label">备战席</div><div class="bench-slots">';
    for (let i = 0; i < BENCH_SIZE; i++) {
      const u = state.bench[i];
      html += `<div class="bench-slot ${u?'occupied':''}" data-idx="${i}">`;
      if (u) {
        const def = UNITS[u.id];
        html += `<span class="unit-emoji">${def.emoji}</span><span class="unit-stars">${'★'.repeat(u.star)}</span><span class="unit-cost">${def.cost}💰</span>`;
      }
      html += '</div>';
    }
    html += '</div>';
    el.innerHTML = html;
    // 点击备战单位→放到棋盘空位
    el.querySelectorAll('.bench-slot.occupied').forEach(s => {
      s.onclick = () => {
        const idx = parseInt(s.dataset.idx);
        // 找棋盘空位放置
        for (let y = 4; y < 8; y++) {
          for (let x = 0; x < BOARD_W; x++) {
            const key = `${x},${y}`;
            if (!state.board[key]) {
              initAudio(); sfx.click();
              placeUnit(idx, x, y);
              return;
            }
          }
        }
        toast('棋盘已满！');
      };
    });
  }

  function renderShop() {
    const el = document.getElementById('shop');
    if (!el) return;
    const odds = getShopOdds();
    let html = `<div class="shop-header"><span>商店</span><span class="odds">概率:${odds.map((p,i)=>`${i+1}费${p}%`).join(' ')}</span></div><div class="shop-slots">`;
    for (let i = 0; i < SHOP_SIZE; i++) {
      const id = state.shop[i];
      html += `<div class="shop-slot ${id?'':'empty'}" data-idx="${i}">`;
      if (id) {
        const def = UNITS[id];
        const raceColor = RACES[def.race].color;
        html += `<div class="shop-unit cost-${def.cost}" style="border-color:${raceColor}"><span class="unit-emoji">${def.emoji}</span><span class="unit-name">${def.name}</span><span class="unit-cost">${def.cost}💰</span></div>`;
      }
      html += '</div>';
    }
    html += `</div><div class="shop-actions"><button id="refresh-btn" class="action-btn">刷新(2💰)</button><button id="battle-btn" class="battle-btn">开始战斗</button></div>`;
    el.innerHTML = html;
    document.getElementById('refresh-btn').onclick = () => {
      if (state.gold < 2) { toast('金币不足！'); return; }
      initAudio(); sfx.click();
      state.gold -= 2; refreshShop(); saveState(); render();
    };
    document.getElementById('battle-btn').onclick = () => { initAudio(); startBattle(); };
    document.querySelectorAll('.shop-slot:not(.empty)').forEach(s => {
      s.onclick = () => {
        initAudio(); sfx.click();
        buyUnit(parseInt(s.dataset.idx));
      };
    });
  }

  function renderSynergies() {
    const el = document.getElementById('synergies');
    if (!el) return;
    const syn = getSynergies(state.board);
    let html = '<div class="syn-label">羁绊</div><div class="syn-list">';
    if (syn.length === 0) html += '<span class="syn-empty">放置单位激活羁绊</span>';
    for (const s of syn) {
      html += `<span class="syn-tag ${s.type}">${s.name} ${s.count}/${s.need}</span>`;
    }
    html += '</div>';
    el.innerHTML = html;
  }

  // === Toast ===
  function toast(msg, icon='') {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `${icon?`<span>${icon}</span>`:''}<span>${msg}</span>`;
    document.getElementById('app').appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => t.classList.remove('show'), 2500);
    setTimeout(() => t.remove(), 3000);
  }

  function showWin() {
    if (document.getElementById('win-modal')) {
      document.getElementById('win-modal').classList.remove('hidden');
    }
  }

  // === 初始化 ===
  function init() {
    loadState();
    if (!state.shop || state.shop.length === 0) refreshShop();
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
