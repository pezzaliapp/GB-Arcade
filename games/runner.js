export function createGame({ canvas, ctx, hudL, hudR, msgEl }) {
  const W=canvas.width, H=canvas.height;
  const ink = () => getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#142016';
  const KEY='gb_best_runner_v1';

  let paused=true, waitingStart=true, dead=false;
  let score=0, best=Number(localStorage.getItem(KEY)||0);

  let gndY = H-34;
  let speed = 120;
  let player, obs, spawnT=0;

  function reset(){
    paused=true; waitingStart=true; dead=false;
    score=0; best=Number(localStorage.getItem(KEY)||0);
    speed=120; spawnT=0;
    player={ x:40, y:gndY, w:12, h:14, vy:0, onGround:true, duck:false };
    obs=[];
    msgEl.textContent='RUNNER: A = jump • ↓ = duck • START pause • B reset';
    hud();
  }
  function back(){ reset(); }
  function hud(){
    hudL.textContent=`SC ${String(score).padStart(3,'0')}  SPD ${String(Math.floor(speed)).padStart(3,'0')}`;
    hudR.textContent=`BEST ${String(best).padStart(3,'0')}`;
  }

  function rectHit(a,b){
    return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
  }

  function update(dt, input){
    if (input.startPressed){
      if (dead){ reset(); waitingStart=false; paused=false; msgEl.textContent='PLAY'; }
      else if (waitingStart){ waitingStart=false; paused=false; msgEl.textContent='PLAY'; }
      else { paused=!paused; msgEl.textContent = paused ? 'PAUSA' : 'PLAY'; }
    }
    if (paused || dead || waitingStart) return;

    player.duck = !!input.down;
    player.h = player.duck ? 8 : 14;

    if (input.aPressed && player.onGround){
      player.vy = -220;
      player.onGround=false;
    }

    player.vy += 520*dt;
    player.y += player.vy*dt;
    if (player.y >= gndY){
      player.y = gndY;
      player.vy = 0;
      player.onGround=true;
    }

    spawnT -= dt;
    if (spawnT <= 0){
      const tall = Math.random() < 0.45;
      const o = tall
        ? { x: W+10, y: gndY-14, w: 8, h: 14 }
        : { x: W+10, y: gndY-8,  w: 12, h: 8  };
      obs.push(o);
      spawnT = Math.max(0.55, 1.25 - (speed-120)/250);
    }

    obs.forEach(o => o.x -= speed*dt);
    obs = obs.filter(o => o.x > -30);

    const pbox = { x:player.x, y:player.y-player.h, w:player.w, h:player.h };
    for (const o of obs){
      if (rectHit(pbox, {x:o.x, y:o.y-o.h, w:o.w, h:o.h})){
        dead=true; paused=true;
        msgEl.textContent='GAME OVER. START o B per ricominciare.';
        if (score > best){ best=score; localStorage.setItem(KEY,String(best)); }
        hud();
        return;
      }
    }

    score = Math.min(999, score + Math.floor(18*dt));
    speed = Math.min(260, speed + 12*dt);

    if (score > best){ best=score; localStorage.setItem(KEY,String(best)); }
    hud();
  }

  function render(){
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='rgba(0,0,0,.06)'; ctx.fillRect(0,0,W,H);

    const c = ink();
    ctx.fillStyle=c;

    ctx.fillRect(0,gndY+1,W,2);
    ctx.fillRect(player.x, player.y-player.h, player.w, player.h);
    obs.forEach(o => ctx.fillRect(o.x, o.y-o.h, o.w, o.h));

    if (paused || dead || waitingStart){
      ctx.fillStyle='rgba(255,255,255,.30)'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle=c;
      ctx.font='900 18px ui-monospace, Menlo, Monaco, Consolas, monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(dead ? 'GAME OVER' : (waitingStart ? 'PRESS START' : 'PAUSE'), W/2, H/2);
    }
  }

  reset();
  return { reset, update, render, back };
}
