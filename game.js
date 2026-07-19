// 自走棋·华夏 - 核心引擎 v2 (修复版)
(function() {
  'use strict';

  const STORAGE_KEY = 'autochess_huaxia_save_v2';
  let state = null;
  let battle = null;
  let audioCtx = null;

  function defaultState() {
    return {
      level: 1, gold: START_GOLD, playerLevel: 3, xp: 0,
      winStreak: 0, loseStreak: 0,
      board: {}, bench: [], shop: [], lockedShop: false,
      discovered: [...Object.keys(UNITS).slice(0,5)],
      battleLog: [],
    };
  }

  function loadState() {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) { state = JSON.parse(s); if (!state.xp) state.xp = 0; }
      else state = defaultState();
    } catch(e) { state = defaultState(); }
  }
  function saveState() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e){} }
  function resetGame() { state = defaultState(); refreshShop(); saveState(); render(); }

  // === 商店 ===
  function getShopOdds() { return SHOP_ODDS[Math.min(state.playerLevel, MAX_PLAYER_LEVEL)]; }

  function rollUnit() {
    const odds = getShopOdds();
    const r = Math.random() * 100;
    let cost = 1, cum = 0;
    for (let i = 0; i < 5; i++) { cum += odds[i]; if (r < cum) { cost = i+1; break; } }
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
    if (!id) { toast('该位置已购买'); return; }
    const cost = UNITS[id].cost;
    if (state.gold < cost) { toast('💰金币不足！'); sfx.fail(); return; }
    // 备战席满且棋盘也满
    if (state.bench.length >= BENCH_SIZE && Object.keys(state.board).length >= getMaxBoard()) {
      toast('备战席和棋盘都满了！'); return;
    }
    state.gold -= cost;
    state.shop[idx] = null;
    if (!state.discovered.includes(id)) state.discovered.push(id);
    // 自动放到棋盘（优先），满了放备战席
    let placed = false;
    if (canPlaceOnBoard()) {
      for (let y = 4; y < 8; y++) {
        for (let x = 0; x < BOARD_W; x++) {
          const key = `${x},${y}`;
          if (!state.board[key]) {
            state.board[key] = {id, star:1};
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
    }
    if (!placed) state.bench.push({id, star:1});
    tryMerge(id, 1);
    saveState(); render();
  }

  function tryMerge(id, star) {
    const bench = state.bench.filter(u => u.id === id && u.star === star);
    const onBoard = Object.entries(state.board).filter(([k,v]) => v.id === id && v.star === star);
    if (bench.length + onBoard.length >= MERGE_NEED) {
      let removed = 0;
      for (let i = state.bench.length - 1; i >= 0 && removed < MERGE_NEED; i--) {
        if (state.bench[i].id === id && state.bench[i].star === star) { state.bench.splice(i, 1); removed++; }
      }
      if (removed < MERGE_NEED) {
        for (const [key, val] of Object.entries(state.board)) {
          if (removed >= MERGE_NEED) break;
          if (val.id === id && val.star === star) { delete state.board[key]; removed++; }
        }
      }
      const newStar = star + 1;
      if (newStar <= 3) {
        state.bench.push({id, star: newStar});
        toast(`${UNITS[id].emoji} ${UNITS[id].name} 升至${newStar}星！`, '⭐');
        sfx.discover();
        tryMerge(id, newStar);
      }
      return true;
    }
    return false;
  }

  function getMaxBoard() { return state.playerLevel + 2; }
  function canPlaceOnBoard() { return Object.keys(state.board).length < getMaxBoard(); }

  function toggleLock() { state.lockedShop = !state.lockedShop; saveState(); render(); }

  // 买经验：买1次+1xp，4xp升1级
  function buyXP() {
    if (state.playerLevel >= MAX_PLAYER_LEVEL) { toast('已满级！'); return; }
    if (state.gold < XP_COST) { toast(`💰金币不足！需要${XP_COST}金`); sfx.fail(); return; }
    state.gold -= XP_COST;
    state.xp = (state.xp || 0) + 1;
    if (state.xp >= XP_PER_LEVEL) { state.playerLevel++; state.xp = 0; toast(`等级提升至 Lv.${state.playerLevel}！可上场${getMaxBoard()}个`, '⬆️'); sfx.discover(); }
    saveState(); render();
  }

  // === 棋盘 ===
  function placeUnit(benchIdx, x, y) {
    const unit = state.bench[benchIdx];
    if (!unit) return;
    const key = `${x},${y}`;
    if (state.board[key]) { toast('该位置已有单位！'); return; }
    if (!canPlaceOnBoard()) { toast(`上场已达上限(${getMaxBoard()})！升级增加上限`); return; }
    state.board[key] = {...unit};
    state.bench.splice(benchIdx, 1);
    saveState(); render();
  }

  function sellUnit(fromBoard, key, benchIdx) {
    if (fromBoard) {
      const u = state.board[key]; if (!u) return;
      state.gold += UNITS[u.id].cost * (u.star === 1 ? 1 : u.star === 2 ? 3 : 9);
      delete state.board[key];
    } else {
      const u = state.bench[benchIdx]; if (!u) return;
      state.gold += UNITS[u.id].cost * (u.star === 1 ? 1 : u.star === 2 ? 3 : 9);
      state.bench.splice(benchIdx, 1);
    }
    saveState(); render();
  }

  // === 羁绊 ===
  function getSynergies(board) {
    const raceCount = {}, jobCount = {};
    const seen = new Set();
    for (const [key, unit] of Object.entries(board)) {
      if (seen.has(unit.id)) continue;
      seen.add(unit.id);
      const def = UNITS[unit.id];
      raceCount[def.race] = (raceCount[def.race]||0) + 1;
      jobCount[def.job] = (jobCount[def.job]||0) + 1;
    }
    const active = [];
    for (const [r, n] of Object.entries(raceCount)) {
      const buffs = Object.keys(RACES[r].buffs).map(Number).sort((a,b)=>b-a);
      for (const t of buffs) if (n >= t) { active.push({type:'race',key:r,name:RACES[r].name,count:n,need:t,desc:RACES[r].buffs[t].desc}); break; }
      // 没触发也显示进度
      if (n < buffs[buffs.length-1]) active.push({type:'race',key:r,name:RACES[r].name,count:n,need:buffs[buffs.length-1],desc:RACES[r].buffs[buffs[buffs.length-1]].desc, inactive:true});
    }
    for (const [j, n] of Object.entries(jobCount)) {
      const buffs = Object.keys(JOBS[j].buffs).map(Number).sort((a,b)=>b-a);
      for (const t of buffs) if (n >= t) { active.push({type:'job',key:j,name:JOBS[j].name,count:n,need:t,desc:JOBS[j].buffs[t].desc}); break; }
      if (n < buffs[buffs.length-1]) active.push({type:'job',key:j,name:JOBS[j].name,count:n,need:buffs[buffs.length-1],desc:JOBS[j].buffs[buffs[buffs.length-1]].desc, inactive:true});
    }
    return active;
  }

  // === 战斗系统（逐帧动画版 v2）===
  function calcStats(unit) {
    const def = UNITS[unit.id];
    const mult = STAR_MULT[unit.star] || 1;
    return {
      hp: Math.round(def.base.hp * mult), maxHp: Math.round(def.base.hp * mult),
      atk: Math.round(def.base.atk * mult), armor: def.base.armor, mr: def.base.mr,
      range: def.base.range, atkSpd: def.base.atkSpd,
      skill: def.skill, race: def.race, job: def.job,
      name: def.name, emoji: def.emoji, star: unit.star,
    };
  }

  function makeCombatant(u, team, x, y) {
    const c = calcStats(u);
    c.team = team; c.x = x; c.y = y;
    c.atkCd = 0; c.dead = false; c.target = null;
    c.attackFlash = 0; c.skillFlash = 0; c.hitFlash = 0;
    c.deathFade = 0; c.dmgTexts = []; c.name = u.name;;
    return c;
  }

  function applySynergyBuffs(combatants, synergies) {
    for (const s of synergies) {
      if (s.inactive) continue;
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
        if (buff.type === 'hpRegen') c.regen = (c.regen||0) + 0.01 * c.maxHp;
        if (buff.type === 'atkBurn') c.burnOnHit = true;
        if (buff.type === 'atkRange' && c.race === s.key) c.range += 1;
        if (buff.type === 'hpArmor2') { c.maxHp += buff.val; c.hp += buff.val; }
      }
    }
  }

  function startBattleAnim(playerBoard, enemyUnits, callback) {
    const synergies = getSynergies(playerBoard);
    const player = [];
    for (const [key, u] of Object.entries(playerBoard)) {
      const [x, y] = key.split(',').map(Number);
      player.push(makeCombatant(u, 'player', x, y));
    }
    const enemy = [];
    for (const e of enemyUnits) {
      enemy.push(makeCombatant(e, 'enemy', e.pos[0], e.pos[1]));
    }
    applySynergyBuffs(player, synergies);
    applySynergyBuffs(enemy, getSynergiesFromUnits(enemyUnits));

    const all = [...player, ...enemy];

    const overlay = document.getElementById('battle-overlay');
    const canvas = document.getElementById('battle-canvas');
    const info = document.getElementById('battle-info');
    overlay.classList.remove('hidden');

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    const cw = canvas.width / 8, ch = canvas.height / 8;

    battle = { all, player, enemy, tick: 0, maxTick: 1200, done: false, callback, cw, ch };

    function frame() {
      if (!battle || battle.done) return;
      battle.tick++;

      for (const u of battle.all) {
        if (u.hp <= 0) { u.dead = true; u.deathFade = Math.min(1, u.deathFade + 0.05); continue; }
        if (u.hitFlash > 0) u.hitFlash--;
        if (u.attackFlash > 0) u.attackFlash--;
        if (u.skillFlash > 0) u.skillFlash--;
        // 伤害飘字更新
        u.dmgTexts = (u.dmgTexts||[]).filter(d => { d.life--; return d.life > 0; });

        if (u.regen && battle.tick % 60 === 0) u.hp = Math.min(u.maxHp, u.hp + u.regen);

        // 找目标
        if (!u.target || u.target.hp <= 0) {
          let minDist = Infinity;
          for (const t of battle.all) {
            if (t.team === u.team || t.hp <= 0) continue;
            const d = Math.abs(t.x - u.x) + Math.abs(t.y - u.y);
            if (d < minDist) { minDist = d; u.target = t; }
          }
        }
        if (!u.target) continue;

        const dist = Math.max(Math.abs(u.target.x - u.x), Math.abs(u.target.y - u.y));
        if (dist <= u.range) {
          u.atkCd--;
          if (u.atkCd <= 0) {
            u.atkCd = Math.ceil(60 / u.atkSpd);
            u.attackFlash = 10;
            let dmg = Math.max(1, u.atk - Math.round(u.target.armor * 0.5));
            u.target.hp -= dmg;
            u.target.hitFlash = 10;
            u.target.dmgTexts.push({val: dmg, life: 40, x: (Math.random()-0.5)*0.5, y: 0, crit:false});
            if (u.skill && Math.random() < 0.15) {
              u.skillFlash = 20;
              applySkillEffect(u, u.target, battle.all);
            }
          }
        } else {
          // 移动（加速）
          const dx = Math.sign(u.target.x - u.x);
          const dy = Math.sign(u.target.y - u.y);
          if (Math.abs(u.target.x - u.x) > Math.abs(u.target.y - u.y)) u.x += dx * 0.15;
          else u.y += dy * 0.15;
        }
      }

      const pAlive = battle.player.filter(u => u.hp > 0).length;
      const eAlive = battle.enemy.filter(u => u.hp > 0).length;

      drawBattle(canvas, battle);
      info.innerHTML = `<span class="battle-tick">⏱ ${(battle.tick/60).toFixed(1)}s</span> <span class="battle-alive" style="color:${pAlive>eAlive?'#3fb950':pAlive<eAlive?'#f85149':'#e6edf3'}">我方 ${pAlive} vs 敌方 ${eAlive}</span>`;

      if (pAlive === 0 || eAlive === 0 || battle.tick >= battle.maxTick) {
        battle.done = true;
        const won = eAlive === 0 && pAlive > 0;
        setTimeout(() => {
          overlay.classList.add('hidden');
          callback({ won, pAlive, eAlive, ticks: battle.tick, synergies });
          battle = null;
        }, 1200);
        return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // 从单位列表生成羁绊（敌方用）
  function getSynergiesFromUnits(units) {
    const board = {};
    units.forEach((u, i) => { board[`${u.pos[0]},${u.pos[1]}`] = {id: u.id, star: u.star||1}; });
    return getSynergies(board).filter(s => !s.inactive);
  }

  function drawBattle(canvas, b) {
    const ctx = canvas.getContext('2d');
    const cw = b.cw, ch = b.ch;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 背景
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        ctx.fillStyle = y >= 4 ? 'rgba(63,185,80,0.08)' : 'rgba(248,81,73,0.08)';
        ctx.fillRect(x*cw, y*ch, cw, ch);
        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x*cw, y*ch, cw, ch);
      }
    }
    // 中线
    ctx.strokeStyle = 'rgba(200,160,74,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 4*ch); ctx.lineTo(canvas.width, 4*ch); ctx.stroke();

    // 攻击线（先画在底层）
    for (const u of b.all) {
      if (u.dead) continue;
      if (u.attackFlash > 0 && u.target && !u.target.dead) {
        const px = u.x * cw + cw/2, py = u.y * ch + ch/2;
        const tx = u.target.x * cw + cw/2, ty = u.target.y * ch + ch/2;
        const alpha = u.attackFlash / 10;
        ctx.strokeStyle = u.team === 'player' ? `rgba(255,255,0,${alpha})` : `rgba(255,100,0,${alpha})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tx, ty); ctx.stroke();
      }
    }

    // 单位
    for (const u of b.all) {
      const px = u.x * cw + cw/2;
      const py = u.y * ch + ch/2;
      const r = Math.min(cw, ch) * 0.34;

      // 死亡淡出
      if (u.dead) {
        if (u.deathFade >= 1) continue;
        ctx.globalAlpha = 1 - u.deathFade;
      }

      // 技能光环
      if (u.skillFlash > 0) {
        ctx.fillStyle = `rgba(255,255,100,${u.skillFlash/20*0.35})`;
        ctx.beginPath(); ctx.arc(px, py, r*2.2, 0, Math.PI*2); ctx.fill();
      }

      // 圆形底
      ctx.fillStyle = u.team === 'player' ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)';
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = u.team === 'player' ? '#3fb950' : '#f85149';
      ctx.lineWidth = 2;
      ctx.stroke();

      // emoji
      ctx.font = `${r*1.4}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(u.emoji, px, py);
      // 单位名称（缩小显示在圆圈下方）
      ctx.font = '9px sans-serif';
      ctx.fillStyle = u.team === 'player' ? '#3fb950' : '#f85149';
      ctx.fillText(u.name || '', px, py + r + 10);

      // 星级
      if (u.star > 1) {
        ctx.font = '8px sans-serif';
        ctx.fillStyle = '#c8a04a';
        ctx.fillText('★'.repeat(u.star), px, py + r + 4);
      }

      // 血条（敌红我绿）
      if (!u.dead) {
        const barW = r * 2.2, barH = 4;
        const barY = py - r - 8;
        ctx.fillStyle = '#1a1410';
        ctx.fillRect(px - barW/2 - 1, barY - 1, barW + 2, barH + 2);
        ctx.fillStyle = '#333';
        ctx.fillRect(px - barW/2, barY, barW, barH);
        const hpPct = Math.max(0, u.hp / u.maxHp);
        ctx.fillStyle = u.team === 'player' 
          ? (hpPct > 0.5 ? '#3fb950' : hpPct > 0.2 ? '#f0c050' : '#f85149')
          : (hpPct > 0.5 ? '#f85149' : hpPct > 0.2 ? '#f06030' : '#8a2020');
        ctx.fillRect(px - barW/2, barY, barW * hpPct, barH);
      }

      // 受击闪烁
      if (u.hitFlash > 0) {
        ctx.fillStyle = `rgba(255,50,50,${u.hitFlash/10*0.4})`;
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI*2); ctx.fill();
      }

      // 伤害飘字
      if (u.dmgTexts) {
        for (const d of u.dmgTexts) {
          const ty = py - r - 8 - (40 - d.life) * 0.8 + d.y * 20;
          const alpha = Math.min(1, d.life / 20);
          ctx.font = 'bold 16px sans-serif';
          ctx.fillStyle = d.crit ? `rgba(255,100,0,${alpha})` : `rgba(255,220,50,${alpha})`;
          ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
          ctx.lineWidth = 4;
          const txt = `-${d.val}`;
          ctx.strokeText(txt, px + d.x * 30, ty);
          ctx.fillText(txt, px + d.x * 30, ty);
        }
      }

      ctx.globalAlpha = 1;
    }
  }

  function applySkillEffect(attacker, target, all) {
    const s = attacker.skill;
    const mult = attacker.skillMult || 1;
    switch(s.type) {
      case 'burn':
        var burnDmg = Math.round(attacker.atk * s.val * mult);
        target.hp -= burnDmg;
        target.dmgTexts.push({val: burnDmg, life: 40, x: 0.3, y: 0, crit:true});
        break;
      case 'aoe': case 'aoeSlow': case 'aoeBurn': case 'aoeStun':
        for (const t of all) {
          if (t.team === attacker.team || t.hp <= 0) continue;
          const d = Math.abs(t.x - attacker.x) + Math.abs(t.y - attacker.y);
          if (d <= 3) {
            var aoeDmg = Math.round(attacker.atk * s.val * mult);
            t.hp -= aoeDmg; t.hitFlash = 10;
            t.dmgTexts.push({val: aoeDmg, life: 40, x: (Math.random()-0.5)*0.5, y: 0, crit:true});
          }
        }
        break;
      case 'freeze': case 'petrify': target.stunned = (target.stunned||0) + 60; break;
      case 'heal':
        for (const t of all) { if (t.team === attacker.team && t.hp > 0) t.hp = Math.min(t.maxHp, t.hp + s.val); }
        break;
      case 'shield': attacker.shield = s.val; break;
      case 'revive': if (!attacker.revived) attacker.revived = true; break;
      case 'crit':
        var critDmg = Math.round(attacker.atk * s.val * mult);
        target.hp -= critDmg;
        target.dmgTexts.push({val: critDmg, life: 40, x: 0.2, y: 0, crit:true});
        break;
      case 'firstDouble': if (!attacker.firstUsed) { target.hp -= attacker.atk; attacker.firstUsed = true; target.dmgTexts.push({val: attacker.atk, life: 40, x: 0.2, y: 0, crit:true}); } break;
    }
  }

  // === 关卡推进 ===
  function startBattle() {
    if (Object.keys(state.board).length === 0) { toast('请先放置单位！'); return; }
    const level = LEVELS[state.level - 1];
    if (!level) { toast('已通关全部关卡！'); return; }

    const btn = document.getElementById('battle-btn');
    if (btn) { btn.disabled = true; btn.textContent = '战斗中...'; }

    startBattleAnim(state.board, level.enemies, (result) => {
      state.battleLog.unshift({ wave: level.wave, won: result.won, pAlive: result.pAlive, eAlive: result.eAlive });

      if (result.won) {
        state.winStreak++; state.loseStreak = 0;
        const streakBonus = STREAK_GOLD[Math.min(state.winStreak, 9)] || 3;
        const interest = Math.min(INTEREST_MAX, Math.floor(state.gold / INTEREST_PER));
        const reward = level.gold + streakBonus + interest;
        state.gold += reward;
        toast(`胜利！+${reward}金`, '🏆');
        sfx.success();
        state.level++;
        if (state.level > LEVELS.length) { sfx.win(); showWin(); }
      } else {
        state.loseStreak++; state.winStreak = 0;
        const lossBonus = STREAK_GOLD[Math.min(state.loseStreak, 9)] || 0;
        const interest = Math.min(INTEREST_MAX, Math.floor(state.gold / INTEREST_PER));
        const lossGold = 7 + lossBonus + interest;
        state.gold += lossGold;
        toast(`失败...+${lossGold}金（继续推进）`, '💀');
        sfx.fail();
        state.level++;  // 输了也推进波数
      }

      refreshShop();
      saveState();
      render();
    });
  }

  // === 音效 ===
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
    renderTopBar(); renderBoard(); renderBench(); renderShop(); renderSynergies();
  }

  function renderTopBar() {
    const el = document.getElementById('topbar');
    if (!el) return;
    const interest = Math.min(INTEREST_MAX, Math.floor(state.gold / INTEREST_PER));
    const xpNeed = XP_PER_LEVEL;
    el.innerHTML = `
      <div class="top-info">
        <span class="title">自走棋·华夏</span>
        <span class="level-badge">Lv.${state.playerLevel}</span>
        ${state.playerLevel < MAX_PLAYER_LEVEL ? `<span class="xp-bar"><span class="xp-fill" style="width:${(state.xp||0)/xpNeed*100}%"></span></span>` : ''}
      </div>
      <div class="top-stats">
        <span class="gold">💰${state.gold}</span>
        <span class="wave">${state.level}/${LEVELS.length}波</span>
        <span class="streak">${state.winStreak>0?`🔥${state.winStreak}`:state.loseStreak>0?`💀${state.loseStreak}`:'-'}</span>
        <span class="interest">利息+${interest}</span>
      </div>
      <div class="top-actions">
        <button id="xp-btn" class="action-btn ${state.gold>=XP_COST?'':'disabled'}">经验${XP_COST}💰 ${state.xp||0}/${xpNeed}</button>
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
        html += `<div class="${cls}" data-x="${x}" data-y="${y}" data-key="${key}">`;
        if (unit) {
          const def = UNITS[unit.id];
          html += `<span class="unit-emoji">${def.emoji}</span><span class="unit-stars">${'★'.repeat(unit.star)}</span>`;
        }
        html += `</div>`;
      }
    }
    el.innerHTML = html;
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
    let html = `<div class="bench-label">备战席 ${state.bench.length}/${BENCH_SIZE}</div><div class="bench-slots">`;
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
    el.querySelectorAll('.bench-slot.occupied').forEach(s => {
      s.onclick = () => {
        const idx = parseInt(s.dataset.idx);
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
        toast('棋盘已满！卖掉单位或升级');
      };
    });
  }

  function renderShop() {
    const el = document.getElementById('shop');
    if (!el) return;
    const odds = getShopOdds();
    let html = `<div class="shop-header"><span>商店 (上场${Object.keys(state.board).length}/${getMaxBoard()})</span><span class="odds">${odds.map((p,i)=>`${i+1}费${p}%`).join(' ')}</span></div><div class="shop-slots">`;
    for (let i = 0; i < SHOP_SIZE; i++) {
      const id = state.shop[i];
      html += `<div class="shop-slot ${id?'':'empty'}" data-idx="${i}">`;
      if (id) {
        const def = UNITS[id];
        html += `<div class="shop-unit cost-${def.cost}"><span class="unit-emoji">${def.emoji}</span><span class="unit-name">${def.name}</span><span class="unit-cost">${def.cost}💰</span></div>`;
      } else {
        html += `<div class="shop-unit empty"><span class="unit-emoji">✕</span></div>`;
      }
      html += '</div>';
    }
    const nextLevel = LEVELS[state.level - 1];
    const nextDesc = nextLevel ? `⚔️ 第${nextLevel.wave}波 (${nextLevel.enemies.length}敌)` : '🏆 通关';
    html += `</div><div class="shop-actions"><button id="refresh-btn" class="action-btn ${state.gold>=2?'':'disabled'}">🔄1💰</button><button id="battle-btn" class="battle-btn">${nextDesc}</button></div>`;
    el.innerHTML = html;
    document.getElementById('refresh-btn').onclick = () => {
      if (state.gold < 1) { toast('💰金币不足！'); return; }
      initAudio(); sfx.click();
      state.gold -= 1; refreshShop(); saveState(); render();
    };
    document.getElementById('battle-btn').onclick = () => { initAudio(); startBattle(); };
    document.querySelectorAll('.shop-slot:not(.empty) .shop-unit').forEach(s => {
      s.onclick = () => {
        initAudio(); sfx.click();
        buyUnit(parseInt(s.closest('.shop-slot').dataset.idx));
      };
    });
  }

  function renderSynergies() {
    const el = document.getElementById('synergies');
    if (!el) return;
    const syn = getSynergies(state.board);
    let html = '<div class="syn-label">羁绊</div><div class="syn-list">';
    const active = syn.filter(s => !s.inactive);
    const inactive = syn.filter(s => s.inactive);
    if (active.length === 0 && inactive.length === 0) html += '<span class="syn-empty">放2个同种族/3个同职业激活</span>';
    for (const s of active) html += `<span class="syn-tag ${s.type}">${s.name}${s.count}/${s.need}</span>`;
    for (const s of inactive) html += `<span class="syn-tag ${s.type} inactive">${s.name}${s.count}/${s.need}</span>`;
    html += '</div>';
    el.innerHTML = html;
  }

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
    if (document.getElementById('win-modal')) document.getElementById('win-modal').classList.remove('hidden');
  }

  function init() {
    loadState();
    if (!state.shop || state.shop.length === 0) refreshShop();
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
