export function createGame({ canvas, ctx, hudL, hudR, msgEl }) {
  const W=canvas.width, H=canvas.height;
  const ink = () => getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#142016';
  const KEY='gb_best_breakout_v1';

  let paused=true, waitingStart=true, dead=false;
  let score=0, best=Number(localStorage.getItem(KEY)||0);
  let lives=3;

  let paddle, ball, bricks;
  let launched=false;

  function reset(){
    paused=true; waitingStart=true; dead=false;
    score=0; lives=3; launched=false;
    best=Number(localStorage.getItem(KEY)||0);

    paddle={ x: W/2, y: H-20, w: 54, h: 8, v: 0 };
    ball={ x: W/2, y: H-30, r: 3, vx: 90, vy: -120 };
    bricks=[];
    const rows=6, cols=10;
    const bw=22, bh=10, gap=2;
    const startX = (W - (cols*bw + (cols-1)*gap))/2;
    const startY = 26;
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        bricks.push({ x:startX + c*(bw+gap), y:startY + r*(bh+gap), w:bw, h:bh, on:true });
      }
    }

    msgEl.textContent='BREAKOUT: ←→ muovi • A = launch • START pause • B reset';
    hud();
  }
  function back(){ reset(); }
  function hud(){
    hudL.textContent=`SC ${String(score).padStart(3,'0')}  ♥${lives}`;
    hudR.textContent=`BEST ${String(best).padStart(3,'0')}`;
  }

  function collideRectCircle(rx,ry,rw,rh,cx,cy,cr){
    const nx = Math.max(rx, Math.min(cx, rx+rw));
    const ny = Math.max(ry, Math.min(cy, ry+rh));
    const dx = cx-nx, dy = cy-ny;
    return (dx*dx + dy*dy) <= cr*cr;
  }

  function update(dt, input){
    if (input.startPressed){
      if (dead){ reset(); waitingStart=false; paused=false; msgEl.textContent='PLAY'; }
      else if (waitingStart){ waitingStart=false; paused=false; msgEl.textContent='PLAY'; }
      else { paused=!paused; msgEl.textContent = paused ? 'PAUSA' : 'PLAY'; }
    }
    if (paused || dead || waitingStart) return;

    const ax = (input.left?-1:0)+(input.right?1:0);
    paddle.x += ax * 180 * dt;
    paddle.x = Math.max(paddle.w/2+4, Math.min(W - paddle.w/2-4, paddle.x));

    if (!launched){
      ball.x = paddle.x;
      ball.y = paddle.y - 10;
      if (input.aPressed){ launched=true; }
      return;
    }

    ball.x += ball.vx*dt;
    ball.y += ball.vy*dt;

    if (ball.x < 6){ ball.x=6; ball.vx *= -1; }
    if (ball.x > W-6){ ball.x=W-6; ball.vx *= -1; }
    if (ball.y < 10){ ball.y=10; ball.vy *= -1; }

    if (collideRectCircle(paddle.x-paddle.w/2, paddle.y-paddle.h/2, paddle.w, paddle.h, ball.x, ball.y, ball.r) && ball.vy>0){
      const t = (ball.x - paddle.x) / (paddle.w/2);
      ball.vx = t * 160;
      ball.vy = -Math.max(120, Math.abs(ball.vy));
      ball.y = paddle.y - paddle.h/2 - ball.r - 1;
    }

    for (const b of bricks){
      if (!b.on) continue;
      if (collideRectCircle(b.x,b.y,b.w,b.h, ball.x, ball.y, ball.r)){
        b.on=false;
        score = Math.min(999, score+5);
        ball.vy *= -1;
        if (score > best){ best=score; localStorage.setItem(KEY,String(best)); }
        hud();
        break;
      }
    }

    if (bricks.every(b=>!b.on)){
      paused=true;
      msgEl.textContent='CLEAR! START per ricominciare.';
      reset();
      waitingStart=false;
      paused=true;
      return;
    }

    if (ball.y > H+10){
      lives -= 1;
      if (lives <= 0){
        dead=true; paused=true;
        msgEl.textContent='GAME OVER. START o B per ricominciare.';
      } else {
        launched=false;
        ball.vx = 90 * (Math.random()<0.5?-1:1);
        ball.vy = -120;
        msgEl.textContent='PALLA PERSA. Premi A per rilanciare.';
      }
      hud();
    }
  }

  function render(){
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='rgba(0,0,0,.06)'; ctx.fillRect(0,0,W,H);
    const c = ink();
    ctx.fillStyle=c;

    bricks.forEach(b=>{ if(b.on) ctx.fillRect(b.x,b.y,b.w,b.h); });
    ctx.fillRect(paddle.x-paddle.w/2, paddle.y-paddle.h/2, paddle.w, paddle.h);
    ctx.fillRect(ball.x-ball.r, ball.y-ball.r, ball.r*2, ball.r*2);

    if (paused || dead || waitingStart){
      ctx.fillStyle='rgba(255,255,255,.30)'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle=c;
      ctx.font='900 18px ui-monospace, Menlo, Monaco, Consolas, monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(dead ? 'GAME OVER' : (waitingStart ? 'PRESS START' : 'PAUSE'), W/2, H/2);
      if (!dead && !waitingStart && !launched){
        ctx.font='900 12px ui-monospace, Menlo, Monaco, Consolas, monospace';
        ctx.fillText('PRESS A TO LAUNCH', W/2, H/2 + 20);
      }
    }
  }

  reset();
  return { reset, update, render, back };
}
