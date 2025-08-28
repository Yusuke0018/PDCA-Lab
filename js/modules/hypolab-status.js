// ステータス管理（ドラクエ風）
(function(){
  const KEY = 'statusTable.v1';

  function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

  function loadStatusTable(){
    try{
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const tbl = JSON.parse(raw);
      if (Array.isArray(tbl) && tbl.length === 100) return tbl;
    }catch(_){}
    return null;
  }

  function saveStatusTable(tbl){
    try{ localStorage.setItem(KEY, JSON.stringify(tbl)); }catch(_){ }
  }

  // フォールバック生成: 増分最小（継続力+2、他+1）をベースに余剰を滑らか配分
  function generateFallbackTable(){
    const base = { keizoku:20, shuchu:15, kaifuku:12, sekkei:12, kiso:12 };
    const target = { keizoku:900, shuchu:760, kaifuku:700, sekkei:620, kiso:560 };
    const minInc = { keizoku:2, shuchu:1, kaifuku:1, sekkei:1, kiso:1 };
    const lastJump = { keizoku:25, shuchu:22, kaifuku:13, sekkei:18, kiso:13 }; // Lv99→100 固定
    const steps = 99; // 1→100 の遷移数

    // 余剰配分重み（序盤・中盤・終盤に山がある緩いカーブ）
    const weights = Array.from({length:steps}, (_,i)=>{
      const t = (i+1)/steps; // 1..99 → 0..1
      // 3峰型: 早/中/終 で少し強調（Lv10・Lv50・Lv100 近辺）
      const w = 0.9 + 0.6*Math.exp(-Math.pow((t-0.1)/0.08,2))
                 + 0.6*Math.exp(-Math.pow((t-0.5)/0.12,2))
                 + 0.9*Math.exp(-Math.pow((t-0.98)/0.03,2));
      return w;
    });
    const sumW = weights.reduce((a,b)=>a+b,0);

    const stats = [{...base}];

    // 各ステータスごとに増分列を作る
    const buildSeries = (name)=>{
      const series = Array(steps).fill(0);
      // 最低増分を先に配分
      for(let i=0;i<steps;i++) series[i] = minInc[name];
      // 終盤の最後のジャンプを確保（Lv99→100）
      series[steps-1] = Math.max(series[steps-1], lastJump[name]);
      const totalNeeded = target[name]-base[name];
      let rest = totalNeeded - series.reduce((a,b)=>a+b,0);
      if (rest < 0) rest = 0; // 念のため
      // 余剰を重みに応じて配分
      for(let i=0;i<steps;i++){
        if (rest<=0) break;
        const add = Math.floor((weights[i]/sumW)*rest);
        series[i] += add;
      }
      // 端数調整
      let current = series.reduce((a,b)=>a+b,0);
      let idx = 0;
      while(current < totalNeeded){ series[idx%steps]++; idx++; current++; }
      while(current > totalNeeded){ const j = (steps-1) - (idx%steps); if (series[j] > minInc[name]) { series[j]--; current--; } idx++; }
      return series;
    };

    const inc = {
      keizoku: buildSeries('keizoku'),
      shuchu: buildSeries('shuchu'),
      kaifuku: buildSeries('kaifuku'),
      sekkei: buildSeries('sekkei'),
      kiso:    buildSeries('kiso'),
    };

    // 累積して各レベルの値を作成
    let cur = {...base};
    for(let i=0;i<steps;i++){
      cur = {
        keizoku: cur.keizoku + inc.keizoku[i],
        shuchu:  cur.shuchu  + inc.shuchu[i],
        kaifuku: cur.kaifuku + inc.kaifuku[i],
        sekkei:  cur.sekkei  + inc.sekkei[i],
        kiso:    cur.kiso    + inc.kiso[i],
      };
      stats.push({...cur});
    }
    return stats; // length 100（Lv1..100）
  }

  function getTable(){
    return loadStatusTable() || generateFallbackTable();
  }

  function getStatusForLevel(level){
    const tbl = getTable();
    const lv = clamp(level|0, 1, 100);
    return tbl[lv-1];
  }

  function getStatusDelta(fromLevel, toLevel){
    const f = clamp(fromLevel|0, 1, 100);
    const t = clamp(toLevel|0, 1, 100);
    if (t <= f) return { keizoku:0, shuchu:0, kaifuku:0, sekkei:0, kiso:0 };
    const tbl = getTable();
    const a = tbl[f-1], b = tbl[t-1];
    return {
      keizoku: b.keizoku - a.keizoku,
      shuchu:  b.shuchu  - a.shuchu,
      kaifuku: b.kaifuku - a.kaifuku,
      sekkei:  b.sekkei  - a.sekkei,
      kiso:    b.kiso    - a.kiso,
    };
  }


  // UI 更新
  function refreshStatusView(){
    try{
      const data = loadData();
      const lv = (data && data.pointSystem && data.pointSystem.currentLevel) ? data.pointSystem.currentLevel : 1;
      const s = getStatusForLevel(lv);
      const set = (id,val)=>{ const el = document.getElementById(id); if (el) el.textContent = String(val); };
      set('dq-level', lv);
      set('dq-keizoku', s.keizoku);
      set('dq-shuchu', s.shuchu);
      set('dq-kaifuku', s.kaifuku);
      set('dq-sekkei', s.sekkei);
      set('dq-kiso',   s.kiso);
    }catch(_){ }
  }

  // 画面表示
  function showStatusView(){
    try{
      resetScrollToTop();
      const ids = ['home-view','new-hypothesis-view','progress-view','history-view','stats-view','points-view','cards-view'];
      ids.forEach(id=>{ const el = document.getElementById(id); if (el) el.style.display = 'none'; });
      const v = document.getElementById('status-view'); if (v) v.style.display = 'block';
      updateNavigation('status');
      refreshStatusView();
      const pointDisplay = document.getElementById('point-display'); if (pointDisplay) pointDisplay.style.display = 'none';
    }catch(_){ }
  }



  // 公開
  window.getStatusForLevel = getStatusForLevel;
  window.getStatusDelta = getStatusDelta;
  window.showStatusView = showStatusView;
  window.refreshStatusView = refreshStatusView;
})();

