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

(function(){
  const cfg = window.DEMO_CFG;

    // 只在 label_print 页面运行：必须有 cfg 且必须有 #lb-root
  if(!cfg || !document.getElementById("lb-root")){
    return;
  }

  const apiBase = (cfg.apiBase) ? cfg.apiBase : "/api";
  // token 允许从 URL 读取：/label_print?token=xxx
    // 优先使用模板注入的 cfg.token；如果为空则用 URL 参数写入
    try{
      const qs = new URLSearchParams(window.location.search);
      const urlToken = (qs.get("token") || "").trim();
      if(urlToken){
        cfg.token = cfg.token ? String(cfg.token).trim() : "";
        if(!cfg.token){
          cfg.token = urlToken;
          window.DEMO_CFG.token = urlToken;
        }
      }
    }catch(e){}


  const COLS = cfg.cols;
  const ROWS = cfg.rows;
  const PER_PAGE = COLS * ROWS;

  const PAGE_PX_W = 840;
  const PAGE_PX_H = 1188;
  const pxPerMm = PAGE_PX_W / cfg.pageWmm;
  function mmToPx(mm){ return mm * pxPerMm; }

  const root = document.getElementById("lb-root") || document.body;
  const elPrefix = root.querySelector("#prefix");
  const elCount = root.querySelector("#count");
  const elPrefixView = root.querySelector("#prefixView");
  const elCountView = root.querySelector("#countView");

  const elStartHint = root.querySelector("#startHint");
  const elPages = root.querySelector("#pages");
  const elPaperStage = root.querySelector("#paperStage");

  const btnResetStart = root.querySelector("#btnResetStart");
  const btnClearSkips = root.querySelector("#btnClearSkips");

  const navPrev = root.querySelector("#navPrev");
  const navNext = root.querySelector("#navNext");

  function clamp(n, min, max){
    return Math.max(min, Math.min(max, n));
  }

  function updateTopViews(){
    if(elPrefixView) elPrefixView.textContent = (elPrefix && elPrefix.value) ? elPrefix.value : "-";
    if(elCountView)  elCountView.textContent  = (elCount && elCount.value)  ? String(elCount.value) : "-";
  }

  // ===============================
  // 缩放：自适应 + Ctrl滚轮
  // ===============================
  let baseFitScale = 1;
  let userZoom = 1;

  function applyPaperScale(){
    const sticky = document.getElementById("stickyBar");
    const stickyH = sticky ? sticky.getBoundingClientRect().height : 0;

    const padding = 24;
    const availH = Math.max(200, window.innerHeight - stickyH - padding);

    let s = availH / PAGE_PX_H;
    s = Math.min(1, Math.max(0.35, s));
    baseFitScale = s;

    const finalScale = clamp(baseFitScale * userZoom, 0.20, 3.00);
    document.documentElement.style.setProperty("--paper-scale", String(finalScale));
  }
  window.addEventListener("resize", applyPaperScale);

  function setupCtrlWheelZoom(){
    if(!elPaperStage) return;

    elPaperStage.addEventListener("wheel", (e) => {
      if(!e.ctrlKey) return;
      e.preventDefault();

      const delta = e.deltaY;
      const step = 0.08;
      if(delta < 0){
        userZoom *= (1 + step);
      }else{
        userZoom *= (1 - step);
      }
      userZoom = clamp(userZoom, 0.35, 2.50);
      applyPaperScale();
    }, { passive:false });
  }

  // ===============================
  // 多页：左右三角切换（只显示当前页）
  // ===============================
  let currentPage = 0;
  let lastActionPage = 0;

  function syncNavUI(){
    const hasMulti = state.pages > 1;

    if(navPrev) navPrev.style.display = hasMulti ? "flex" : "none";
    if(navNext) navNext.style.display = hasMulti ? "flex" : "none";

    if(!hasMulti){
      currentPage = 0;
      return;
    }

    currentPage = clamp(currentPage, 0, state.pages - 1);

    if(navPrev) navPrev.disabled = (currentPage <= 0);
    if(navNext) navNext.disabled = (currentPage >= state.pages - 1);

    // 只显示当前页
    const papers = elPages.querySelectorAll(".paper");
    papers.forEach(p => {
      const pno = parseInt(p.dataset.page || "0", 10);
      p.style.display = (pno === currentPage) ? "block" : "none";
    });

    // 切页后重新适配（避免高度变化/滚动影响）
    applyPaperScale();

    // 切页时把预览区滚动回顶部，避免“切到下一页但还在下面”的错觉
    if(elPaperStage) elPaperStage.scrollTop = 0;
  }

  function goPrev(){
    if(state.pages <= 1) return;
    currentPage = clamp(currentPage - 1, 0, state.pages - 1);
    syncNavUI();
  }

  function goNext(){
    if(state.pages <= 1) return;
    currentPage = clamp(currentPage + 1, 0, state.pages - 1);
    syncNavUI();
  }

  if(navPrev) navPrev.addEventListener("click", goPrev);
  if(navNext) navNext.addEventListener("click", goNext);

  document.addEventListener("keydown", (e) => {
    // 不要在浏览器打印对话框/输入框里抢按键
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
    if(tag === "input" || tag === "textarea") return;

    if(e.key === "ArrowLeft") goPrev();
    if(e.key === "ArrowRight") goNext();
  });

  const rowMajorIndex = (page, row, col) => page * PER_PAGE + row * COLS + col;
  const idxToPageRowCol = (idx) => {
    const page = Math.floor(idx / PER_PAGE);
    const inPage = idx % PER_PAGE;
    const row = Math.floor(inPage / COLS);
    const col = inPage % COLS;
    return { page, row, col };
  };

  let demoCodes = null; // Array<string> or null

  let state = {
    startIndex: null,
    skipIndices: new Set(),
    placedMap: new Map(),
    pages: 1,
    lastClickedIndex: null,
  };

function getPayload(){
  const base = {
    startNo: 1,
    startIndex: state.startIndex == null ? 0 : state.startIndex,
    skipIndices: Array.from(state.skipIndices),
  };

  if(!Array.isArray(demoCodes) || demoCodes.length === 0){
    throw new Error("codes 未加载（token 模式下禁止使用 prefix/count）");
  }

  return { ...base, codes: demoCodes };
}

  async function apiPreview(){
    const payload = getPayload();
    const r = await fetch(`${apiBase}/preview`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload),
      cache:"no-store"
    });
    if(!r.ok){ throw new Error("preview failed"); }
    return await r.json();
  }

  function setStartHint(){
    if(state.startIndex == null){
      elStartHint.textContent = "未选择";
      return;
    }
    const t = idxToPageRowCol(state.startIndex);
    elStartHint.textContent = `第${t.page + 1}页 行${t.row + 1} 列${t.col + 1}`;
  }

  function applyPreviewResult(res){
    state.pages = res.pages || 1;
    state.placedMap.clear();

    const placed = res.placed || [];
    for(let i=0;i<placed.length;i++){
      state.placedMap.set(placed[i].index, placed[i].code);
    }
  }

  function buildPages(){
    elPages.innerHTML = "";

    const marginL = mmToPx(cfg.marginL);
    const marginT = mmToPx(cfg.marginT);
    const labelW = mmToPx(cfg.labelW);
    const labelH = mmToPx(cfg.labelH);
    const gapX = mmToPx(cfg.gapX);
    const gapY = mmToPx(cfg.gapY);
    const radiusPx = mmToPx(cfg.radius);

    const colLabelY = Math.max(4, marginT * 0.35);
    const rowLabelX = Math.max(4, marginL * 0.25);

    for(let p=0;p<state.pages;p++){
      const paper = document.createElement("div");
      paper.className = "paper";
      paper.dataset.page = String(p);

      for(let c=0;c<COLS;c++){
        const colTag = document.createElement("div");
        colTag.className = "col-label";
        const cx = marginL + c * (labelW + gapX) + labelW / 2;
        colTag.style.left = `${cx}px`;
        colTag.style.top = `${colLabelY}px`;
        colTag.textContent = String(c + 1);
        paper.appendChild(colTag);
      }

      for(let r=0;r<ROWS;r++){
        const rowTag = document.createElement("div");
        rowTag.className = "row-label";
        const cy = marginT + r * (labelH + gapY) + labelH / 2;
        rowTag.style.left = `${rowLabelX}px`;
        rowTag.style.top = `${cy}px`;
        rowTag.textContent = String(r + 1);
        paper.appendChild(rowTag);
      }

      for(let r=0;r<ROWS;r++){
        for(let c=0;c<COLS;c++){
          const idx = rowMajorIndex(p, r, c);

          const cell = document.createElement("div");
          cell.className = "cell";
          cell.dataset.index = String(idx);

          const left = marginL + c * (labelW + gapX);
          const top = marginT + r * (labelH + gapY);

          cell.style.left = `${left}px`;
          cell.style.top = `${top}px`;
          cell.style.width = `${labelW}px`;
          cell.style.height = `${labelH}px`;
          cell.style.borderRadius = `${radiusPx}px`;

          cell.addEventListener("click", (ev) => onCellClick(ev, idx));
          paper.appendChild(cell);
        }
      }

      elPages.appendChild(paper);
    }
  }

  function addCodeToCell(cell, code){
    const span = document.createElement("div");
    span.className = "code";
    span.textContent = code;

    const numPart = String(code).split("_").slice(-1)[0];
    const digits = /^\d+$/.test(numPart) ? numPart.length : 0;

    cell.classList.remove("d3","d4");
    if(digits >= 4){
      cell.classList.add("d4");
    }else if(digits >= 3){
      cell.classList.add("d3");
    }

    cell.appendChild(span);
  }

  function paintCells(){
    const cells = elPages.querySelectorAll(".cell[data-index]");
    cells.forEach(cell => {
      const idx = parseInt(cell.dataset.index, 10);

      cell.classList.remove("occupied","skipped","start","d3","d4");
      cell.innerHTML = "";

      if(state.skipIndices.has(idx)){
        cell.classList.add("skipped");
        const x = document.createElement("div");
        x.className = "x";
        x.textContent = "X";
        cell.appendChild(x);
      }

      const code = state.placedMap.get(idx);
      if(code){
        cell.classList.add("occupied");
        addCodeToCell(cell, code);
      }

      if(state.startIndex === idx){
        cell.classList.add("start");
      }
    });
  }

  function rangeIndices(a, b){
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    const arr = [];
    for(let i=start;i<=end;i++){ arr.push(i); }
    return arr;
  }

  function onCellClick(ev, idx){
    lastActionPage = Math.floor(idx / PER_PAGE);
    if(state.startIndex == null){
      state.startIndex = idx;
      state.lastClickedIndex = idx;
      refreshPreview().catch((e)=>{ alert(String(e && e.message ? e.message : e)); console.error(e); });

      return;
    }

    if(ev.shiftKey && state.lastClickedIndex != null){
      const arr = rangeIndices(state.lastClickedIndex, idx);
      const targetIsSkipped = state.skipIndices.has(idx);
      for(const i of arr){
        if(targetIsSkipped){
          state.skipIndices.delete(i);
        }else{
          state.skipIndices.add(i);
        }
      }
      state.lastClickedIndex = idx;
      refreshPreview().catch((e)=>{ alert(String(e && e.message ? e.message : e)); console.error(e); });

      return;
    }

    if(state.skipIndices.has(idx)){
      state.skipIndices.delete(idx);
    }else{
      state.skipIndices.add(idx);
    }
    state.lastClickedIndex = idx;
    refreshPreview().catch((e)=>{ alert(String(e && e.message ? e.message : e)); console.error(e); });

  }

  async function refreshPreview(){
    if(state.startIndex == null){
      state.placedMap.clear();
      state.pages = 1;
      currentPage = 0;
      buildPages();
      paintCells();
      setStartHint();
      syncNavUI();
      return;
    }

    const res = await apiPreview();
    applyPreviewResult(res);
    buildPages();
    paintCells();
    setStartHint();

    // 刷新后保持在“最后操作页”，避免在第2页打X后跳回第1页
    currentPage = clamp(lastActionPage, 0, state.pages - 1);

    syncNavUI();

  }

  if(btnResetStart){
    btnResetStart.addEventListener("click", () => {
      state.startIndex = null;
      state.lastClickedIndex = null;
      state.placedMap.clear();
      state.pages = 1;
      currentPage = 0;
      lastActionPage = 0;
      userZoom = 1;

      buildPages();
      paintCells();
      setStartHint();
      syncNavUI();
    });
  }

  if(btnClearSkips){
    btnClearSkips.addEventListener("click", () => {
      state.skipIndices.clear();
      refreshPreview().catch((e)=>{ alert(String(e && e.message ? e.message : e)); console.error(e); });

    });
  }

  const btnPrintDirect = root.querySelector("#btnPrintDirect");

  const afterPrintModal = document.getElementById("afterPrintModal");
  const afterPrintClose = document.getElementById("afterPrintClose");

  function openAfterPrintModal(){
    if(afterPrintModal){
      afterPrintModal.style.display = "flex";
    }
  }

  function closePageSafe(){
    // window.close 只有“脚本打开的窗口/标签页”才一定生效；这里做个兜底
    try{ window.close(); }catch(e){}
    setTimeout(() => { try{ window.close(); }catch(e){} }, 80);
    setTimeout(() => { window.location.href = "about:blank"; }, 120);
  }

  if(afterPrintClose){
    afterPrintClose.addEventListener("click", () => {
      closePageSafe();
    });
  }


