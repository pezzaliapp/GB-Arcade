export function createGame({ canvas, ctx, hudL, hudR, msgEl }) {
  // --- Arcade Snake 20x20, pixel-perfect playfield inside 256x256
  const W = canvas.width, H = canvas.height;

  const GRID = 20;
  const CELL = 12;          // 20*12 = 240
  const MARGIN = 8;         // (256-240)/2 = 8
  const PF = { x: MARGIN, y: MARGIN, w: GRID * CELL, h: GRID * CELL };

  const ink = () =>
    getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#142016';

  const KEY = {
    best: 'gb_best_snake_arcade',
    lb:   'gb_lb_snake_arcade_v1'
  };

  // Leaderboard (local)
  function loadLB(){
    try { return JSON.parse(localStorage.getItem(KEY.lb) || '[]'); } catch { return []; }
  }
  function saveLB(list){
    localStorage.setItem(KEY.lb, JSON.stringify(list));
  }
  function pushLB(name, score){
    const n = (name || 'YOU').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3).padEnd(3,'_');
    let lb = loadLB();
    lb.push({ name: n, score: Math.max(0, Math.min(999, score|0)), ts: Date.now() });
    lb.sort((a,b) => b.score - a.score || a.ts - b.ts);
    lb = lb.slice(0,10);
    saveLB(lb);
  }

  // Game state
  let snake, dir, nextDir;
  let food, bonus, bonusTTL, mines;
  let score = 0, best = 0, level = 1, lives = 3;

  let paused = true;
  let waitingStart = true;
  let dead = false;

  // speed: moves per second
  let speed = 6.2;          // base arcade speed
  let stepAcc = 0;          // accumulator for move steps

  // short invulnerability after a hit (visual + ignore collisions for a moment)
  let invul = 0;            // seconds

  // --- helpers
  const OPP = { U:'D', D:'U', L:'R', R:'L' };
  function keyOf(p){ return `${p.x},${p.y}`; }

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
  function pad3(n){ return String(n).padStart(3,'0'); }
  function pad2(n){ return String(n).padStart(2,'0'); }

  function levelFromScore(sc){
    // every 30 points -> level up (tunable)
    return clamp(1 + Math.floor(sc / 30), 1, 99);
  }

  function minesForLevel(lv){
    // ramps up gently (max 10)
    return clamp(1 + Math.floor((lv-1) * 0.6), 1, 10);
  }

  function speedForLevel(lv){
    // fine growth (moves/sec)
    // base 6.2, then +0.22 per level, capped
    return clamp(6.2 + (lv-1) * 0.22, 6.2, 12.5);
  }

  function updateHUD(){
    hudL.textContent = `SC ${pad3(score)}  LV ${pad2(level)}  ♥${lives}`;
    hudR.textContent = `BEST ${pad3(best)}`;
  }

  function randomCell(){
    return { x: Math.floor(Math.random()*GRID), y: Math.floor(Math.random()*GRID) };
  }

  function placeFood(){
    const occ = new Set(snake.map(keyOf));
    mines.forEach(m => occ.add(keyOf(m)));
    if (bonus) occ.add(keyOf(bonus));

    while(true){
      const p = randomCell();
      if (!occ.has(keyOf(p))) { food = p; return; }
    }
  }

  function placeMines(count){
    const occ = new Set(snake.map(keyOf));
    occ.add(keyOf(food));
    if (bonus) occ.add(keyOf(bonus));

    const arr = [];
    while(arr.length < count){
      const p = randomCell();
      const k = keyOf(p);
      if (!occ.has(k)){
        occ.add(k);
        arr.push(p);
      }
    }
    mines = arr;
  }

  function maybeSpawnBonus(){
    if (bonus) return;

    // chance grows slightly with level
    const chance = clamp(0.04 + (level-1)*0.008, 0.04, 0.16);
    if (Math.random() > chance) return;

    const occ = new Set(snake.map(keyOf));
    mines.forEach(m => occ.add(keyOf(m)));
    occ.add(keyOf(food));

    while(true){
      const p = randomCell();
      if (!occ.has(keyOf(p))){
        bonus = p;
        bonusTTL = 180; // 180 steps-ish (we also decrement per step)
        return;
      }
    }
  }

  function clearBonus(){
    bonus = null;
    bonusTTL = 0;
  }

  function centerRespawn(){
    snake = [
      {x:10, y:10},
      {x:9,  y:10},
      {x:8,  y:10}
    ];
    dir = 'R';
    nextDir = 'R';
    invul = 0.9;
    clearBonus();
    placeFood();
    placeMines(minesForLevel(level));
    paused = true;
    waitingStart = false;
    msgEl.textContent = 'COLPITO. START per riprendere.';
  }

  function gameOver(reason){
    dead = true;
    paused = true;
    waitingStart = false;

    if (score > best){
      best = score;
      localStorage.setItem(KEY.best, String(best));
    }
    pushLB('YOU', score);

    msgEl.textContent = `GAME OVER (${reason}). Premi START o B per ricominciare.`;
    updateHUD();
  }

  function resetRun(){
    score = 0;
    best = Number(localStorage.getItem(KEY.best) || 0);
    level = 1;
    lives = 3;
    speed = speedForLevel(level);

    snake = [{x:10,y:10},{x:9,y:10},{x:8,y:10}];
    dir = 'R';
    nextDir = 'R';

    mines = [];
    bonus = null;
    bonusTTL = 0;

    placeFood();
    placeMines(minesForLevel(level));

    paused = true;
    waitingStart = true;
    dead = false;
    invul = 0;
    stepAcc = 0;

    msgEl.textContent = 'SNAKE ARCADE: START = play/pause • B = restart • SEL = menu';
    updateHUD();
  }

  function back(){
    // Global index calls this on B: we interpret as "Restart run"
    resetRun();
  }

  function setDir(d){
    if (d !== OPP[dir]) nextDir = d;
  }

  function stepOnce(){
    if (paused || dead || waitingStart) return;

    // decrease invulnerability
    if (invul > 0) invul = Math.max(0, invul - (1 / Math.max(1, speed)));

    dir = nextDir;

    const head = snake[0];
    const nx = head.x + (dir==='L'?-1:dir==='R'?1:0);
    const ny = head.y + (dir==='U'?-1:dir==='D'?1:0);

    // wall hit
    if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID){
      lives -= 1;
      updateHUD();
      if (lives <= 0) return gameOver('BORDO');
      return centerRespawn();
    }

    // self hit
    if (invul === 0){
      const hitSelf = snake.some((p,i) => i>0 && p.x===nx && p.y===ny);
      if (hitSelf){
        lives -= 1;
        updateHUD();
        if (lives <= 0) return gameOver('TE STESSO');
        return centerRespawn();
      }
    }

    // mine hit
    if (invul === 0){
      const hitMine = mines.some(m => m.x===nx && m.y===ny);
      if (hitMine){
        lives -= 1;
        updateHUD();
        if (lives <= 0) return gameOver('MINA');
        return centerRespawn();
      }
    }

    // move
    snake.unshift({x:nx, y:ny});

    // eat food
    if (nx === food.x && ny === food.y){
      score = clamp(score + 5, 0, 999);

      const newLevel = levelFromScore(score);
      if (newLevel !== level){
        level = newLevel;
        speed = speedForLevel(level);
        msgEl.textContent = `LIVELLO ${pad2(level)} — più veloce, più mine.`;
        placeMines(minesForLevel(level));
      } else {
        // gentle micro-speedup on each food
        speed = clamp(speed + 0.03, 6.2, 12.5);
      }

      maybeSpawnBonus();
      placeFood();
    }
    // eat bonus
    else if (bonus && nx === bonus.x && ny === bonus.y){
      score = clamp(score + 20, 0, 999);

      // 35% chance life (max 5)
      if (Math.random() < 0.35 && lives < 5){
        lives += 1;
        msgEl.textContent = 'BONUS! +20 e vita extra.';
      } else {
        msgEl.textContent = 'BONUS! +20';
      }

      clearBonus();
    }
    else{
      snake.pop();
    }

    // best
    if (score > best){
      best = score;
      localStorage.setItem(KEY.best, String(best));
    }

    // bonus TTL (decrement per step)
    if (bonus){
      bonusTTL -= 1;
      if (bonusTTL <= 0) clearBonus();
    }

    updateHUD();
  }

  function update(dt, input){
    // START toggles play/pause / start run
    if (input.startPressed){
      if (dead){
        resetRun();
        waitingStart = false;
        paused = false;
        msgEl.textContent = 'PLAY';
      } else if (waitingStart){
        waitingStart = false;
        paused = false;
        msgEl.textContent = 'PLAY';
      } else {
        paused = !paused;
        msgEl.textContent = paused ? 'PAUSA (START per riprendere)' : 'PLAY';
      }
    }

    // Direction from global dpad latch
    if (!paused && !dead && !waitingStart){
      if (input.up) setDir('U');
      else if (input.down) setDir('D');
      else if (input.left) setDir('L');
      else if (input.right) setDir('R');
    } else {
      // allow direction selection even while paused (nice arcade feel)
      if (input.up) setDir('U');
      else if (input.down) setDir('D');
      else if (input.left) setDir('L');
      else if (input.right) setDir('R');
    }

    // Fine speed stepping: accumulate dt and move at 1/speed
    const stepInterval = 1 / Math.max(1, speed);
    stepAcc += dt;

    // Prevent spiral-of-death if tab stutters
    stepAcc = Math.min(stepAcc, stepInterval * 3);

    while(stepAcc >= stepInterval){
      stepOnce();
      stepAcc -= stepInterval;
    }
  }

  function drawCell(x, y, inset = 2){
    const px = PF.x + x * CELL;
    const py = PF.y + y * CELL;
    ctx.fillRect(px + inset, py + inset, CELL - inset*2, CELL - inset*2);
  }

  function render(){
    // background
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = 'rgba(0,0,0,.06)';
    ctx.fillRect(0,0,W,H);

    // playfield
    ctx.strokeStyle = 'rgba(20,32,22,.10)';
    ctx.lineWidth = 1;
    for (let i=0;i<=GRID;i++){
      const x = PF.x + i*CELL;
      const y = PF.y + i*CELL;
      ctx.beginPath(); ctx.moveTo(x, PF.y); ctx.lineTo(x, PF.y+PF.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(PF.x, y); ctx.lineTo(PF.x+PF.w, y); ctx.stroke();
    }

    // mines
    ctx.fillStyle = ink();
    mines.forEach(m => {
      // “block” mine
      drawCell(m.x, m.y, 4);
      // tiny “holes”
      ctx.clearRect(PF.x + m.x*CELL + 5, PF.y + m.y*CELL + 5, 2, 2);
      ctx.clearRect(PF.x + m.x*CELL + CELL-7, PF.y + m.y*CELL + 5, 2, 2);
    });

    // food
    ctx.fillStyle = ink();
    if (food) drawCell(food.x, food.y, 4);

    // bonus (blink)
    if (bonus){
      const blink = ((bonusTTL/10)|0) % 2 === 0;
      ctx.fillStyle = blink ? ink() : 'rgba(0,0,0,.12)';
      drawCell(bonus.x, bonus.y, 3);
    }

    // snake
    const invBlink = invul > 0 && (((invul*10)|0) % 2 === 0);
    ctx.fillStyle = invBlink ? 'rgba(20,32,22,.35)' : ink();
    snake.forEach((p,i) => drawCell(p.x, p.y, i===0 ? 2 : 3));

    // overlays
    if (paused || dead || waitingStart){
      ctx.fillStyle = 'rgba(255,255,255,.30)';
      ctx.fillRect(PF.x, PF.y, PF.w, PF.h);
      ctx.fillStyle = ink();
      ctx.font = '900 18px ui-monospace, Menlo, Monaco, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = dead ? 'GAME OVER' : (waitingStart ? 'PRESS START' : 'PAUSE');
      ctx.fillText(label, W/2, H/2);
    }
  }

  resetRun();
  return { reset: resetRun, update, render, back };
}
