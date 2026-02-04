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
  // 统一使用中文分组：颜色 / 材质 / 形制（形态按钮也映射到形制）
  let _opts = {"颜色":[], "材质":[], "形制":[]};
  const _groupOrder = ["颜色","材质","形制"];
  let _index = new Map(); // name -> {group, idx}

  // 去重但保留顺序
  function uniqKeepOrder(arr){
    const out = [];
    const seen = new Set();
    (arr||[]).forEach(v=>{
      const s = String(v||'').trim();
      if(!s) return;
      if(seen.has(s)) return;
      seen.add(s);
      out.push(s);
    });
    return out;
  }

  async function load(){
    try{
      const d = await getJSON('/api/settings/material_options');

      // 兼容：后端可能返回中文键（颜色/材质/形制）或英文字段（colors/materials/shapes）
      const cn_colors    = d['颜色'] || d['顏色'] || [];
      const cn_materials = d['材质'] || d['材質'] || [];
      const cn_shapes    = d['形制'] || [];

      _opts = {
        "颜色":    d.colors    || cn_colors,
        "材质":    d.materials || cn_materials,
        "形制":    d.shapes    || cn_shapes
      };

      // 去重但保留后端顺序
      _groupOrder.forEach(g=>{
        _opts[g] = uniqKeepOrder(_opts[g] || []);
      });

      // 构建排序索引（用于排序 tokens）
      _index = new Map();
      _groupOrder.forEach(g=>{
        const arr = _opts[g] || [];
        arr.forEach((name, idx)=>{
          _index.set(String(name||'').trim(), {group:g, idx});
        });
      });

      return _opts;
    }catch(e){
      // 兜底默认（也按固定顺序）
      _opts = {
        "颜色": ['水墨','设色','油彩'],
        "材质": ['纸本','绢本','洒金纸本'],
        "形制": ['镜心','立轴','镜框','手卷','卡纸','册页','扇面','成扇']
      };
      _index = new Map();
      _groupOrder.forEach(g=>{
        (_opts[g]||[]).forEach((name, idx)=>{
          _index.set(String(name||'').trim(), {group:g, idx});
        });
      });
      return _opts;
    }
  }

  // 按 material_options（后端返回的顺序）排序 + 去重
  function sortTokens(tokens){
    const list = uniqKeepOrder(tokens || []);

    const gRank = new Map(_groupOrder.map((g,i)=>[g,i]));
    function key(v){
      const info = _index.get(v);
      if(info){
        return [gRank.get(info.group), info.idx, v];
      }
      return [999, 999999, v];
    }

    list.sort((a,b)=>{
      const ka = key(a), kb = key(b);
      if(ka[0] !== kb[0]) return ka[0] - kb[0];
      if(ka[1] !== kb[1]) return ka[1] - kb[1];
      return String(ka[2]).localeCompare(String(kb[2]));
    });

    return list;
  }

  // 解析与序列化：数据库里统一保存成 “水墨、纸本、立轴” 这种
  function parse(txt){
    if (!txt) return [];
    const arr = String(txt)
      .replace(/，/g, ',')
      .replace(/、/g, ',')
      .split(',')
      .map(s=>s.trim())
      .filter(Boolean);
    return sortTokens(arr);
  }

  function serialize(list){
    const arr = sortTokens(list || []);
    return arr.join('、');
  }

  // 弹出复选框面板：先点“颜色/材质/形态(形制)”切换组，下方是复选框；点“添加”回调 tokens 数组
  async function openAdder(anchorEl, onAddTokens){
    await load();

    // 关闭旧的
    document.querySelectorAll('.mat-adder').forEach(x=>x.remove());

    const panel = document.createElement('div');
    panel.className = 'mat-adder';
    panel.style.position = 'fixed';
    panel.style.width = '300px';
    panel.style.zIndex = '9999';

    panel.innerHTML = `
      <div class="mat-row" style="display:flex; gap:8px; align-items:center;">
        <button type="button" class="btn sm" data-g="颜色">颜色</button>
        <button type="button" class="btn sm" data-g="材质">材质</button>
        <button type="button" class="btn sm" data-g="形制">形态</button>
      </div>

      <div class="mat-body" style="margin-top:10px; max-height:240px; overflow:auto; padding-right:6px;"></div>

      <div class="mat-actions" style="display:flex; gap:8px; justify-content:flex-end; margin-top:10px;">
        <button type="button" class="btn sm" data-act="cancel">取消</button>
        <button type="button" class="btn sm primary" data-act="ok">添加</button>
      </div>
    `;

    document.body.appendChild(panel);

    // 定位到按钮附近
    try{
      const R = anchorEl.getBoundingClientRect();
      const left = Math.min(window.innerWidth - 320, Math.max(10, R.left));
      const top  = Math.min(window.innerHeight - 10, Math.max(10, R.bottom + 6));
      panel.style.left = left.toFixed(0) + 'px';
      panel.style.top  = top.toFixed(0) + 'px';
    }catch{}

    const selected = {"颜色":new Set(), "材质":new Set(), "形制":new Set()};
    let active = "颜色";
    const body = panel.querySelector('.mat-body');

    function renderBody(){
      const opts = _opts[active] || [];
      if(!opts.length){
        body.innerHTML = `<div class="muted">（无选项）</div>`;
        return;
      }
      body.innerHTML = opts.map(v=>{
        const name = String(v||'').trim();
        const checked = selected[active].has(name) ? 'checked' : '';
        return `
          <label style="display:flex; gap:8px; align-items:center; padding:4px 0;">
            <input type="checkbox" value="${name}" ${checked}>
            <span>${name}</span>
          </label>
        `;
      }).join('');
    }

    // 切换组
    panel.querySelectorAll('button[data-g]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const g = btn.getAttribute('data-g');
        active = (g === '形态') ? '形制' : g;
        renderBody();
      });
    });

    // 勾选
    body.addEventListener('change', (ev)=>{
      const ck = ev.target.closest('input[type="checkbox"]');
      if(!ck) return;
      const v = String(ck.value||'').trim();
      if(!v) return;
      if(ck.checked) selected[active].add(v);
      else selected[active].delete(v);
    });

    function close(){
      panel.remove();
      document.removeEventListener('click', onDoc, true);
    }
    function onDoc(e){
      if (!panel.contains(e.target) && e.target !== anchorEl) close();
    }
    document.addEventListener('click', onDoc, true);

    panel.querySelector('[data-act="cancel"]').addEventListener('click', close);
    panel.querySelector('[data-act="ok"]').addEventListener('click', ()=>{
      const tokens = [
        ...Array.from(selected["颜色"]),
        ...Array.from(selected["材质"]),
        ...Array.from(selected["形制"])
      ];
      const sorted = sortTokens(tokens);
      if(sorted.length){
        try{ onAddTokens && onAddTokens(sorted); }catch{}
      }
      close();
    });

    renderBody();
  }

  return { load, parse, serialize, sortTokens, openAdder };
})();


  // 导出
  global.AU = { showToast, getJSON, sendJSON, checkPricePair, renameFileKeepExt, isHoverEnabled, Dict, Material };
})(window);
