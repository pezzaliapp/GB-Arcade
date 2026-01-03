export function createGame({ canvas, ctx, hudL, hudR, msgEl }) {
  const W = canvas?.width ?? 256;
  const H = canvas?.height ?? 256;

  const ink = () =>
    getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#142016';

  const KEY = { best: 'gb_best_galattica_v22' };

  // ---------- state ----------
  let paused = true, waitingStart = true, dead = false;

  let score = 0;
  let best = Number(localStorage.getItem(KEY.best) || 0);
  let wave = 1;

  // player
  let ship = null;
  let energy = 100;          // 0..100
  let iFrames = 0;           // seconds
  let shake = 0;             // seconds

  // entities
  let rocks = [];            // METEOR (destroyable)
  let shards = [];           // SHARD (fast, not destroyable)
  let seekers = [];          // DRONE (destroyable)
  let shots = [];            // bullets (burst)
  let bonus = null;          // {x,y,r,type,vy,ttl}
  let walls = [];            // WALL (indistruttibile con gap)

  // timers
  let rockSpawnT = 0;
  let shardSpawnT = 0;
  let seekerSpawnT = 0;
  let bonusSpawnT = 0;
  let wallSpawnT = 3.2;
  let shotCD = 0;

  // difficulty
  let density = 0;           // derived from wave
  let speedMul = 1;          // derived from wave

  // near-miss scoring
  let nearTag = new WeakSet();

  // ---------- utils ----------
  const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
  const pad3 = (n)=>String(n).padStart(3,'0');
  const pad2 = (n)=>String(n).padStart(2,'0');

  const dist2 = (ax,ay,bx,by)=>{
    const dx=ax-bx, dy=ay-by;
    return dx*dx + dy*dy;
  };

  function updateHUD(){
    hudL.textContent = `SC ${pad3(score)}  WV ${pad2(wave)}  EN ${pad3(Math.floor(energy))}`;
    hudR.textContent = `BEST ${pad3(best)}`;
  }

  function setMsg(s){ msgEl.textContent = s; }

  function reset(){
    paused = true;
    waitingStart = true;
    dead = false;

    score = 0;
    wave = 1;

    best = Number(localStorage.getItem(KEY.best) || 0);

    ship = { x: W/2, y: H-24, r: 7 };

    energy = 100;
    iFrames = 0;
    shake = 0;

    rocks = [];
    shards = [];
    seekers = [];
    shots = [];
    bonus = null;
    walls = [];

    rockSpawnT = 0;
    shardSpawnT = 0;
    seekerSpawnT = 0;
    bonusSpawnT = 1.2;
    wallSpawnT = 3.2;
    shotCD = 0;

    density = 0;
    speedMul = 1;

    nearTag = new WeakSet();

    setMsg('GALATTICA v2.2: METEOR=PIENO (colpisci) • DRONE=BORDO (colpisci) • SHARD=— (schiva) • WALL=passa nel GAP • A=SHIELD • B=SHOT • START play/pause');
    updateHUD();
  }

  function back(){
    reset();
    waitingStart = false;
    paused = false;
    setMsg('PLAY');
  }

  function recalcDifficulty(){
    const newWave = 1 + Math.floor(score / 80);
    if (newWave !== wave){
      wave = newWave;
      setMsg(`WAVE ${pad2(wave)} — densità in aumento.`);
    }
    density = clamp(0.8 + wave*0.35, 1.0, 6.0);
    speedMul = clamp(1.0 + wave*0.08, 1.0, 1.9);
  }

  function spawnRock(){
    const side = Math.random();
    let x,y,vx,vy;

    const r = 6 + Math.random()*10; // 6..16
    const baseVy = (55 + Math.random()*85) * speedMul;

    if (side < 0.72){
      x = 12 + Math.random()*(W-24);
      y = -20 - Math.random()*30;
      vx = (Math.random()*2-1) * (10 + wave*2);
      vy = baseVy;
    } else if (side < 0.86){
      x = -20;
      y = 24 + Math.random()*(H*0.55);
      vx = (55 + Math.random()*60) * speedMul;
      vy = (15 + Math.random()*35) * speedMul;
    } else {
      x = W+20;
      y = 24 + Math.random()*(H*0.55);
      vx = -(55 + Math.random()*60) * speedMul;
      vy = (15 + Math.random()*35) * speedMul;
    }

    rocks.push({ x,y,r, vx, vy, hp: (r>12?2:1) });
  }

  function spawnShard(){
    // shard as dash-like (NOT destroyable)
    const x = 10 + Math.random()*(W-20);
    const y = -10 - Math.random()*40;
    const vx = (Math.random()*2-1) * (55 + wave*6) * speedMul;
    const vy = (150 + Math.random()*140) * speedMul;
    // store as thin rect for clarity/hitbox
    shards.push({ x,y, vx, vy, w: 12, h: 2 });
  }

  function spawnSeeker(){
    const x = 18 + Math.random()*(W-36);
    const y = -20 - Math.random()*60;
    seekers.push({ x,y,r:6, vx:0, vy:(40+wave*4)*speedMul, hp:2 });
  }

  function spawnBonus(){
    const typeRand = Math.random();
    const type =
      typeRand < 0.50 ? 'SCORE' :
      typeRand < 0.82 ? 'ENERGY' :
      'SLOW';

    const x = clamp((W/2) + (Math.random()*2-1) * (80 + wave*4), 18, W-18);
    const y = -14;
    bonus = { x,y,r:7, type, vy:(70+wave*6)*speedMul, ttl: 6.5 };
  }

  function spawnWall(){
    // wall with gap (indistruttibile)
    const h = 10;
    const gapW = clamp(54 - wave*2.2, 26, 54);
    const gapX = 10 + Math.random()*(W - 20 - gapW);
    walls.push({
      y: -h,
      h,
      gapX,
      gapW,
      vy: (75 + wave*7) * speedMul,
      scored: false
    });
  }

  function shootBurst(){
    if (shotCD > 0) return;
    if (energy < 8) return;

    energy = Math.max(0, energy - 10);
    shotCD = 0.22;

    shots.push({ x: ship.x, y: ship.y-10, vx:0, vy:-220, r:2 });
    shots.push({ x: ship.x-6, y: ship.y-9, vx:-35, vy:-210, r:2 });
    shots.push({ x: ship.x+6, y: ship.y-9, vx: 35, vy:-210, r:2 });

    shake = Math.max(shake, 0.08);
  }

  function hitFeedback(kind){
    shake = Math.max(shake, 0.18);
    iFrames = Math.max(iFrames, 0.55);
    if (kind === 'HARD') setMsg('HIT! Energia giù.');
    else setMsg('SCRAPE! Quasi…');
  }

  function onPlayerHit(kind='HARD'){
    if (iFrames > 0) return;

    energy = Math.max(0, energy - (kind==='HARD' ? 28 : 16));
    hitFeedback(kind);

    if (energy <= 0){
      dead = true;
      paused = true;
      waitingStart = false;

      if (score > best){
        best = score;
        localStorage.setItem(KEY.best, String(best));
      }
      updateHUD();
      setMsg('GAME OVER. START per riprovare. SEL = menu.');
    }
  }

  // ---------- update ----------
  function update(dt, input){
    // START toggle
    if (input.startPressed){
      if (dead){
        reset();
        waitingStart = false;
        paused = false;
        setMsg('PLAY');
      } else if (waitingStart){
        waitingStart = false;
        paused = false;
        setMsg('PLAY');
      } else {
        paused = !paused;
        setMsg(paused ? 'PAUSA' : 'PLAY');
      }
    }

    if (paused || dead || waitingStart) return;

    // timers
    if (iFrames > 0) iFrames = Math.max(0, iFrames - dt);
    if (shake > 0) shake = Math.max(0, shake - dt);
    if (shotCD > 0) shotCD = Math.max(0, shotCD - dt);

    // movement (hold)
    const ax = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const ay = (input.up ? -1 : 0) + (input.down ? 1 : 0);

    const speed = 150;
    ship.x = clamp(ship.x + ax*speed*dt, 10, W-10);
    ship.y = clamp(ship.y + ay*speed*dt, 22, H-10);

    // shield (more costly)
    const shieldOn = (input.aPressed && energy > 0);
    if (shieldOn){
      energy = Math.max(0, energy - 42*dt);
      iFrames = Math.max(iFrames, 0.12);
    } else {
      energy = Math.min(100, energy + 7.5*dt);
    }

    // shoot
    if (input.bPressed) shootBurst();

    // score over time
    score = Math.min(999, score + Math.floor(14*dt));
    recalcDifficulty();

    // spawns
    rockSpawnT -= dt;
    shardSpawnT -= dt;
    seekerSpawnT -= dt;
    bonusSpawnT -= dt;
    wallSpawnT -= dt;

    const rockEvery   = clamp(0.55 - wave*0.02, 0.26, 0.55);
    const shardEvery  = clamp(0.70 - wave*0.02, 0.30, 0.70);
    const seekerEvery = clamp(3.2  - wave*0.08, 1.4, 3.2);
    const wallEvery   = clamp(4.2  - wave*0.12, 2.4, 4.2);

    if (rockSpawnT <= 0){
      spawnRock();
      if (Math.random() < 0.25 + wave*0.02) spawnRock();
      rockSpawnT = rockEvery / clamp(density/1.6, 1.0, 2.6);
    }
    if (shardSpawnT <= 0){
      spawnShard();
      if (Math.random() < 0.18 + wave*0.02) spawnShard();
      shardSpawnT = shardEvery / clamp(density/1.4, 1.0, 2.8);
    }
    if (seekerSpawnT <= 0){
      if (wave >= 2) spawnSeeker();
      seekerSpawnT = seekerEvery;
    }
    if (!bonus && bonusSpawnT <= 0){
      if (Math.random() < 0.55) spawnBonus();
      bonusSpawnT = clamp(2.8 - wave*0.08, 1.6, 2.8);
    }
    if (wallSpawnT <= 0){
      spawnWall();
      wallSpawnT = wallEvery;
    }

    // update entities
    for (const r of rocks){
      r.x += r.vx*dt;
      r.y += r.vy*dt;
      if (r.x < 6 || r.x > W-6) r.vx *= -1;
    }
    for (const s of shards){
      s.x += s.vx*dt;
      s.y += s.vy*dt;
      if (s.x < 4 || s.x > W-4) s.vx *= -1;
    }
    for (const k of seekers){
      const dx = ship.x - k.x;
      k.vx += clamp(dx*0.6, -80, 80) * dt;
      k.vx *= (1 - 0.8*dt);
      k.x += k.vx*dt;
      k.y += k.vy*dt;
      k.x = clamp(k.x, 8, W-8);
    }
    for (const b of shots){
      b.x += b.vx*dt;
      b.y += b.vy*dt;
    }
    for (const w of walls){
      w.y += w.vy*dt;
      // score when you pass it (once)
      if (!w.scored && w.y > ship.y){
        w.scored = true;
        score = Math.min(999, score + 12);
        setMsg('GAP BONUS +12');
      }
    }

    // bonus
    if (bonus){
      bonus.ttl -= dt;
      bonus.y += bonus.vy*dt;
      if (bonus.ttl <= 0 || bonus.y > H+20) bonus = null;
    }

    // cull
    rocks  = rocks.filter(o => o.y < H+60 && o.y > -80 && o.x > -80 && o.x < W+80);
    shards = shards.filter(o => o.y < H+60 && o.y > -80);
    seekers= seekers.filter(o => o.y < H+60);
    shots  = shots.filter(o => o.y > -20 && o.x > -20 && o.x < W+20);
    walls  = walls.filter(o => o.y < H+60);

    // collisions: shots -> rocks/seekers (NOT shards, NOT walls)
    for (const sh of shots){
      for (const r of rocks){
        const rr = (sh.r + r.r);
        if (dist2(sh.x, sh.y, r.x, r.y) < rr*rr){
          r.hp -= 1;
          sh.y = -9999;
          if (r.hp <= 0){
            score = Math.min(999, score + 6);
            if (r.r > 12 && Math.random() < 0.75){
              // debris as dash
              shards.push({ x:r.x, y:r.y, w:12, h:2, vx:(Math.random()*2-1)*180, vy:180*speedMul });
              shards.push({ x:r.x, y:r.y, w:12, h:2, vx:(Math.random()*2-1)*180, vy:180*speedMul });
            }
            r.y = 9999;
          }
          break;
        }
      }
      for (const k of seekers){
        const rr = (sh.r + k.r);
        if (dist2(sh.x, sh.y, k.x, k.y) < rr*rr){
          k.hp -= 1;
          sh.y = -9999;
          if (k.hp <= 0){
            score = Math.min(999, score + 18);
            k.y = 9999;
          }
          break;
        }
      }
    }

    // collisions: player with hazards + near-miss
    const nearMargin = 6;

    for (const r of rocks){
      const rr = ship.r + r.r;
      const d2 = dist2(ship.x, ship.y, r.x, r.y);
      if (d2 < rr*rr){
        if (iFrames > 0) onPlayerHit('SCRAPE');
        else onPlayerHit('HARD');
        r.y -= 22;
      } else {
        const nearR = rr + nearMargin;
        if (d2 < nearR*nearR && !nearTag.has(r)){
          nearTag.add(r);
          score = Math.min(999, score + 2);
        }
      }
    }

    // shards as RECT hit (dash)
    for (const s of shards){
      const sx = s.x - (s.w/2);
      const sy = s.y - (s.h/2);
      const hit = (ship.x > sx-ship.r && ship.x < sx+s.w+ship.r &&
                   ship.y > sy-ship.r && ship.y < sy+s.h+ship.r);
      if (hit){
        if (iFrames > 0) onPlayerHit('SCRAPE');
        else onPlayerHit('HARD');
        s.y = 9999;
      } else {
        // near-miss: approximate using center dist
        const d2 = dist2(ship.x, ship.y, s.x, s.y);
        const nearR = (ship.r + 5) + (nearMargin-2);
        if (d2 < nearR*nearR && !nearTag.has(s)){
          nearTag.add(s);
          score = Math.min(999, score + 1);
        }
      }
    }

    for (const k of seekers){
      const rr = ship.r + k.r;
      const d2 = dist2(ship.x, ship.y, k.x, k.y);
      if (d2 < rr*rr){
        if (iFrames > 0) onPlayerHit('SCRAPE');
        else onPlayerHit('HARD');
        k.y = 9999;
      } else {
        const nearR = rr + (nearMargin+2);
        if (d2 < nearR*nearR && !nearTag.has(k)){
          nearTag.add(k);
          score = Math.min(999, score + 3);
        }
      }
    }

    // WALL collision: must be in GAP
    for (const w of walls){
      const top = w.y;
      const bot = w.y + w.h;
      const inBand = (ship.y + ship.r > top) && (ship.y - ship.r < bot);
      if (!inBand) continue;

      const inGap = (ship.x > w.gapX + ship.r) && (ship.x < w.gapX + w.gapW - ship.r);
      if (!inGap){
        if (iFrames > 0) onPlayerHit('SCRAPE');
        else onPlayerHit('HARD');
      }
    }

    // bonus pickup
    if (bonus){
      const rr = ship.r + bonus.r;
      if (dist2(ship.x, ship.y, bonus.x, bonus.y) < rr*rr){
        if (bonus.type === 'SCORE'){
          score = Math.min(999, score + 35);
          setMsg('BONUS: +35');
        } else if (bonus.type === 'ENERGY'){
          energy = Math.min(100, energy + 55);
          setMsg('BONUS: ENERGY +55');
        } else if (bonus.type === 'SLOW'){
          rocks = rocks.slice(0, Math.max(6, rocks.length-5));
          shards= shards.slice(0, Math.max(8, shards.length-6));
          setMsg('BONUS: SLOW (respiro)');
        }
        bonus = null;
      }
    }

    // best save
    if (score > best){
      best = score;
      localStorage.setItem(KEY.best, String(best));
    }
    updateHUD();
  }

  // ---------- render ----------
  function render(){
    let ox = 0, oy = 0;
    if (shake > 0){
      const m = 2;
      ox = (Math.random()*2-1)*m;
      oy = (Math.random()*2-1)*m;
    }

    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,W,H);

    ctx.fillStyle = 'rgba(0,0,0,.06)';
    ctx.fillRect(0,0,W,H);

    ctx.translate(ox, oy);

    const c = ink();

    // watermark
    ctx.fillStyle = c;
    ctx.font = '900 10px ui-monospace, Menlo, Monaco, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('GALATTICA v2.2', W/2, 6);

    // danger vignette
    if (energy < 25 && !dead && !waitingStart){
      ctx.fillStyle = 'rgba(0,0,0,.06)';
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = 'rgba(0,0,0,.04)';
      ctx.fillRect(8,8,W-16,H-16);
    }

    // WALLS (indistruttibili)
    ctx.fillStyle = c;
    for (const w of walls){
      // left block
      ctx.fillRect(0, w.y, w.gapX, w.h);
      // right block
      ctx.fillRect(w.gapX + w.gapW, w.y, W - (w.gapX + w.gapW), w.h);
      // outline gap (readability)
      ctx.strokeStyle = c;
      ctx.lineWidth = 1;
      ctx.strokeRect(w.gapX, w.y, w.gapW, w.h);
    }

    // METEORS (solid + craters)
    ctx.fillStyle = c;
    for (const r of rocks){
      ctx.fillRect(r.x-r.r, r.y-r.r, r.r*2, r.r*2);
      // craters
      ctx.clearRect(r.x-3, r.y-2, 2, 2);
      ctx.clearRect(r.x+2, r.y+1, 2, 2);
      // 2HP notch
      if (r.hp === 2) ctx.clearRect(r.x-1, r.y-6, 2, 2);
    }

    // SHARDS (dash)
    ctx.fillStyle = c;
    for (const s of shards){
      const w = s.w ?? (s.r*2);
      const h = s.h ?? (s.r*2);
      ctx.fillRect(s.x - w/2, s.y - h/2, w, h);
    }

    // SEEKERS (hollow + eye)
    ctx.strokeStyle = c;
    ctx.lineWidth = 2;
    for (const k of seekers){
      ctx.strokeRect(k.x-7, k.y-7, 14, 14);
      ctx.fillStyle = c;
      ctx.fillRect(k.x-2, k.y-2, 4, 4);
    }

    // shots
    ctx.fillStyle = c;
    for (const b of shots){
      ctx.fillRect(b.x-1, b.y-4, 2, 8);
    }

    // bonus (blink)
    if (bonus){
      const blink = ((performance.now()/120)|0) % 2 === 0;
      ctx.fillStyle = blink ? c : 'rgba(0,0,0,.12)';
      ctx.fillRect(bonus.x-7, bonus.y-7, 14, 14);
      ctx.fillStyle = c;
      ctx.font = '900 10px ui-monospace, Menlo, Monaco, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const t = bonus.type === 'SCORE' ? '+' : (bonus.type === 'ENERGY' ? 'E' : 'S');
      ctx.fillText(t, bonus.x, bonus.y+0.5);
    }

    // ship
    const invBlink = iFrames > 0 && (((iFrames*14)|0) % 2 === 0);
    ctx.fillStyle = invBlink ? 'rgba(20,32,22,.35)' : c;
    ctx.fillRect(ship.x-7, ship.y-7, 14, 14);
    // nose pixel
    ctx.clearRect(ship.x-1, ship.y-7, 2, 2);

    // shield visuals
    if (iFrames > 0 && !dead){
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
      ctx.strokeRect(ship.x-12, ship.y-12, 24, 24);
    }

    // overlay
    if (paused || dead || waitingStart){
      ctx.setTransform(1,0,0,1,0,0);
      ctx.fillStyle = 'rgba(255,255,255,.30)';
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = c;
      ctx.font = '900 18px ui-monospace, Menlo, Monaco, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = dead ? 'GAME OVER' : (waitingStart ? 'PRESS START' : 'PAUSE');
      ctx.fillText(label, W/2, H/2);
    }
  }

  reset();
  return { reset, update, render, back };
}
