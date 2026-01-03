export function createGame({ canvas, ctx, hudL, hudR, msgEl }) {
  const W=canvas.width, H=canvas.height;
  const ink = () => getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#142016';
  const KEY='gb_best_tetrislike_v1';

  const COLS=10, ROWS=20;
  const CELL=10;
  const PF_W=COLS*CELL;
  const PF_H=ROWS*CELL;
  const PF_X = Math.floor((W-PF_W)/2);
  const PF_Y = 24;

  const SHAPES = {
    I: [[1,1,1,1]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1]],
    L: [[1,0],[1,0],[1,1]],
    J: [[0,1],[0,1],[1,1]],
    S: [[0,1,1],[1,1,0]],
    Z: [[1,1,0],[0,1,1]]
  };
  const BAG = Object.keys(SHAPES);

  let paused=true, waitingStart=true, dead=false;
  let score=0, best=Number(localStorage.getItem(KEY)||0);
  let grid, cur, dropAcc=0;
  let dropSec=0.65;

  function reset(){
    paused=true; waitingStart=true; dead=false;
    score=0; best=Number(localStorage.getItem(KEY)||0);
    dropAcc=0; dropSec=0.65;
    grid = Array.from({length:ROWS}, ()=> Array(COLS).fill(0));
    cur = spawn();
    msgEl.textContent='TETRIS-like: ←→ move • A rotate • ↓ drop • START pause • B reset';
    hud();
  }
  function back(){ reset(); }
  function hud(){
    hudL.textContent=`SC ${String(score).padStart(3,'0')}`;
    hudR.textContent=`BEST ${String(best).padStart(3,'0')}`;
  }

  function clone(m){ return m.map(r=>r.slice()); }
  function rotate(mat){
    const h=mat.length, w=mat[0].length;
    const out = Array.from({length:w}, ()=> Array(h).fill(0));
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) out[x][h-1-y]=mat[y][x];
    return out;
  }

  function spawn(){
    const type = BAG[(Math.random()*BAG.length)|0];
    const m = clone(SHAPES[type]);
    const x = ((COLS - m[0].length)/2)|0;
    const y = 0;
    const p = { m, x, y };
    if (collides(p)) {
      dead=true; paused=true; waitingStart=false;
      msgEl.textContent='GAME OVER. START o B per ricominciare.';
      if (score > best){ best=score; localStorage.setItem(KEY,String(best)); }
      hud();
    }
    return p;
  }

  function collides(p){
    for(let y=0;y<p.m.length;y++){
      for(let x=0;x<p.m[0].length;x++){
        if (!p.m[y][x]) continue;
        const gx = p.x + x;
        const gy = p.y + y;
        if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return true;
        if (grid[gy][gx]) return true;
      }
    }
    return false;
  }

  function lock(){
    for(let y=0;y<cur.m.length;y++){
      for(let x=0;x<cur.m[0].length;x++){
        if (!cur.m[y][x]) continue;
        const gx=cur.x+x, gy=cur.y+y;
        if (gy>=0 && gy<ROWS && gx>=0 && gx<COLS) grid[gy][gx]=1;
      }
    }
    clearLines();
    cur = spawn();
  }

  function clearLines(){
    let cleared=0;
    for(let y=ROWS-1; y>=0; y--){
      if (grid[y].every(v=>v===1)){
        grid.splice(y,1);
        grid.unshift(Array(COLS).fill(0));
        cleared++;
        y++;
      }
    }
    if (cleared){
      const add = cleared===1?10:cleared===2?25:cleared===3?45:80;
      score = Math.min(999, score + add);
      dropSec = Math.max(0.18, dropSec - cleared*0.02);
      if (score > best){ best=score; localStorage.setItem(KEY,String(best)); }
      msgEl.textContent = cleared===4 ? 'TETRIS!' : `LINEE: ${cleared}`;
      hud();
    }
  }

  function tryMove(dx,dy){
    const p = { m:cur.m, x:cur.x+dx, y:cur.y+dy };
    if (!collides(p)){ cur.x+=dx; cur.y+=dy; return true; }
    return false;
  }

  function tryRotate(){
    const rm = rotate(cur.m);
    const kicks = [0, -1, 1, -2, 2];
    for (const k of kicks){
      const p = { m:rm, x:cur.x+k, y:cur.y };
      if (!collides(p)){ cur.m=rm; cur.x+=k; return true; }
    }
    return false;
  }

  function update(dt, input){
    if (input.startPressed){
      if (dead){ reset(); waitingStart=false; paused=false; msgEl.textContent='PLAY'; }
      else if (waitingStart){ waitingStart=false; paused=false; msgEl.textContent='PLAY'; }
      else { paused=!paused; msgEl.textContent = paused ? 'PAUSA' : 'PLAY'; }
    }
    if (paused || dead || waitingStart) return;

    if (input.left) tryMove(-1,0);
    else if (input.right) tryMove(1,0);

    if (input.aPressed) tryRotate();

    const soft = input.down ? 0.06 : dropSec;

    dropAcc += dt;
    while(dropAcc >= soft){
      if (!tryMove(0,1)) { lock(); }
      dropAcc -= soft;
    }

    hud();
  }

  function render(){
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='rgba(0,0,0,.06)'; ctx.fillRect(0,0,W,H);

    const c = ink();
    ctx.strokeStyle='rgba(20,32,22,.20)';
    ctx.lineWidth=2;
    ctx.strokeRect(PF_X-2, PF_Y-2, PF_W+4, PF_H+4);

    ctx.fillStyle=c;
    for(let y=0;y<ROWS;y++){
      for(let x=0;x<COLS;x++){
        if (!grid[y][x]) continue;
        ctx.fillRect(PF_X + x*CELL + 1, PF_Y + y*CELL + 1, CELL-2, CELL-2);
      }
    }

    if (cur){
      for(let y=0;y<cur.m.length;y++){
        for(let x=0;x<cur.m[0].length;x++){
          if (!cur.m[y][x]) continue;
          ctx.fillRect(PF_X + (cur.x+x)*CELL + 1, PF_Y + (cur.y+y)*CELL + 1, CELL-2, CELL-2);
        }
      }
    }

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
