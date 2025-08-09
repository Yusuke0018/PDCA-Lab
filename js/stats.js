// Stats rendering for HypoLab (extracted from hypolab-local.html)
(function(){
  if (typeof window === 'undefined') return;
  window.showStatsView = function showStatsView() {
    document.getElementById('home-view').style.display = 'none';
    document.getElementById('new-hypothesis-view').style.display = 'none';
    document.getElementById('shuffle-view').style.display = 'none';
    document.getElementById('progress-view').style.display = 'none';
    document.getElementById('history-view').style.display = 'none';
    document.getElementById('stats-view').style.display = 'block';

    if (typeof updateNavigation === 'function') updateNavigation('stats');

    const data = (typeof loadData === 'function') ? loadData() : { currentHypotheses: [], completedHypotheses: [] };
    const totalHypotheses = (data.currentHypotheses?.length || 0) + (data.completedHypotheses?.length || 0);
    let totalAchievement = 0; // 仮説平均用
    let uniqueDates = new Set();
    let weightedAchieved = 0; // 全体重み付き達成の合計

    const today = new Date();
    today.setHours(0,0,0,0);

    const all = [...(data.currentHypotheses||[]), ...(data.completedHypotheses||[])];
    all.forEach(hypothesis => {
      const start = new Date(hypothesis.startDate);
      start.setHours(0,0,0,0);
      const theoreticalEnd = new Date(start);
      theoreticalEnd.setDate(start.getDate() + (hypothesis.totalDays || 0) - 1);
      const end = hypothesis.completedDate ? new Date(hypothesis.completedDate) : today;
      end.setHours(0,0,0,0);
      const last = theoreticalEnd < end ? theoreticalEnd : end;

      // ユニーク日を収集
      for (let d = new Date(start); d <= last; d.setDate(d.getDate() + 1)) {
        uniqueDates.add(d.toISOString().split('T')[0]);
      }

      // 重み付き達成の集計
      const intensity = hypothesis.intensity || {};
      const achievements = hypothesis.achievements || {};
      Object.keys(achievements).forEach(key => {
        const kd = new Date(key);
        kd.setHours(0,0,0,0);
        if (kd >= start && kd <= last) {
          const mult = Number(intensity[key] ?? 1.0);
          weightedAchieved += mult;
        }
      });

      // 仮説ごとの平均達成率（表示用に継続）
      const timeDiff = Math.min(last.getTime(), today.getTime()) - start.getTime();
      const daysPassed = Math.min(
        Math.max(1, Math.floor(timeDiff / (1000 * 60 * 60 * 24)) + 1),
        hypothesis.totalDays || 0
      );
      const achievedDays = Object.keys(achievements).length;
      const achievementRate = daysPassed > 0 ? Math.round((achievedDays / daysPassed) * 100) : 0;
      totalAchievement += achievementRate;
    });

    const totalDaysUnique = uniqueDates.size;
    const avgAchievement = totalHypotheses > 0 ? Math.round(totalAchievement / totalHypotheses) : 0;
    const overallDailyRate = totalDaysUnique > 0 ? Math.floor((weightedAchieved / totalDaysUnique) * 100) : 0;

    const el = (id)=>document.getElementById(id);
    el('total-hypotheses') && (el('total-hypotheses').textContent = totalHypotheses);
    el('avg-achievement') && (el('avg-achievement').textContent = avgAchievement + '%');
    el('total-days') && (el('total-days').textContent = totalDaysUnique);
    el('overall-daily-rate') && (el('overall-daily-rate').textContent = overallDailyRate + '%');
    el('weighted-achieved') && (el('weighted-achieved').textContent = (Math.round(weightedAchieved * 10) / 10).toString());

    // 直近日次達成率（7/30日）のスパークライン描画
    const drawSparkline = (id, days) => {
      const svg = document.getElementById(id);
      if (!svg) return;
      const w = svg.viewBox.baseVal.width || 280;
      const h = svg.viewBox.baseVal.height || 48;
      const start = new Date(today);
      start.setDate(today.getDate() - days + 1);
      // 各日の日次達成率（重み/その日に期間内の仮説数）
      const values = [];
      for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().split('T')[0];
        let active = 0;
        let sum = 0;
        all.forEach(h => {
          const s = new Date(h.startDate); s.setHours(0,0,0,0);
          const tEnd = new Date(s); tEnd.setDate(s.getDate() + (h.totalDays||0) - 1);
          const e = h.completedDate ? new Date(h.completedDate) : today;
          e.setHours(0,0,0,0);
          const last = tEnd < e ? tEnd : e;
          if (d >= s && d <= last) {
            active += 1;
            if ((h.achievements||{})[key]) {
              sum += Number((h.intensity||{})[key] ?? 1.0);
            }
          }
        });
        const rate = active > 0 ? Math.min(100, Math.floor((sum / active) * 100)) : 0;
        values.push(rate);
      }
      const max = 100; // パーセント上限
      const stepX = w / Math.max(1, values.length - 1);
      const pts = values.map((v, i) => {
        const x = i * stepX;
        const y = h - (v / max) * (h - 8) - 4; // 上下マージン
        return `${x},${y}`;
      }).join(' ');
      svg.innerHTML = `
        <polyline fill="none" stroke="#10b981" stroke-width="2" points="${pts}" />
        <line x1="0" y1="${h-1}" x2="${w}" y2="${h-1}" stroke="rgba(148,163,184,0.3)" stroke-width="1" />
      `;
    };
    drawSparkline('sparkline-7', 7);
    drawSparkline('sparkline-30', 30);

    // 強度ラベル使用割合のドーナツ（表示は A/B/C）
    const labelCounts = {};
    const toFixed1 = (n) => (Math.round(Number(n) * 10) / 10).toFixed(1);
    all.forEach(h => {
      const opts = (h.intensityOptions && h.intensityOptions.length===3) ? h.intensityOptions : [
        { label:'軽め', mult:0.8 },{ label:'基本', mult:1.0 },{ label:'高強度', mult:1.2 }
      ];
      // 倍率の小→大で C,B,A を付与
      const sorted = [...opts].sort((a,b)=>Number(a.mult)-Number(b.mult));
      const mapMultToGrade = (m) => {
        const fixed = toFixed1(m);
        const idx = sorted.findIndex(o => toFixed1(o.mult) === fixed);
        if (idx === -1) return 'その他';
        return idx === 2 ? 'A' : (idx === 1 ? 'B' : 'C');
      };
      Object.keys(h.achievements||{}).forEach(key => {
        const m = Number((h.intensity||{})[key] ?? 1.0);
        const label = mapMultToGrade(m);
        labelCounts[label] = (labelCounts[label]||0) + 1;
      });
    });
    const donut = document.getElementById('donut-intensity');
    const legend = document.getElementById('donut-legend');
    if (donut && legend) {
      const total = Object.values(labelCounts).reduce((a,b)=>a+b,0) || 1;
      const entries = Object.entries(labelCounts);
      // SVGドーナツ描画
      const cx=80, cy=80, r=60, sw=20;
      let acc=0;
      const colors = ['#10b981','#3b82f6','#f59e0b','#ef4444','#8b5cf6'];
      donut.innerHTML='';
      legend.innerHTML='';
      entries.forEach(([label,count], idx)=>{
        const frac = count/total;
        const start = acc * 2*Math.PI - Math.PI/2;
        const end = (acc+frac) * 2*Math.PI - Math.PI/2;
        acc += frac;
        const large = (end-start) > Math.PI ? 1 : 0;
        const x1 = cx + r*Math.cos(start), y1 = cy + r*Math.sin(start);
        const x2 = cx + r*Math.cos(end),   y2 = cy + r*Math.sin(end);
        const path = document.createElementNS('http://www.w3.org/2000/svg','path');
        const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
        path.setAttribute('d', d);
        path.setAttribute('fill','none');
        path.setAttribute('stroke', colors[idx%colors.length]);
        path.setAttribute('stroke-width', String(sw));
        donut.appendChild(path);
        // 凡例
        const row = document.createElement('div');
        const esc = (typeof escapeHTML === 'function') ? escapeHTML : (s)=>String(s||'');
        row.innerHTML = `<span style="display:inline-block;width:10px;height:10px;background:${colors[idx%colors.length]};border-radius:2px;margin-right:6px;"></span>${esc(label)}: ${(Math.round(frac*100))}% (${count})`;
        legend.appendChild(row);
      });
      // 中央白ヌキ
      const hole = document.createElementNS('http://www.w3.org/2000/svg','circle');
      hole.setAttribute('cx', String(cx)); hole.setAttribute('cy', String(cy)); hole.setAttribute('r', String(r-sw/2));
      hole.setAttribute('fill', 'var(--background)');
      donut.appendChild(hole);
    }

    // 全仮説横断ストリーク（任意の仮説で達成があれば達成日とみなす）
    const dateMap = {};
    all.forEach(h => {
      Object.keys(h.achievements||{}).forEach(k => { dateMap[k] = true; });
    });
    const keys = Object.keys(dateMap).sort();
    let longest=0, current=0;
    // longest: 連続最大
    let prev=null;
    keys.forEach(k=>{
      const d = new Date(k);
      d.setHours(0,0,0,0);
      if (prev){
        const diff = (d - prev)/(1000*60*60*24);
        current = (diff===1) ? (current+1) : 1;
      } else {
        current = 1;
      }
      if (current>longest) longest=current;
      prev = d;
    });
    // current: 今日から遡って
    let cur=0; const d0=new Date(today);
    for (let d=new Date(d0); ; d.setDate(d.getDate()-1)){
      const k=d.toISOString().split('T')[0];
      if (dateMap[k]) cur+=1; else break;
    }
    const elLongest = document.getElementById('streak-longest');
    const elCurrent = document.getElementById('streak-current');
    if (elLongest) elLongest.textContent = String(longest||0);
    if (elCurrent) elCurrent.textContent = String(cur||0);
  };
})();

