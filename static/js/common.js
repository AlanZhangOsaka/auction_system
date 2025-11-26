// static/js/common.js
// 全站可复用的小工具函数与数据加载逻辑（尽量无侵入，可直接引用）
// ------------------------------------------------------------

(function(global){
  // —— 轻提示 ——
  function showToast(msg, type){
    const el = document.getElementById('top-toast');
    if(!el) { alert(msg); return; }
    el.textContent = msg;
    el.style.background = (type==='error' ? '#ef4444' : '#10b981');
    el.style.display = 'block';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=> el.style.display = 'none', 1600);
  }

  // —— fetch JSON 包装 ——
  async function getJSON(url){
    const r = await fetch(url, { credentials:'same-origin' });
    const ct = r.headers.get('content-type')||'';
    const d = ct.includes('application/json') ? await r.json() : await r.text();
    if(!r.ok) throw new Error((d && d.error) || r.statusText || r.status);
    return d;
  }
  async function sendJSON(url, method, body){
    const r = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });
    const d = await r.json().catch(()=> ({}));
    if(!r.ok) throw new Error(d.error || r.statusText || r.status);
    return d;
  }

  // —— 价格校验（万日元，非负整数；起拍价 <= 底价） ——
  function checkPricePair(obj, code){
    const hasSP = Object.prototype.hasOwnProperty.call(obj, 'starting_price');
    const hasRP = Object.prototype.hasOwnProperty.call(obj, 'reserve_price');
    if(!hasSP && !hasRP) return true;
    const isInt = v => v === null || v === undefined || /^\d+$/.test(String(v));
    const sp = obj.starting_price, rp = obj.reserve_price;
    if(!isInt(sp) || !isInt(rp)){ showToast(`${code}：金额需为非负整数（万日元）`,'error'); return false; }
    if(sp != null && rp != null && parseInt(sp,10) > parseInt(rp,10)){
      showToast(`${code}：起拍价不能高于底价`,'error'); return false;
    }
    return true;
  }

  // —— 文件重命名（保持扩展名） ——
  function renameFileKeepExt(file, base){
    let ext=''; const m=(file.name||'').match(/(\.[a-z0-9]+)$/i); if(m) ext=m[1];
    if(!ext && file.type){ const map={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif'}; ext=map[file.type]||''; }
    return new File([file], base+ext, {type:file.type});
  }

  // —— 悬停开关状态 ——
  function isHoverEnabled(){
    const cb = document.getElementById('hover-enable');
    return !!(cb && cb.checked);
  }

  // —— 字典加载（带缓存） ——
  const Dict = {
    _cat: null, _acc: null, _boxes: null, _boxSet: new Set(),
    async loadAll(){
      if(!this._cat)  { try{ this._cat  = (await getJSON('/api/settings/item_categories')).items||[]; }catch{} }
      if(!this._acc)  { try{ this._acc  = (await getJSON('/api/settings/accessory_types')).items||[]; }catch{} }
      if(!this._boxes){
        try{
          const d = await getJSON('/api/settings/boxes');
          this._boxes = d.items||[]; this._boxSet = new Set(this._boxes);
          const holder = document.getElementById('datalist-holder');
          if (holder){
            holder.querySelector('#boxes_datalist')?.remove();
            const dl = document.createElement('datalist'); dl.id='boxes_datalist';
            dl.innerHTML = this._boxes.map(v=>`<option value="${v}"></option>`).join('');
            holder.appendChild(dl);
          }
        }catch{}
      }
      return { categories: this._cat||[], accessories: this._acc||[], boxes: this._boxes||[], boxSet: this._boxSet };
    }
  };


  // —— 材质工具 ——
  const Material = (function(){
    let _opts = null; // {colors:[], materials:[], shapes:[]}
    // 加载枚举（仅一次缓存）
    async function load(){
      if (_opts) return _opts;
      try{
        const d = await getJSON('/api/settings/material_options');

      // 兼容：后端可能返回中文键（颜色/材质/形制）或英文字段（colors/materials/shapes）
      const cn_colors    = d['颜色'] || d['顏色'] || [];
      const cn_materials = d['材质'] || d['材質'] || [];
      const cn_shapes    = d['形制'] || [];
      _opts = {
        colors:    d.colors    || cn_colors,
        materials: d.materials || cn_materials,
        shapes:    d.shapes    || cn_shapes
      };
    }catch(e){
      // 兜底默认
      _opts = {
        colors:    ['水墨','设色','油彩'],
        materials: ['纸本','绢本','洒金纸本'],
        shapes:    ['镜心','立轴','镜框','手卷','卡纸','册页','扇面','成扇']
      };
    }
    return _opts;
  }
    // 解析与序列化
    function parse(txt){
      if (!txt) return [];
      return String(txt).replace(/，|、/g, ',').split(',').map(s=>s.trim()).filter(Boolean);
    }
    function serialize(list){
      return (list||[]).filter(Boolean).join(', ');
    }
    // 弹出小面板选择一次（颜色/材质/形态），回调返回拼接后的字符串，如“设色纸本立轴”
    async function openAdder(anchorEl, onAdd){
      const opts = await load();
      const panel = document.createElement('div');
      panel.className = 'mat-adder';
      panel.innerHTML = `
        <div class="mat-row">
          <select id="mat_color"><option value="">颜色</option>${opts.colors.map(v=>`<option value="${v}">${v}</option>`).join('')}</select>
          <select id="mat_material"><option value="">材质</option>${opts.materials.map(v=>`<option value="${v}">${v}</option>`).join('')}</select>
          <select id="mat_shape"><option value="">形态</option>${opts.shapes.map(v=>`<option value="${v}">${v}</option>`).join('')}</select>
        </div>
        <div class="mat-actions">
          <button type="button" class="btn sm" data-act="cancel">取消</button>
          <button type="button" class="btn sm primary" data-act="ok">添加</button>
        </div>`;
      document.body.appendChild(panel);
      // 定位到按钮附近
      try{
        const R = anchorEl.getBoundingClientRect();
        panel.style.position='fixed';
        panel.style.left = Math.min(window.innerWidth-10, Math.max(10, R.left)).toFixed(0)+'px';
        panel.style.top  = Math.min(window.innerHeight-10, Math.max(10, R.bottom+6)).toFixed(0)+'px';
      }catch{}
      function close(){ panel.remove(); document.removeEventListener('click', onDoc, true); }
      function onDoc(e){ if (!panel.contains(e.target) && e.target!==anchorEl) close(); }
      document.addEventListener('click', onDoc, true);
      panel.querySelector('[data-act="cancel"]').addEventListener('click', close);
      panel.querySelector('[data-act="ok"]').addEventListener('click', ()=>{
        const c = panel.querySelector('#mat_color').value.trim();
        const m = panel.querySelector('#mat_material').value.trim();
        const s = panel.querySelector('#mat_shape').value.trim();
        const t = `${c}${m}${s}`.trim();
        if (t) { try{ onAdd && onAdd(t); }catch{} }
        close();
      });
    }
    return { load, parse, serialize, openAdder };
  })();

  // 导出
  global.AU = { showToast, getJSON, sendJSON, checkPricePair, renameFileKeepExt, isHoverEnabled, Dict, Material };
})(window);
