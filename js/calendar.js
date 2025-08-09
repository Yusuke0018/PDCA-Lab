// Calendar, intensity picker, and progress rendering (extracted)
(function(){
  if (typeof window === 'undefined') return;

  // Expose helpers if not already global
  const g = window;

  g.applySkipTicket = function applySkipTicket(dateKey, dayCell) {
    if (!g.skipTicketMode) return;
    if (g.currentHypothesis.achievements[dateKey]) { g.showNotification && g.showNotification('⚠️ すでに達成済みの日です', 'error'); return; }
    const today = new Date(); today.setHours(0,0,0,0);
    const target = new Date(dateKey);
    if (target > today) { g.showNotification && g.showNotification('⚠️ 未来日はスキップできません', 'error'); return; }

    const data = (g.loadData ? g.loadData() : null);
    const idx = data && data.cards && data.cards.inventory ? data.cards.inventory.findIndex(c => c.cardId==='skip_ticket' && !c.used) : -1;
    if (idx === -1) {
      g.showNotification && g.showNotification('⚠️ スキップチケットがありません', 'error');
      g.skipTicketMode = false;
      g.updateCalendar && g.updateCalendar();
      return;
    }
    if (!confirm(`この日をスキップして達成済みにしますか？\n日付: ${dateKey}`)) return;

    if (!g.currentHypothesis.achievements) g.currentHypothesis.achievements = {};
    g.currentHypothesis.achievements[dateKey] = true;

    data.cards.inventory[idx].used = true;
    data.cards.inventory[idx].usedDate = new Date().toISOString();
    const hIdx = data.currentHypotheses.findIndex(h => h.id === g.currentHypothesis.id);
    if (hIdx !== -1) {
      if (!data.currentHypotheses[hIdx].achievements) data.currentHypotheses[hIdx].achievements = {};
      data.currentHypotheses[hIdx].achievements[dateKey] = true;
    }
    g.saveData && g.saveData(data);

    g.skipTicketMode = false;
    dayCell.classList.remove('not-achieved');
    dayCell.classList.add('achieved');
    dayCell.style.transition = 'all 0.5s ease';
    dayCell.style.transform = 'scale(1.2)';
    dayCell.style.boxShadow = '0 0 20px var(--primary)';
    setTimeout(() => { dayCell.style.transform='scale(1)'; dayCell.style.boxShadow=''; }, 500);
    g.showNotification && g.showNotification('✅ スキップチケットを使用しました！', 'success');
    g.updateCalendar && g.updateCalendar();
    g.updateProgress && g.updateProgress();
    try { setTimeout(() => g.openIntensityPicker && g.openIntensityPicker(dateKey), 0); } catch (_) {}
  };

  g.updateCalendar = function updateCalendar() {
    const calendarGrid = document.getElementById('calendar-grid');
    if (!calendarGrid || !g.currentHypothesis) return;
    calendarGrid.innerHTML = '';
    const startDate = new Date(g.currentHypothesis.startDate);
    const today = new Date(); today.setHours(0,0,0,0); startDate.setHours(0,0,0,0);
    const timeDiff = today.getTime() - startDate.getTime();
    const daysPassed = Math.min(Math.max(1, Math.floor(timeDiff/(1000*60*60*24))+1), g.currentHypothesis.totalDays);

    for (let i=0;i<g.currentHypothesis.totalDays;i++){
      const cellDate = new Date(startDate); cellDate.setDate(startDate.getDate()+i);
      const dayCell = document.createElement('div'); dayCell.className='day-cell'; dayCell.style.position='relative';
      const displayMonth = cellDate.getMonth()+1; const displayDate = cellDate.getDate();
      dayCell.innerHTML = `<small>${displayMonth}/${displayDate}</small><br>${i+1}`;
      dayCell.dataset.day = i+1;
      const dateKey = cellDate.toISOString().split('T')[0];
      const mult = Number((g.currentHypothesis.intensity||{})[dateKey] ?? 1.0);
      const multBadge = document.createElement('div'); multBadge.style.cssText='position:absolute;bottom:6px;right:6px;font-size:10px;color:#94a3b8;';
      const optsCal = (g.currentHypothesis.intensityOptions && g.currentHypothesis.intensityOptions.length===3) ? g.currentHypothesis.intensityOptions : [{label:'軽め',mult:0.8},{label:'基本',mult:1.0},{label:'高強度',mult:1.2}];
      const toFixed1 = (n)=> (Math.round(Number(n)*10)/10).toFixed(1);
      const sorted = [...optsCal].sort((a,b)=>Number(a.mult)-Number(b.mult));
      const idx = sorted.findIndex(o => toFixed1(o.mult)===toFixed1(mult));
      const grade = idx===2?'A':(idx===1?'B':'C');
      multBadge.textContent = grade; dayCell.appendChild(multBadge);
      if (g.currentHypothesis.declarations && g.currentHypothesis.declarations[dateKey]){ const dot=document.createElement('div'); dot.style.cssText='position:absolute;top:6px;right:6px;color:#f59e0b;font-size:10px;'; dot.textContent='●'; dayCell.appendChild(dot); }

      if (cellDate > today && !g.skipTicketMode) {
        dayCell.classList.add('future');
      } else if (g.currentHypothesis.achievements[dateKey]) {
        dayCell.classList.add('achieved'); dayCell.style.cursor='pointer'; dayCell.onclick=()=>g.toggleDayStatus(dateKey, dayCell);
      } else {
        dayCell.classList.add('not-achieved');
        if (g.skipTicketMode) {
          if (cellDate <= today) { dayCell.style.cursor='pointer'; dayCell.style.border='2px dashed var(--primary)'; dayCell.onclick=()=>g.applySkipTicket(dateKey, dayCell); }
          else { dayCell.classList.add('future'); }
        } else {
          dayCell.onclick=()=>g.toggleDayStatus(dateKey, dayCell);
        }
      }
      if (cellDate.toDateString()===today.toDateString()) {
        if (!g.currentHypothesis.achievements[dateKey]) {
          dayCell.classList.remove('future'); dayCell.classList.add('not-achieved');
          dayCell.onclick = g.skipTicketMode ? ()=>g.applySkipTicket(dateKey, dayCell) : ()=>g.toggleDayStatus(dateKey, dayCell);
        }
      }
      if (cellDate <= today) {
        g.attachLongPress && g.attachLongPress(dayCell, ()=>g.openIntensityPicker && g.openIntensityPicker(dateKey));
        dayCell.addEventListener('contextmenu', (e)=>{ e.preventDefault(); g.openIntensityPicker && g.openIntensityPicker(dateKey); });
      }
      calendarGrid.appendChild(dayCell);
    }
    const info = document.getElementById('progress-days-info');
    if (info) info.textContent = `検証期間: ${daysPassed}日目 / ${g.currentHypothesis.totalDays}日間`;
  };

  g.attachLongPress = function attachLongPress(element, onLongPress, delay=500){
    let timer=null; let longPressed=false;
    const start=()=>{ longPressed=false; timer=setTimeout(()=>{ longPressed=true; onLongPress(); }, delay); };
    const cancel=()=>{ if (timer) clearTimeout(timer); };
    element.addEventListener('touchstart', start, {passive:true});
    element.addEventListener('touchend', cancel, {passive:true});
    element.addEventListener('touchmove', cancel, {passive:true});
    element.addEventListener('mousedown', start);
    element.addEventListener('mouseup', cancel);
    element.addEventListener('mouseleave', cancel);
  };

  g.openIntensityPicker = function openIntensityPicker(dateKey){
    if (!g.currentHypothesis) return;
    const hyp=g.currentHypothesis; hyp.intensity=hyp.intensity||{};
    hyp.intensityOptions=hyp.intensityOptions||[{label:'軽め',mult:0.8},{label:'基本',mult:1.0},{label:'高強度',mult:1.2}];
    const opts=hyp.intensityOptions; const current=Number(hyp.intensity[dateKey] ?? 1.0);
    const overlay=document.createElement('div'); overlay.className='overlay active'; overlay.style.backdropFilter='blur(6px)';
    const modal=document.createElement('div'); modal.className='skip-modal active'; modal.style.maxWidth='480px'; modal.style.padding='20px';
    const title=new Date(dateKey).toLocaleDateString('ja-JP');
    const esc=(s)=> (typeof g.escapeHTML==='function' ? g.escapeHTML(String(s)) : String(s));
    const isAchieved=!!((hyp.achievements||{})[dateKey]);
    const btnCss=(active)=>`padding:10px 12px;border-radius:10px;border:2px solid ${active?'#10b981':'#334155'};background:${active?'rgba(16,185,129,0.15)':'rgba(30,41,59,0.5)'};color:#e2e8f0;${isAchieved?'cursor:pointer;':'opacity:0.6;cursor:not-allowed;'}`;
    modal.innerHTML=`
      <div class="modal-header" style="margin-bottom:16px;">
        <h3>💪 強度を選択 (${esc(title)})</h3>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${opts.map((o, idx)=>`<button data-idx="${idx}" style="${btnCss(current===Number(o.mult))}">${esc(o.label)} (×${Number(o.mult).toFixed(1)})</button>`).join('')}
      </div>
      <div class="modal-footer" style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
        <button class="button secondary" id="intensity-cancel">閉じる</button>
      </div>`;
    overlay.appendChild(modal); document.body.appendChild(overlay);
    if (isAchieved) {
      modal.querySelectorAll('button[data-idx]').forEach(btn=>{
        btn.onclick=()=>{ const idx=Number(btn.getAttribute('data-idx')); const mult=Number(opts[idx].mult); hyp.intensity[dateKey]=mult; const data=g.loadData(); const i=data.currentHypotheses.findIndex(h=>h.id===hyp.id); if(i!==-1){ data.currentHypotheses[i]=hyp; g.saveData(data);} g.updateCalendar&&g.updateCalendar(); g.updateProgress&&g.updateProgress(); document.body.removeChild(overlay); };
      });
    } else {
      const info=document.createElement('div'); info.style.cssText='margin-top:12px;color:#94a3b8;font-size:12px;'; info.textContent='未達成日の強度は変更できません。先に達成を記録してください。'; modal.appendChild(info);
    }
    document.getElementById('intensity-cancel').onclick=()=>{ document.body.removeChild(overlay); };
  };

  g.toggleDayStatus = function toggleDayStatus(dateKey, dayCell){
    if (!g.currentHypothesis.achievements[dateKey]){
      g.currentHypothesis.achievements[dateKey]=true; dayCell.classList.remove('not-achieved'); dayCell.classList.add('achieved'); g.showAchievementAnimation&&g.showAchievementAnimation();
      // 達成直後に強度選択モーダル（今日/過去とも）
      try { setTimeout(()=> g.openIntensityPicker && g.openIntensityPicker(dateKey), 0); } catch(_){}
    } else {
      delete g.currentHypothesis.achievements[dateKey]; dayCell.classList.remove('achieved'); dayCell.classList.add('not-achieved');
      try { if (g.currentHypothesis.intensity) delete g.currentHypothesis.intensity[dateKey]; } catch(_){}
    }
    const data=g.loadData(); const index=data.currentHypotheses.findIndex(h=>h.id===g.currentHypothesis.id); if(index!==-1){ data.currentHypotheses[index]=g.currentHypothesis; g.saveData(data);} g.updateProgress&&g.updateProgress(); if (g.currentHypothesis.resetRisk){ setTimeout(()=> g.checkResetRisk&&g.checkResetRisk(), 100); }
  };

  g.checkResetRisk = function checkResetRisk(){
    if (!g.currentHypothesis || !g.currentHypothesis.resetRisk) return;
    const today=new Date(); today.setHours(0,0,0,0);
    let consecutiveFailures=0;
    for (let i=1;i<=3;i++){
      const checkDate=new Date(today); checkDate.setDate(checkDate.getDate()-i); const dateKey=checkDate.toISOString().split('T')[0];
      const startDate=new Date(g.currentHypothesis.startDate); startDate.setHours(0,0,0,0);
      if (checkDate>=startDate && !g.currentHypothesis.achievements[dateKey]) consecutiveFailures++; else break;
    }
    if (consecutiveFailures>=3){ g.currentHypothesis.achievements={}; const data=g.loadData(); const index=data.currentHypotheses.findIndex(h=>h.id===g.currentHypothesis.id); if(index!==-1){ data.currentHypotheses[index]=g.currentHypothesis; g.saveData(data);} g.showCardEffect&&g.showCardEffect('リセットリスク発動！','3日連続未達成により、全ての達成がリセットされました','#dc2626'); g.updateCalendar&&g.updateCalendar(); g.updateProgress&&g.updateProgress(); }
  };

  g.showAchievementAnimation = function showAchievementAnimation(){
    const emojis=['🎉','✨','🌟','⭐','🎊','💫','🏆','🔥','💪','🚀','🎯','🥳','👏','💯']; const numberOfEmojis=8;
    for (let i=0;i<numberOfEmojis;i++){
      setTimeout(()=>{ const emoji=emojis[Math.floor(Math.random()*emojis.length)]; const animation=document.createElement('div'); animation.className='achievement-animation'; animation.textContent=emoji; const startX=Math.random()*window.innerWidth; const startY=window.innerHeight/2+(Math.random()-0.5)*200; animation.style.left=startX+'px'; animation.style.top=startY+'px'; const angle=Math.random()*Math.PI*2; const distance=200+Math.random()*300; const endX=startX+Math.cos(angle)*distance; const endY=startY+Math.sin(angle)*distance-200; animation.style.setProperty('--startX',startX+'px'); animation.style.setProperty('--startY',startY+'px'); animation.style.setProperty('--endX',endX+'px'); animation.style.setProperty('--endY',endY+'px'); document.body.appendChild(animation); setTimeout(()=>{ animation.remove(); },2000); }, i*100);
    }
  };

  g.updateProgress = function updateProgress(){
    const startDate = new Date(g.currentHypothesis.startDate); const today=new Date(); today.setHours(0,0,0,0); startDate.setHours(0,0,0,0);
    const timeDiff=today.getTime()-startDate.getTime(); const daysPassed=Math.min(Math.max(1, Math.floor(timeDiff/(1000*60*60*24))+1), g.currentHypothesis.totalDays);
    const achievedDays = Object.keys(g.currentHypothesis.achievements).length;
    const achievementRate = daysPassed>0 ? Math.round((achievedDays/daysPassed)*100) : 0;
    const intensity=g.currentHypothesis.intensity||{}; let weightedAchieved=0;
    for (let i=0;i<g.currentHypothesis.totalDays;i++){ const d=new Date(startDate); d.setDate(startDate.getDate()+i); const key=d.toISOString().split('T')[0]; const isAchieved=!!(g.currentHypothesis.achievements||{})[key]; if (!isAchieved) continue; const mult=Number(intensity[key] ?? 1.0); weightedAchieved+=mult; }
    const displayRate=Math.min(100, Math.floor((weightedAchieved/g.currentHypothesis.totalDays)*100));
    const rateEl=document.getElementById('achievement-rate'); if (rateEl) rateEl.textContent=displayRate+'%';
    const pf=document.getElementById('progress-fill'); if (pf) pf.style.width=Math.min(100, Math.floor(achievementRate))+'%';
    const ad=document.getElementById('achieved-days'); if (ad) ad.textContent=`達成: ${achievedDays}日`;
    const rd=document.getElementById('remaining-days'); if (rd) rd.textContent=`残り: ${g.currentHypothesis.totalDays - daysPassed}日`;
    const progressFill=document.getElementById('progress-fill'); if (progressFill){ progressFill.style.background = achievementRate>=80?'var(--gradient-1)':(achievementRate>=50?'var(--gradient-2)':'var(--gradient-3)'); }
    g.triggerSurpriseIfNeeded && g.triggerSurpriseIfNeeded(g.currentHypothesis, daysPassed);
    const data=g.loadData(); const activeEffectsDisplay=document.getElementById('active-effects-display'); const activeEffectsList=document.getElementById('active-effects-list'); if (activeEffectsList) activeEffectsList.innerHTML=''; let hasActiveEffects=false;
    if (data.cards && data.cards.activeEffects){ const achievementBooster=data.cards.activeEffects.find(e=>e.cardId==='achievement_booster' && (!e.targetHypothesisId || e.targetHypothesisId===g.currentHypothesis.id)); if (achievementBooster){ hasActiveEffects=true; const el=document.createElement('div'); el.style.cssText='background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 4px 12px; border-radius: 16px; font-size: 12px; border: 1px solid #10b981;'; el.textContent='🚀 達成ブースター (+15%)'; activeEffectsList.appendChild(el);} }
    if (data.cards && data.cards.activeEffects){ const surprise=data.cards.activeEffects.find(e=>e.cardId==='surprise_boost' && (!e.targetHypothesisId || e.targetHypothesisId===g.currentHypothesis.id)); if (surprise){ hasActiveEffects=true; const el=document.createElement('div'); el.style.cssText='background: rgba(59, 130, 246, 0.2); color: #3b82f6; padding: 4px 12px; border-radius: 16px; font-size: 12px; border: 1px solid #3b82f6;'; el.textContent='🎁 サプライズブースト（次の結果でレア率UP）'; activeEffectsList.appendChild(el);} }
    if (g.currentHypothesis.hardMode){ hasActiveEffects=true; const el=document.createElement('div'); el.style.cssText='background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 4px 12px; border-radius: 16px; font-size: 12px; border: 1px solid #ef4444;'; el.textContent='💀 ハードモード'; activeEffectsList.appendChild(el); }
    if (g.currentHypothesis.shortTermOnly){ hasActiveEffects=true; const el=document.createElement('div'); el.style.cssText='background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 4px 12px; border-radius: 16px; font-size: 12px; border: 1px solid #ef4444;'; el.textContent='⏱️ 短期間縛り'; activeEffectsList.appendChild(el); }
    if (g.currentHypothesis.achievementDecrease){ hasActiveEffects=true; const el=document.createElement('div'); el.style.cssText='background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 4px 12px; border-radius: 16px; font-size: 12px; border: 1px solid #ef4444;'; el.textContent=`📉 達成率減少 (-${g.currentHypothesis.achievementDecrease}%)`; activeEffectsList.appendChild(el); }
    if (g.currentHypothesis.resetRisk){ hasActiveEffects=true; const el=document.createElement('div'); el.style.cssText='background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 4px 12px; border-radius: 16px; font-size: 12px; border: 1px solid #ef4444;'; el.textContent='🔄 リセットリスク'; activeEffectsList.appendChild(el); }
    if (activeEffectsDisplay) activeEffectsDisplay.style.display = hasActiveEffects ? 'block' : 'none';
    if (daysPassed >= g.currentHypothesis.totalDays && !g.currentHypothesis.completed){ document.getElementById('completion-report-section').style.display='block'; document.getElementById('completion-options').style.display='none'; } else { document.getElementById('completion-report-section').style.display='none'; document.getElementById('completion-options').style.display='none'; }
    const streak = g.computeStreak ? g.computeStreak(g.currentHypothesis) : 0; let streakEl=document.getElementById('streak-indicator'); if (!streakEl){ streakEl=document.createElement('div'); streakEl.id='streak-indicator'; streakEl.style.cssText='margin-top:8px;color:#f59e0b;font-weight:700;'; const stats=document.querySelector('#progress-view .stats'); const container=stats||document.getElementById('progress-view'); container.appendChild(streakEl);} streakEl.textContent=`🔥 ストリーク: ${streak}日`;
    g.renderAffirmationAndBenefit && g.renderAffirmationAndBenefit();
  };
})();