if(btnPrintDirect){
  btnPrintDirect.addEventListener("click", async () => {
    if(state.startIndex == null){
      alert("请先点击贴纸格子选择起点");
      return;
    }

    // 防止重复触发
    btnPrintDirect.disabled = true;

    try{
      const payload = getPayload();

      const r = await fetch(`${apiBase}/print_label_pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await r.json();

      if(!data || !data.success){
        btnPrintDirect.disabled = false;
        alert("打印失败：" + ((data && data.msg) ? data.msg : "未知错误"));
        return;
      }

      // 成功：弹窗提示放纸 + 只允许关闭页面，避免多次触发打印
      openAfterPrintModal();

    }catch(e){
      btnPrintDirect.disabled = false;
      alert("打印失败：" + (e && e.message ? e.message : String(e)));
    }
  });
}

  function parseBatchFromCodes(codes){
  if(!Array.isArray(codes) || codes.length === 0) return "-";
  // 规则：取第一个码，去掉最后一个 _数字 部分
  const parts = String(codes[0]).split("_");
  if(parts.length >= 3) return parts.slice(0, -1).join("_");
  return codes[0];
}

async function loadCodesDemo(){
  const token = (window.DEMO_CFG && window.DEMO_CFG.token) ? String(window.DEMO_CFG.token).trim() : "";
  if(!token){
    // token 模式：没有 token 就不工作
    alert("缺少 token，无法生成标签");
    return false;
  }

  const url = `${apiBase}/label_context?token=${encodeURIComponent(token)}`;

  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok){
    alert("读取编号失败（token 无效或已过期）");
    return false;
  }

  const data = await r.json();
  if(!data || !Array.isArray(data.codes) || data.codes.length === 0){
    alert("该 token 没有关联任何编号，无法生成标签");
    return false;
  }

  demoCodes = data.codes;

  // 只显示，不参与计算
  if(elPrefixView) elPrefixView.textContent = parseBatchFromCodes(demoCodes);
  if(elCountView) elCountView.textContent = String(demoCodes.length);

  return true;
}



function setupPrintTipDrag(){
  if(!elPrintTip || !elPrintTipDrag) return;

  let dragging = false;
  let startX = 0, startY = 0;
  let originLeft = 0, originTop = 0;

  const onMove = (ev) => {
    if(!dragging) return;
    const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
    const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;

    const dx = clientX - startX;
    const dy = clientY - startY;

    const pad = 12;
    const tipW = elPrintTip.offsetWidth || 360;
    const tipH = elPrintTip.offsetHeight || 420;

    const left = clamp(originLeft + dx, pad, window.innerWidth - tipW - pad);
    const top  = clamp(originTop  + dy, pad, window.innerHeight - tipH - pad);

    elPrintTip.style.left = left + "px";
    elPrintTip.style.top  = top + "px";
  };

  const onUp = () => {
    dragging = false;
    tipPinned = true;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    document.removeEventListener("touchmove", onMove);
    document.removeEventListener("touchend", onUp);
  };

  const onDown = (ev) => {
    if(!isTipVisible()) return;
    dragging = true;
    const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
    const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;

    startX = clientX;
    startY = clientY;

    originLeft = parseFloat(elPrintTip.style.left || "0") || elPrintTip.getBoundingClientRect().left;
    originTop  = parseFloat(elPrintTip.style.top  || "0") || elPrintTip.getBoundingClientRect().top;

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove, {passive:false});
    document.addEventListener("touchend", onUp);
    ev.preventDefault();
  };

  elPrintTipDrag.addEventListener("mousedown", onDown);
  elPrintTipDrag.addEventListener("touchstart", onDown, {passive:false});
}
// init（token 模式：必须先拉到 codes 才允许进入）
loadCodesDemo().then((ok) => {
  if(!ok){
    // 失败：不做任何初始化，避免进入“空预览”
    return;
  }

  // token 成功：顶部显示已由 loadCodesDemo 设置
  setupCtrlWheelZoom();

  // 初次仅1页
  applyPaperScale();
  buildPages();
  paintCells();
  setStartHint();
  syncNavUI();
  });
})();
