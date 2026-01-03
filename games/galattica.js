export function createGame({ ctx, hudL, hudR, msgEl }) {
  function reset(){
    hudL.textContent = 'SCORE 000';
    hudR.textContent = 'BEST 000';
    msgEl.textContent = 'GALATTICA cartridge: in arrivo (schiva, wave, power-up).';
  }
  function update(){ }
  function render(){
    ctx.clearRect(0,0,256,256);
    ctx.fillStyle = 'rgba(0,0,0,.06)';
    ctx.fillRect(0,0,256,256);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#142016';
    ctx.font = '900 14px ui-monospace, Menlo, Monaco, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GALATTICA', 128, 118);
    ctx.font = '900 11px ui-monospace, Menlo, Monaco, Consolas, monospace';
    ctx.fillText('WORK IN PROGRESS', 128, 140);
  }
  reset();
  return { reset, update, render };
}
