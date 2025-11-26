
// Shared Hover Preview for inventory pages
// -------------------------------------------------------
// 该脚本被 list.html 与 batch_edit.html 共用。
// 功能：浮窗预览、拖动、滚轮缩放、抓手平移、位置记忆、开关记忆。
// 依赖：页面中需要有 #img-preview 结构，同 batch_edit 中 DOM。
// 用法：页面渲染完成后调用 bindPreview(); 悬停或逻辑中调用 showPreview(url)。

(function(global){
  const PREVIEW_POS_KEY = "imgPreviewPos";
  const HOVER_ENABLE_KEY = "hoverPreviewEnabled";
  let previewZoom = 1;
  let panX = 0, panY = 0;
  let panel, imgEl, bodyEl, closeBtn, dragBar, aOpen;

  function isHoverEnabled(){
    const cb = document.getElementById('hover-enable');
    return !!(cb && cb.checked);
  }

  function applyTransform(){
    if (!imgEl) return;
    imgEl.style.transform = `translate(${panX}px, ${panY}px) scale(${previewZoom})`;
    if (previewZoom > 1) bodyEl.classList.add('can-pan');
    else bodyEl.classList.remove('can-pan');
  }

  function resetTransform(){ previewZoom = 1; panX = 0; panY = 0; applyTransform(); }

  function showPreview(src){
    if (!isHoverEnabled()) return;
    if (!panel) return;
    resetTransform();
    imgEl.src = src;
    if (aOpen) aOpen.href = src;
    panel.style.display='block';
  }

  function bindPreview(){
    panel   = document.getElementById('img-preview');
    if (!panel) return;
    imgEl   = document.getElementById('img-preview-img');
    bodyEl  = document.getElementById('preview-body');
    closeBtn= document.getElementById('img-preview-close');
    dragBar = document.getElementById('img-preview-drag');
    aOpen   = document.getElementById('img-preview-open');

    if (!imgEl || !bodyEl || !closeBtn || !dragBar) return;

    // 初始化开关记忆
    const cb = document.getElementById('hover-enable');
    if (cb){
      let val = localStorage.getItem(HOVER_ENABLE_KEY);
      if (val === null) val = '1';
      cb.checked = (val === '1');
      cb.addEventListener('change', ()=>{
        localStorage.setItem(HOVER_ENABLE_KEY, cb.checked ? '1' : '0');
        if (!cb.checked) panel.style.display='none';
      });
    }

    // 恢复位置
    try{
      const pos = JSON.parse(localStorage.getItem(PREVIEW_POS_KEY)||"null");
      if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
        panel.style.left = pos.left + "px"; panel.style.top  = pos.top  + "px";
      }
    }catch{}

    // 关闭
    closeBtn.onclick = ()=>{ panel.style.display='none'; resetTransform(); };

    // 拖动窗口
    let dragging=false, dx=0, dy=0;
    dragBar.addEventListener('mousedown', (e)=>{
      dragging = true;
      const rect = panel.getBoundingClientRect();
      dx = e.clientX - rect.left; dy = e.clientY - rect.top;
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', (e)=>{
      if(!dragging) return;
      const w = panel.offsetWidth, h = panel.offsetHeight;
      const maxL = window.innerWidth - w - 8;
      const maxT = window.innerHeight - h - 8;
      let left = Math.min(Math.max(e.clientX - dx, 8), Math.max(8, maxL));
      let top  = Math.min(Math.max(e.clientY - dy, 8), Math.max(8, maxT));
      panel.style.left = left + "px"; panel.style.top  = top  + "px";
    });
    document.addEventListener('mouseup', ()=>{
      if(!dragging) return;
      dragging=false; document.body.style.userSelect = '';
      const rect = panel.getBoundingClientRect();
      localStorage.setItem(PREVIEW_POS_KEY, JSON.stringify({left: rect.left, top: rect.top}));
    });

    // 缩放 & 平移
    bodyEl.addEventListener('wheel', (e)=>{
      e.preventDefault();
      const oldZ = previewZoom;
      const step = 0.1;
      const newZ = (e.deltaY < 0) ? Math.min(4, oldZ + step) : Math.max(1, oldZ - step);
      if (newZ === oldZ) return;
      const rect = imgEl.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const ratio = newZ / oldZ;
      panX = panX + (mx) * (1 - ratio);
      panY = panY + (my) * (1 - ratio);
      previewZoom = newZ;
      applyTransform();
    }, { passive:false });

    let panning=false, startX=0, startY=0, activePointerId=null;
    const onPointerUpCancel = (e)=>{
      if (!panning || (activePointerId !== null && e.pointerId !== activePointerId)) return;
      panning = false; bodyEl.classList.remove('panning');
      try{ bodyEl.releasePointerCapture(activePointerId); }catch{}
      activePointerId = null;
    };

    bodyEl.addEventListener('pointerdown', (e)=>{
      if ((e.button !== 0 && e.buttons !== 1) || previewZoom <= 1) return;
      panning = true; activePointerId = e.pointerId;
      startX = e.clientX; startY = e.clientY;
      bodyEl.classList.add('panning');
      try{ bodyEl.setPointerCapture(activePointerId); }catch{}
      e.preventDefault();
      const onMove = (ev)=>{
        if (!panning || ev.pointerId !== activePointerId) return;
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        startX = ev.clientX; startY = ev.clientY;
        panX += dx / previewZoom; panY += dy / previewZoom;
        applyTransform(); ev.preventDefault();
      };
      bodyEl.addEventListener('pointermove', onMove, { passive:false, once:false });
      const stop = ()=>{ bodyEl.removeEventListener('pointermove', onMove); };
      bodyEl.addEventListener('pointerup', ()=>{ stop(); onPointerUpCancel({pointerId:activePointerId}); }, { once:true });
      bodyEl.addEventListener('pointercancel', ()=>{ stop(); onPointerUpCancel({pointerId:activePointerId}); }, { once:true });
      window.addEventListener('pointerup', ()=>{ stop(); onPointerUpCancel({pointerId:activePointerId}); }, { once:true });
      window.addEventListener('blur', ()=>{ stop(); onPointerUpCancel({pointerId:activePointerId}); }, { once:true });
      document.addEventListener('mouseleave', ()=>{ stop(); onPointerUpCancel({pointerId:activePointerId}); }, { once:true });
    });
  }

  // 导出到全局供模板使用
  global.bindPreview = bindPreview;
  global.showPreview  = showPreview;
})(window);
