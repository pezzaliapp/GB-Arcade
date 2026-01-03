export function createGame({ canvas, ctx, hudL, hudR, msgEl }) {
  const W = canvas.width, H = canvas.height;
  const ink = () => getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#142016';

  let paused = true;
  let score = 0, best = 0;

  let player, bullets, enemies, dir, cooldown;
  let wave = 1;

  function reset() {
    paused = true;
    score = 0;
    best = Number(localStorage.getItem('gb_best_invaders') || 0);

    player = { x: W/2, y: H-18, w: 16, h: 6 };
    bullets = [];
    enemies = [];
    dir = 1;
    cooldown = 0;

    // wave increases density a bit
    const rows = Math.min(6, 4 + Math.floor((wave-1)/2));
    const cols = 8;

    for (let r=0; r<rows; r++){
      for (let c=0; c<cols; c++){
        enemies.push({ x: 24 + c*26, y: 28 + r*16, w: 12, h: 8, alive:true });
      }
    }

    msgEl.textContent = 'INVADERS: ← → muovi • A spara • START play/pause • SEL menu';
    updateHUD();
  }

  function updateHUD(){
    hudL.textContent = `SCORE ${String(score).padStart(3,'0')}`;
    hudR.textContent = `BEST ${String(best).padStart(3,'0')}`;
  }

  function back(){
    // back/reset for this cartridge
    wave = 1;
    reset();
  }

  function update(dt, input){
    // START toggle
    if (input.startPressed) {
      paused = !paused;
      msgEl.textContent = paused ? 'PAUSA' : 'PLAY';
    }
    if (paused) return;

    // move
    if (input.left) player.x -= 140*dt;
    if (input.right) player.x += 140*dt;
    player.x = Math.max(player.w/2, Math.min(W-player.w/2, player.x));

    // shoot
    cooldown = Math.max(0, cooldown - dt);
    if (input.aPressed && cooldown === 0){
      bullets.push({ x: player.x, y: player.y-6, vy: -240 });
      cooldown = 0.18;
    }

    // bullets
    bullets.forEach(b => b.y += b.vy*dt);
    bullets = bullets.filter(b => b.y > -10);

    // enemies movement
    let hitEdge = false;
    enemies.forEach(e => {
      if (!e.alive) return;
      e.x += dir * (38 + wave*2) * dt;
      if (e.x < 10 || e.x > W-10) hitEdge = true;
    });
    if (hitEdge){
      dir *= -1;
      enemies.forEach(e => { if (e.alive) e.y += 8; });
    }

    // collisions
    for (const b of bullets){
      for (const e of enemies){
        if (!e.alive) continue;
        if (Math.abs(b.x - e.x) < (e.w/2) && Math.abs(b.y - e.y) < (e.h/2)){
          e.alive = false;
          b.y = -999;
          score = Math.min(999, score + 10);

          if (score > best){
            best = score;
            localStorage.setItem('gb_best_invaders', String(best));
          }
          updateHUD();
        }
      }
    }

    const alive = enemies.filter(e=>e.alive);
    if (alive.length){
      const lowest = Math.max(...alive.map(e=>e.y));
      if (lowest > H-42){
        paused = true;
        msgEl.textContent = 'GAME OVER — START per riprovare';
        wave = 1;
        reset();
      }
    } else {
      paused = true;
      msgEl.textContent = 'CLEAR! START per nuova ondata';
      wave += 1;
      reset();
    }
  }

  function render(){
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = 'rgba(0,0,0,.06)';
    ctx.fillRect(0,0,W,H);

    ctx.fillStyle = ink();

    // player
    ctx.fillRect(player.x - player.w/2, player.y - player.h/2, player.w, player.h);

    // bullets
    bullets.forEach(b => ctx.fillRect(b.x-1, b.y-4, 2, 6));

    // enemies
    enemies.forEach(e => {
      if (!e.alive) return;
      ctx.fillRect(e.x - e.w/2, e.y - e.h/2, e.w, e.h);
    });

    if (paused){
      ctx.fillStyle = 'rgba(255,255,255,.30)';
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = ink();
      ctx.font = '900 18px ui-monospace, Menlo, Monaco, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PRESS START', W/2, H/2);
    }
  }

  reset();
  return { reset, update, render, back };
}
