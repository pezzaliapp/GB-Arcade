export function createGame({ canvas, ctx, hudL, hudR, msgEl }) {
  const W = canvas?.width ?? 256;
  const H = canvas?.height ?? 256;

  const ink = () =>
    getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#142016';

  const KEY = {
    best: 'gb_best_galattica_v2'
  };

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
  let rocks = [];            // main meteors
  let shards = [];           // small fast debris
  let seekers = [];          // slow homing drones
  let shots = [];            // bullets (burst)
  let bonus = null;          // {x,y,r,type,vy,ttl}

  // timers
  let rockSpawnT = 0;
  let shardSpawnT = 0;
  let seekerSpawnT = 0;
  let bonusSpawnT = 0;
  let shotCD = 0;

  // difficulty (continuously updated)
  let density = 0;           // derived from wave
  let speedMul = 1;          // derived from wave

  // for near-miss scoring (per entity)
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

    rockSpawnT = 0;
    shardSpawnT = 0;
    seekerSpawnT = 0;
    bonusSpawnT = 1.2;
    shotCD = 0;

    density = 0;
    speedMul = 1;

    setMsg('GALATTICA: D-Pad muovi • A=SHIELD • B=SHOT • START play/pause • SEL menu');
    updateHUD();
  }

  function back(){
    // global B triggers game.back(); keep semantics: restart run
    reset();
    waitingStart = false;
    paused = false;
    setMsg('PLAY');
  }

  function recalcDifficulty(){
    // wave grows with score (aggressive)
    const newWave = 1 + Math.floor(score / 80);
    if (newWave !== wave){
      wave = newWave;
      setMsg(`WAVE ${pad2(wave)} — densità in aumento.`);
    }

    // density & speed increase with wave
    density = clamp(0.8 + wave*0.35, 1.0, 6.0);
    speedMul = clamp(1.0 + wave*0.08, 1.0, 1.9);
  }

  function spawnRock(){
    // spawn from top (and sometimes sides)
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
      // left
      x = -20;
      y = 24 + Math.random()*(H*0.55);
      vx = (55 + Math.random()*60) * speedMul;
      vy = (15 + Math.random()*35) * speedMul;
    } else {
      // right
      x = W+20;
      y = 24 + Math.random()*(H*0.55);
      vx = -(55 + Math.random()*60) * speedMul;
      vy = (15 + Math.random()*35) * speedMul;
    }

    rocks.push({ x,y,r, vx, vy, hp: (r>12?2:1) });
  }

  function spawnShard(){
    // small fast debris from top
    const r = 3 + Math.random()*3; // 3..6
    const x = 10 + Math.random()*(W-20);
    const y = -10 - Math.random()*40;
    const vx = (Math.random()*2-1) * (35 + wave*4) * speedMul;
    const vy = (110 + Math.random()*110) * speedMul;
    shards.push({ x,y,r, vx, vy });
  }

  function spawnSeeker(){
    // slow homing drone from top
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

    // spawn near danger: pick around center but push to edges sometimes
    const x = clamp((W/2) + (Math.random()*2-1) * (80 + wave*4), 18, W-18);
    const y = -14;
    bonus = { x,y,r:7, type, vy:(70+wave*6)*speedMul, ttl: 6.5 };
  }

  function shootBurst(){
    // burst = 3 shots upward, costs energy, cooldown
    if (shotCD > 0) return;
    if (energy < 8) return;

    energy = Math.max(0, energy - 10);
    shotCD = 0.22;

    shots.push({ x: ship.x, y: ship.y-10, vx:0, vy:-220, r:2 });
    shots.push({ x: ship.x-6, y: ship.y-9, vx:-35, vy:-210, r:2 });
    shots.push({ x: ship.x+6, y: ship.y-9, vx: 35, vy:-210, r:2 });

    // micro feedback
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

    // if shield currently up, it absorbs (but costs a lot)
    // (shield logic happens in update; here we assume collision passed shield check)
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

    const speed = 150; // controllabile su mobile
    ship.x = clamp(ship.x + ax*speed*dt, 10, W-10);
    ship.y = clamp(ship.y + ay*speed*dt, 22, H-10);

    // shield: A = hold-ish (we only get aPressed pulse, but you can mash A)
    // To make it feel like hold, we interpret *any* aPressed as activating for short time,
    // and also allow “buffer” if user is tapping.
    const shieldOn = (input.aPressed && energy > 0);

    // shield costs MORE (as requested)
    if (shieldOn){
      energy = Math.max(0, energy - 42*dt); // heavy drain
      iFrames = Math.max(iFrames, 0.12);    // short protection window
    } else {
      // regen slower than before (pressure)
      energy = Math.min(100, energy + 7.5*dt);
    }

    // B = shoot burst (cost + cooldown)
    if (input.bPressed){
      shootBurst();
    }

    // score over time (faster)
    score = Math.min(999, score + Math.floor(14*dt));
    recalcDifficulty();

    // spawns (aggressive, constant)
    rockSpawnT -= dt;
    shardSpawnT -= dt;
    seekerSpawnT -= dt;
    bonusSpawnT -= dt;

    // spawn cadence scales with density
    const rockEvery = clamp(0.55 - wave*0.02, 0.26, 0.55);
    const shardEvery = clamp(0.70 - wave*0.02, 0.30, 0.70);
    const seekerEvery = clamp(3.2 - wave*0.08, 1.4, 3.2);

    if (rockSpawnT <= 0){
      // sometimes double spawn
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
      // bonus not too frequent, but consistent
      if (Math.random() < 0.55) spawnBonus();
      bonusSpawnT = clamp(2.8 - wave*0.08, 1.6, 2.8);
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
      // home gently towards ship
      const dx = ship.x - k.x;
      k.vx += clamp(dx*0.6, -80, 80) * dt;        // acceleration
      k.vx *= (1 - 0.8*dt);                       // damping
      k.x += k.vx*dt;
      k.y += k.vy*dt;
      k.x = clamp(k.x, 8, W-8);
    }
    for (const b of shots){
      b.x += b.vx*dt;
      b.y += b.vy*dt;
    }

    // bonus
    if (bonus){
      bonus.ttl -= dt;
      bonus.y += bonus.vy*dt;
      if (bonus.ttl <= 0 || bonus.y > H+20) bonus = null;
    }

    // cull
    rocks = rocks.filter(o => o.y < H+60 && o.y > -80 && o.x > -80 && o.x < W+80);
    shards = shards.filter(o => o.y < H+60 && o.y > -80);
    seekers = seekers.filter(o => o.y < H+60);
    shots = shots.filter(o => o.y > -20 && o.x > -20 && o.x < W+20);

    // collisions: shots -> rocks/seekers
    for (const sh of shots){
      for (const r of rocks){
        const rr = (sh.r + r.r);
        if (dist2(sh.x, sh.y, r.x, r.y) < rr*rr){
          r.hp -= 1;
          sh.y = -9999; // remove
          if (r.hp <= 0){
            score = Math.min(999, score + 6);
            // split into shards sometimes
            if (r.r > 12 && Math.random() < 0.75){
              shards.push({ x:r.x, y:r.y, r:4, vx:(Math.random()*2-1)*120, vy:140*speedMul });
              shards.push({ x:r.x, y:r.y, r:4, vx:(Math.random()*2-1)*120, vy:140*speedMul });
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

    // collisions: player with hazards
    // near-miss bonus: within margin but not hit -> points once per entity
    const nearMargin = 6;

    for (const r of rocks){
      const rr = ship.r + r.r;
      const d2 = dist2(ship.x, ship.y, r.x, r.y);
      if (d2 < rr*rr){
        // shield window?
        if (iFrames > 0){
          // absorb but still penalize
          onPlayerHit('SCRAPE');
        } else {
          onPlayerHit('HARD');
        }
        // bounce it away a bit
        r.y -= 22;
      } else {
        const nearR = rr + nearMargin;
        if (d2 < nearR*nearR && !nearTag.has(r)){
          nearTag.add(r);
          score = Math.min(999, score + 2);
        }
      }
    }

    for (const s of shards){
      const rr = ship.r + s.r;
      const d2 = dist2(ship.x, ship.y, s.x, s.y);
      if (d2 < rr*rr){
        if (iFrames > 0) onPlayerHit('SCRAPE');
        else onPlayerHit('HARD');
        s.y = 9999;
      } else {
        const nearR = rr + (nearMargin-2);
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
          // slow time: reduce speedMul briefly by lowering spawn density & velocities
          // simplest: clear some hazards (panic relief)
          rocks = rocks.slice(0, Math.max(6, rocks.length-5));
          shards = shards.slice(0, Math.max(8, shards.length-6));
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
    // camera shake
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

    // danger vignette when energy low
    if (energy < 25 && !dead && !waitingStart){
      ctx.fillStyle = 'rgba(0,0,0,.06)';
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = 'rgba(0,0,0,.04)';
      ctx.fillRect(8,8,W-16,H-16);
    }

    // draw hazards
    ctx.fillStyle = c;
    for (const r of rocks){
      // meteors: chunky
      ctx.fillRect(r.x-r.r, r.y-r.r, r.r*2, r.r*2);
      if (r.r > 12){
        ctx.clearRect(r.x-2, r.y-2, 2, 2);
        ctx.clearRect(r.x+3, r.y-4, 2, 2);
      }
    }
    for (const s of shards){
      // shards: small thin
      ctx.fillRect(s.x-s.r, s.y-s.r, s.r*2, s.r*2);
    }
    for (const k of seekers){
      // seekers: hollow box
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
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

    // shield visuals when iFrames active
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
