// Navigation and swipe handling
(function(){
  if (typeof window === 'undefined') return;
  const g = window;

  g.updateNavigation = function updateNavigation(activeView){
    document.querySelectorAll('.nav-btn').forEach(btn=>btn.classList.remove('active'));
    const activeBtn=document.querySelector(`[data-view="${activeView}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    const viewIndex = (g.views||[]).indexOf(activeView);
    if (viewIndex !== -1){
      document.querySelectorAll('.dot').forEach((dot, index)=>{
        if (index===viewIndex){ dot.style.background='var(--primary)'; dot.style.width='8px'; dot.style.height='8px'; }
        else { dot.style.background='var(--surface-light)'; dot.style.width='6px'; dot.style.height='6px'; }
      });
    }
  };

  g.showHomeView = function showHomeView(){
    const ids=['home','new','shuffle','progress','history','stats','cards'];
    ids.forEach(v=>{ const el=document.getElementById(`${v}-view`); if (!el) return; el.style.display = v==='home'?'block':'none'; });
    g.updateNavigation('home');
    g.updateCurrentHypothesisList && g.updateCurrentHypothesisList();
    g.updatePerfectBonusIndicator && g.updatePerfectBonusIndicator();
    g.updatePenaltyIndicators && g.updatePenaltyIndicators();
    const data = g.loadData ? g.loadData() : { meta:{} };
    const home=document.getElementById('home-view'); let banner=document.getElementById('last-debrief-banner');
    if (!banner){ banner=document.createElement('div'); banner.id='last-debrief-banner'; banner.style.cssText='margin:12px 0;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text-secondary);'; home.insertBefore(banner, home.firstChild); }
    if (data.meta && data.meta.lastDebrief){ const d=data.meta.lastDebrief; const dt=new Date(d.at).toLocaleDateString('ja-JP'); banner.innerHTML=`📝 前回の気づき（${dt} / 満足度${d.score}/5）: <span style="color:var(--text-primary)">${(d.note||'').replace(/</g,'&lt;')}</span>`; banner.style.display='block'; } else { banner.style.display='none'; }
  };

  g.showNewHypothesisView = function showNewHypothesisView(){
    const ids=['home','new','history','stats','cards'];
    ids.forEach(v=>{ const el=document.getElementById(`${v}-view`); if (!el) return; el.style.display = v==='new'?'block':'none'; });
    g.updateNavigation('new');
    document.getElementById('hypothesis-title').value='';
    document.getElementById('hypothesis-description').value='';
    const benefitEl=document.getElementById('hypothesis-benefit'); if (benefitEl) benefitEl.value='';
    const titleInput=document.getElementById('hypothesis-title'); if (titleInput){ setTimeout(()=>titleInput.focus(),0); }
    const list=document.getElementById('ifthen-list'); if (list){ list.innerHTML=''; g.addIfThenRow && g.addIfThenRow(); }
    g.selectedDuration=null;
    document.querySelectorAll('.duration-option').forEach(opt=>{ opt.classList.remove('selected','disabled'); opt.style.opacity='1'; opt.onclick=function(){ g.selectDuration && g.selectDuration(this.dataset.duration); }; });
    if (g.shortTermOnly){ ['medium','long'].forEach(duration=>{ const opt=document.querySelector(`[data-duration="${duration}"]`); if(opt){ opt.classList.add('disabled'); opt.style.opacity='0.5'; opt.onclick=null; } });
      g.showCardEffect && g.showCardEffect('短期集中ペナルティ適用中！','短期間（3-7日）のみ選択可能です','#ef4444'); }
  };

  // Swipe
  g.setupSwipeListeners = function setupSwipeListeners(){
    const container=document.querySelector('.container'); let isSwipeEnabled=true;
    document.querySelectorAll('input, textarea, button').forEach(el=>{
      el.addEventListener('touchstart', ()=>{ isSwipeEnabled=false; }, {passive:true});
      el.addEventListener('touchend', ()=>{ setTimeout(()=>{ isSwipeEnabled=true; }, 100); }, {passive:true});
    });
    container.addEventListener('touchstart', (e)=>{ if(!isSwipeEnabled) return; g.touchStartX=e.changedTouches[0].screenX; g.touchStartY=e.changedTouches[0].screenY; }, {passive:true});
    container.addEventListener('touchend', (e)=>{ if(!isSwipeEnabled) return; g.touchEndX=e.changedTouches[0].screenX; g.touchEndY=e.changedTouches[0].screenY; g.handleSwipe && g.handleSwipe(); }, {passive:true});
  };

  g.handleSwipe = function handleSwipe(){
    const diffX=g.touchStartX - g.touchEndX; const diffY=g.touchStartY - g.touchEndY; const minSwipeDistance=50;
    if (Math.abs(diffX)>Math.abs(diffY) && Math.abs(diffX)>minSwipeDistance){
      const currentView=g.getCurrentView ? g.getCurrentView() : 'home'; if (currentView==='shuffle' || currentView==='progress') return;
      if (diffX>0){ g.navigateToNextView && g.navigateToNextView(); } else { g.navigateToPreviousView && g.navigateToPreviousView(); }
    }
  };

  g.getCurrentView = function getCurrentView(){
    if (document.getElementById('home-view').style.display !== 'none') return 'home';
    if (document.getElementById('new-hypothesis-view').style.display !== 'none') return 'new';
    if (document.getElementById('shuffle-view').style.display !== 'none') return 'shuffle';
    if (document.getElementById('progress-view').style.display !== 'none') return 'progress';
    if (document.getElementById('history-view').style.display !== 'none') return 'history';
    if (document.getElementById('stats-view').style.display !== 'none') return 'stats';
    if (document.getElementById('cards-view').style.display !== 'none') return 'cards';
    return 'home';
  };

  g.navigateToNextView = function navigateToNextView(){ const current=g.getCurrentView(); const idx=(g.views||[]).indexOf(current); if (idx===-1) return; const next=(g.views||[])[(idx+1)%g.views.length]; g.showView && g.showView(next); };
  g.navigateToPreviousView = function navigateToPreviousView(){ const current=g.getCurrentView(); const idx=(g.views||[]).indexOf(current); if (idx===-1) return; const prevIdx=(idx-1+g.views.length)%g.views.length; const prev=(g.views||[])[prevIdx]; g.showView && g.showView(prev); };

  // helper to switch views by key
  g.showView = function showView(key){
    switch(key){
      case 'home': return g.showHomeView();
      case 'new': return g.showNewHypothesisView();
      case 'history': return g.showHistoryView && g.showHistoryView();
      case 'stats': return g.showStatsView && g.showStatsView();
      case 'cards': return g.showCardsView && g.showCardsView();
      default: return g.showHomeView();
    }
  };

  // compute streak
  g.computeStreak = function computeStreak(hyp){
    const achievements = hyp.achievements || {}; const keys = Object.keys(achievements).sort();
    let streak=0; const today=new Date(); today.setHours(0,0,0,0);
    for (let d=new Date(today); ; d.setDate(d.getDate()-1)){
      const k=d.toISOString().split('T')[0]; if (achievements[k]) streak+=1; else break;
    }
    return streak;
  };
})();

