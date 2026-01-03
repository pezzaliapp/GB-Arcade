export function createGame({ canvas, ctx, hudL, hudR, msgEl }) {
  const W = canvas?.width ?? 256;
  const H = canvas?.height ?? 256;

  const ink = () =>
    getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#142016';

  const KEY = 'gb_best_galattica_v1';

  let paused = true, waitingStart = true, dead = false;
  let score = 0, best = Number(localStorage.getItem(KEY) || 0);
  let wave = 1;

  let ship, ast, bonus, bonusTTL;
  let energy = 100;
  let iFrames = 0;

  function pad3(n){ return String(n).padStart(3,'0'); }
  function pad2(n){ return String(n).padStart(2,'0'); }

  function updateHUD(){
    hudL.textContent = `SC ${pad3(score)}  WV ${pad2(wave)}  EN ${pad3(Math.floor(energy))}`;
    hudR.textContent = `BEST ${pad3(best)}`;
  }

  function reset(){
    paused = true; waitingStart = true; dead = false;

    score = 0;
    wave = 1;

    best = Number(localStorage.getItem(KEY) || 0);

    ship = { x: W/2, y: H-26, r: 6, vx: 0, vy: 0 };
    ast = [];
    bonus = null;
    bonusTTL = 0;

    energy = 100;
    iFrames = 0;

    msgEl.textContent = 'GALATTICA: ←→↑↓ muovi • A=SHIELD • START play/pause • B reset • SEL menu';
    updateHUD();
  }

  function back(){
    // “B reset” dentro il gioco: riavvia la run (non torna al menu: quello lo fa SEL globale)
    reset();
  }

  function spawnAsteroids(){
    const target = Math.min(18, 6 + wave * 2);
    while (ast.length < target){
      const x = 10 + Math.random()*(W-20);
      const y = -20 - Math.random()*120;
      const r = 4 + Math.random()*8;
      const vy = 40 + Math.random()*60 + wave*8;
      const vx = (Math.random()*2-1) * (8 + wave*1.2);
      ast.push({ x,y,r,vx,vy });
    }
  }

  function maybeSpawnBonus(){
    if (bonus) return;
    const p = Math.min(0.12, 0.03 + wave*0.01);
    if (Math.random() > p) return;

    bonus = {
      x: 14 + Math.random()*(W-28),
      y: -10,
      vy: 70 + wave*5,
      r: 6,
      type: (Math.random()<0.6 ? 'SCORE' : 'ENERGY')
    };
    bonusTTL = 6.0;
  }

  function dist2(ax,ay,bx,by){
    const dx=ax-bx, dy=ay-by;
    return dx*dx + dy*dy;
  }

  function onHit(){
    if (iFrames > 0) return;

    // se stai usando lo shield (iFrames>0), il colpo viene assorbito
    if (energy > 0){
      energy = Math.max(0, energy - 35);
      iFrames = 0.8;
      msgEl.textContent = 'HIT! Shield assorbe il colpo.';
    } else {
      dead = true;
      paused = true;
      waitingStart = false;
      msgEl.textContent = 'GAME OVER. START o B per ricominciare.';
    }

    if (score > best){
      best = score;
      localStorage.setItem(KEY, String(best));
    }
    updateHUD();
  }

  function update(dt, input){
    // START: start/pause
    if (input.startPressed){
      if (dead){
        reset();
        waitingStart = false;
        paused = false;
        msgEl.textContent = 'PLAY';
      } else if (waitingStart){
        waitingStart = false;
        paused = false;
        msgEl.textContent = 'PLAY';
      } else {
        paused = !paused;
        msgEl.textContent = paused ? 'PAUSA' : 'PLAY';
      }
    }

    // B: reset immediato (coerente con label)
    if (input.bPressed){
      reset();
      waitingStart = false;
      paused = false;
      msgEl.textContent = 'PLAY';
    }

    if (paused || dead || waitingStart) return;

    // movimento ship
    const ax = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const ay = (input.up ? -1 : 0) + (input.down ? 1 : 0);

    ship.vx = ax * 130;
    ship.vy = ay * 130;

    ship.x = Math.max(10, Math.min(W-10, ship.x + ship.vx*dt));
    ship.y = Math.max(22, Math.min(H-10, ship.y + ship.vy*dt));

    // A = shield: consuma energia e dà iFrames
    if (input.aPressed && energy > 0){
      // tap “attiva” un breve shield
      iFrames = Math.max(iFrames, 0.16);
    }
    // shield “tenuto” (simulazione): se input.aPressed è solo pulse, questo resta breve.
    // Energia rigenera lentamente.
    if (iFrames > 0){
      energy = Math.max(0, energy - 28*dt);
      iFrames = Math.max(0, iFrames - dt);
    } else {
      energy = Math.min(100, energy + 12*dt);
    }

    // spawn + update asteroidi
    spawnAsteroids();
    maybeSpawnBonus();

    for (const a of ast){
      a.x += a.vx*dt;
      a.y += a.vy*dt;
      if (a.x < 6 || a.x > W-6) a.vx *= -1;
    }
    ast = ast.filter(a => a.y < H + 40);

    // bonus
    if (bonus){
      bonusTTL -= dt;
      bonus.y += bonus.vy*dt;
      if (bonusTTL <= 0 || bonus.y > H+20) bonus = null;
    }

    // collisioni
    for (const a of ast){
      const rr = (ship.r + a.r);
      if (dist2(ship.x, ship.y, a.x, a.y) < rr*rr){
        onHit();
        // respawn asteroide “in alto”
        a.y = -40 - Math.random()*80;
        a.x = 10 + Math.random()*(W-20);
      }
    }

    if (bonus){
      const rr = (ship.r + bonus.r);
      if (dist2(ship.x, ship.y, bonus.x, bonus.y) < rr*rr){
        if (bonus.type === 'SCORE'){
          score = Math.min(999, score + 25);
          msgEl.textContent = 'BONUS: +25';
        } else {
          energy = Math.min(100, energy + 45);
          msgEl.textContent = 'BONUS: ENERGY +45';
        }
        bonus = null;
      }
    }

    // score + wave scaling
    score = Math.min(999, score + Math.floor(10*dt));
    const newWave = 1 + Math.floor(score / 60);
    if (newWave !== wave){
      wave = newWave;
      msgEl.textContent = `WAVE ${pad2(wave)} — più denso.`;
    }

    if (score > best){
      best = score;
      localStorage.setItem(KEY, String(best));
    }
    updateHUD();
  }

  function render(){
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = 'rgba(0,0,0,.06)';
    ctx.fillRect(0,0,W,H);

    const c = ink();

    // asteroidi
    ctx.fillStyle = c;
    for (const a of ast){
      ctx.fillRect(a.x-a.r, a.y-a.r, a.r*2, a.r*2);
    }

    // bonus (blink)
    if (bonus){
      const blink = ((performance.now()/120)|0) % 2 === 0;
      ctx.fillStyle = blink ? c : 'rgba(0,0,0,.12)';
      ctx.fillRect(bonus.x-6, bonus.y-6, 12, 12);
    }

    // ship
    const blinkShip = iFrames > 0 && (((iFrames*10)|0) % 2 === 0);
    ctx.fillStyle = blinkShip ? 'rgba(20,32,22,.35)' : c;
    ctx.fillRect(ship.x-6, ship.y-6, 12, 12);

    // shield box
    if (iFrames > 0){
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
      ctx.strokeRect(ship.x-10, ship.y-10, 20, 20);
    }

    if (paused || dead || waitingStart){
      ctx.fillStyle = 'rgba(255,255,255,.30)';
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = c;
      ctx.font = '900 18px ui-monospace, Menlo, Monaco, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(dead ? 'GAME OVER' : (waitingStart ? 'PRESS START' : 'PAUSE'), W/2, H/2);
    }
  }

  reset();
  return { reset, update, render, back };
}
