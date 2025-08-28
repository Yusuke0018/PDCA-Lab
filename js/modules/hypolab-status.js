// ステータス管理（ドラクエ風）
(function(){
  const KEY = 'statusTable.v1';
  const CATEGORY_KEY = 'categoryLevels.v1';
  
  // カテゴリー定義
  const CATEGORIES = {
    morning: { name: '朝活', stat: 'keizoku', increment: 2 },
    english: { name: '英語', stat: 'shuchu', increment: 2 },
    life: { name: '人生', stat: 'sekkei', increment: 2 },
    family: { name: '妻と家庭', stat: 'kaifuku', increment: 2 },
    health: { name: '健康資産', stat: 'kiso', increment: 2 },
    knowledge: { name: '博識', stat: 'sekkei', increment: 1 },
    exercise: { name: '運動', stat: 'kiso', increment: 1 }
  };
  
  // レベル閾値
  const LEVEL_THRESHOLDS = [1,10,28,53,84,119,159,203,251,303,359,418,480,545,614,685,760,837,917,1000];
  
  // カテゴリー称号
  const CATEGORY_TITLES = {
    morning: [
      '夜明けの見習い','目覚めの実践者','早起きの芽生え','朝支度の助太刀','朝家事の番人',
      '暁の整備士','朝運動の走者','朝時間の管理人','朝育児の相棒','朝活の達者',
      '日課の設計士','早朝リズムの調律者','朝優先の指揮者','日の出の案内人','朝活の旗手',
      '破暁の統率者','モーニングマエストロ','暁の覇者','黎明の賢者','朝活の大成者'
    ],
    english: [
      'アルファベットの見習い','フォニックスの実践者','語彙の種まき','文法の整備士','発音の磨き手',
      'リスニングの探索者','シャドーイングの走者','ライティングの修行者','リーディングの案内人','英語学習の達者',
      '表現の設計士','フレーズの調律者','会話の橋渡し','英語思考の開拓者','実務英語の操縦士',
      '論理英語の指揮者','国際対話の使者','英語運用の匠','多言語の賢者','言語の大成者'
    ],
    life: [
      '羅針盤の見習い','小さな一歩の実践者','習慣の芽生え','優先順位の整備士','やめることの選定者',
      '時間管理の走者','記録と内省の書き手','目標の設計士','生活設計の案内人','人生習慣の達者',
      '意思決定の調律者','資源配分の参謀','長期戦略の航海士','再現性の開拓者','物語の脚本家',
      '人生KPIの監督','自己変革の匠','生き方の賢者','人生設計の統括者','人生のプロデューサー'
    ],
    family: [
      '感謝の見習い','ねぎらいの実践者','家事の助太刀','約束の番人','共感の練習生',
      '段取りの整備士','子ども時間の案内人','家庭の空気の調律者','対話の橋渡し','夫婦円満の達者',
      '負担分担の設計士','信頼の蓄積者','家事運営の参謀','家族会議の進行役','パートナーシップの指揮者',
      '家庭の守護者','余白づくりの匠','夫婦関係の賢者','家族幸福の統括者','暮らしのプロデューサー'
    ],
    health: [
      '睡眠の見習い','水分の番人','食習慣の実践者','姿勢の整備士','呼吸の使い手',
      'ストレッチの走者','体調の観測者','検診の皆勤者','休息の案内人','健康習慣の達者',
      '体調管理の設計士','免疫の調律者','予防の参謀','セルフケアの開拓者','健康投資の指揮者',
      '健康資本の守護者','ウェルビーイングの統括者','健康寿命の賢者','健康資産の管財官','生命力のマエストロ'
    ],
    knowledge: [
      '読書の見習い','ノートの採集者','要約の実践者','知識のタグ付け師','一次情報の探索者',
      '批判的思考の練習生','参照の整備士','概念の翻訳者','知識の設計士','教養の達者',
      '知の統合者','リサーチの参謀','知の建築士','洞察の錬金術師','学習の指揮者',
      '思想の案内人','博覧の賢者','叡智の守り手','知の大図書館長','博識の大成者'
    ],
    exercise: [
      '準備運動の見習い','フォームの実践者','体幹の整備士','柔軟の鍛錬者','心拍の管理人',
      '筋力の鍛錬者','持久の開拓者','負荷の設計士','休養の調律者','トレーニングの達者',
      '競技の挑戦者','パフォーマンスの指揮者','自己ベストの製作者','コンディショニングの参謀','フィジカルの匠',
      '体力の守護者','身体運用の賢者','アスリートの統括者','フィットネスのマエストロ','身体能力の大成者'
    ]
  };

  function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
  
  // カテゴリーレベルの保存と読み込み
  function loadCategoryLevels(){
    try{
      const raw = localStorage.getItem(CATEGORY_KEY);
      if (!raw) return initCategoryLevels();
      return JSON.parse(raw);
    }catch(_){
      return initCategoryLevels();
    }
  }
  
  function initCategoryLevels(){
    const levels = {};
    Object.keys(CATEGORIES).forEach(key => {
      levels[key] = { points: 0, level: 1 };
    });
    return levels;
  }
  
  function saveCategoryLevels(levels){
    try{ 
      localStorage.setItem(CATEGORY_KEY, JSON.stringify(levels));
    }catch(_){}
  }
  
  // ポイントからレベルを計算
  function calculateLevelFromPoints(points){
    for(let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--){
      if(points >= LEVEL_THRESHOLDS[i]) return i + 1;
    }
    return 1;
  }
  
  // カテゴリーポイント追加
  function addCategoryPoints(categoryKey, points){
    const levels = loadCategoryLevels();
    if(!levels[categoryKey]) return [];
    
    const oldLevel = levels[categoryKey].level;
    levels[categoryKey].points += points;
    const newLevel = calculateLevelFromPoints(levels[categoryKey].points);
    levels[categoryKey].level = newLevel;
    
    saveCategoryLevels(levels);
    
    // ステータス値も更新
    if(CATEGORIES[categoryKey] && CATEGORIES[categoryKey].stat && CATEGORIES[categoryKey].increment) {
      const statName = CATEGORIES[categoryKey].stat;
      const increment = CATEGORIES[categoryKey].increment * points;
      // ステータスの実際の更新はgetStatusForLevelで反映される
      console.log(`${statName}に${increment}ポイント追加予定（カテゴリー: ${categoryKey}）`);
    }
    
    // レベルアップした場合の情報を返す
    const levelUps = [];
    if(newLevel > oldLevel){
      for(let lv = oldLevel + 1; lv <= newLevel; lv++){
        levelUps.push({
          category: categoryKey,
          categoryName: CATEGORIES[categoryKey].name,
          level: lv,
          title: CATEGORY_TITLES[categoryKey][lv-1],
          stat: CATEGORIES[categoryKey].stat,
          increment: CATEGORIES[categoryKey].increment
        });
      }
    }
    return levelUps;
  }
  
  // カテゴリー称号取得
  function getCategoryTitle(categoryKey, level){
    if(!CATEGORY_TITLES[categoryKey]) return '';
    const lv = clamp(level, 1, 20);
    return CATEGORY_TITLES[categoryKey][lv-1] || '';
  }

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
      // lifetimeEarnedからレベルを正確に計算
      const lifetimePoints = (data && data.pointSystem && data.pointSystem.lifetimeEarned) ? data.pointSystem.lifetimeEarned : 0;
      const levelInfo = (typeof calculateLevel === 'function') ? calculateLevel(lifetimePoints) : { level: 1, name: '見習い冒険者' };
      const lv = levelInfo.level;
      const levelTitle = levelInfo.name;
      const s = getStatusForLevel(lv);
      const set = (id,val)=>{ const el = document.getElementById(id); if (el) el.textContent = String(val); };
      set('dq-level', lv);
      set('dq-level-title', levelTitle);
      set('dq-points', lifetimePoints);
      set('dq-keizoku', s.keizoku);
      set('dq-shuchu', s.shuchu);
      set('dq-kaifuku', s.kaifuku);
      set('dq-sekkei', s.sekkei);
      set('dq-kiso',   s.kiso);
      
      // カテゴリー別称号も表示
      const categoryList = document.getElementById('category-titles-list');
      if (categoryList) {
        const categoryLevels = loadCategoryLevels();
        const html = Object.entries(CATEGORIES).filter(([key]) => key !== 'other').map(([key, cat]) => {
          const catLevel = categoryLevels[key] || { level: 1, points: 0 };
          const catTitle = getCategoryTitle(key, catLevel.level);
          const nextThreshold = catLevel.level < 20 ? LEVEL_THRESHOLDS[catLevel.level] : '---';
          const pointsDisplay = `${catLevel.points}pt${nextThreshold !== '---' ? ` / 次Lv${nextThreshold}pt` : ''}`;
          return `<div class="dq-row" style="font-size: 13px; margin-bottom: 4px;">
            <div>${cat.name} <span style="color: #4fc3f7;">Lv.${catLevel.level}</span></div>
            <div style="font-size: 11px; color: #999; margin-left: 10px;">${pointsDisplay}</div>
            <div style="color: #ffd700; margin-left: 10px;">${catTitle}</div>
          </div>`;
        }).join('');
        categoryList.innerHTML = html;
      }
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
  window.StatusManager = {
    getStatusForLevel,
    getStatusDelta,
    getTable,
    loadCategoryLevels,
    saveCategoryLevels,
    addCategoryPoints,
    getCategoryTitle,
    CATEGORIES,
    CATEGORY_TITLES,
    LEVEL_THRESHOLDS
  };
  window.refreshStatusView = refreshStatusView;
})();

