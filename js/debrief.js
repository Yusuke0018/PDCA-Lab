// Completion flow: debrief modal, completion, and card rewards
(function(){
  if (typeof window === 'undefined') return;
  const g = window;

  g.showCompletionOptions = function showCompletionOptions(){
    const data=g.loadData(); const hypothesis=g.currentHypothesis; if (!hypothesis) return;
    if (!hypothesis.cardsAcquired){
      const achievedDays=Object.keys(hypothesis.achievements||{}).length; let finalRate=Math.round((achievedDays/(hypothesis.totalDays))*100);
      let hasAchievementBooster=false; if (data.cards && data.cards.activeEffects){ hasAchievementBooster = data.cards.activeEffects.some(e=> e.cardId==='achievement_booster' && (!e.targetHypothesisId || e.targetHypothesisId===hypothesis.id)); }
      if (hasAchievementBooster){ finalRate=Math.min(100, finalRate+15); g.showCardEffect && g.showCardEffect('達成ブースター発動！','最終達成率に+15%のボーナス！','#10b981'); data.cards.activeEffects = data.cards.activeEffects.filter(e=> !(e.cardId==='achievement_booster' && (!e.targetHypothesisId || e.targetHypothesisId===hypothesis.id))); }
      if (hypothesis.achievementDecrease){ finalRate=Math.max(0, finalRate - hypothesis.achievementDecrease); g.showCardEffect && g.showCardEffect('達成率減少発動！',`最終達成率から${hypothesis.achievementDecrease}%減少しました`,'#ef4444'); }
      hypothesis.finalAchievementRate=finalRate;
      const acquiredCards = g.getCardsBasedOnAchievement ? g.getCardsBasedOnAchievement(finalRate, hypothesis) : [];
      if (acquiredCards.length>0){ acquiredCards.forEach(cardId=>{ const card=(g.CARD_MASTER||{})[cardId]; if (card){ if (card.type==='reward'){ data.cards.inventory.push({cardId, acquiredDate:new Date().toISOString(), used:false}); } else if (card.type==='penalty'){ data.cards.pendingPenalties.push({cardId, acquiredDate:new Date().toISOString()}); } } }); hypothesis.cardsAcquired=true; g.currentHypothesis.cardsAcquired=true; const index=data.currentHypotheses.findIndex(h=>h.id===hypothesis.id); if (index!==-1){ data.currentHypotheses[index].cardsAcquired=true; data.currentHypotheses[index].finalAchievementRate=finalRate; } g.saveData(data); g.showCardAcquisition && g.showCardAcquisition(acquiredCards, ()=>{ g.requestDebriefThenShowOptions(); }); }
      else { hypothesis.cardsAcquired=true; g.currentHypothesis.cardsAcquired=true; const index=data.currentHypotheses.findIndex(h=>h.id===hypothesis.id); if (index!==-1){ data.currentHypotheses[index].cardsAcquired=true; data.currentHypotheses[index].finalAchievementRate=finalRate; } g.saveData(data); g.requestDebriefThenShowOptions(); }
    } else { g.requestDebriefThenShowOptions(); }
  };

  g.requestDebriefThenShowOptions = function requestDebriefThenShowOptions(){
    const showOptions=()=>{ const r=document.getElementById('completion-report-section'); const o=document.getElementById('completion-options'); if (r) r.style.display='none'; if (o) o.style.display='block'; };
    if (!g.currentHypothesis.debrief){ g.showDebriefModal(()=>showOptions()); } else { showOptions(); }
  };

  g.showDebriefModal = function showDebriefModal(onDone){
    const overlay=document.createElement('div'); overlay.className='overlay active';
    const modal=document.createElement('div'); modal.className='skip-modal active'; modal.innerHTML=`
      <div class="modal-header">
        <h3>📝 振り返り（30秒）</h3>
        <p>今回の検証を5段階で評価し、一言メモを残しましょう</p>
      </div>
      <div class="form-group" style="margin:12px 0;">
        <label>満足度（1-5）</label>
        <input id="debrief-score" type="number" min="1" max="5" value="4" style="width:80px;" />
      </div>
      <div class="form-group" style="margin:12px 0;">
        <label>一言メモ</label>
        <input id="debrief-note" type="text" placeholder="例: 朝イチがやりやすかった" />
      </div>
      <div class="modal-footer">
        <button class="button secondary" onclick="this.closest('.overlay').remove()">スキップ</button>
        <button id="debrief-save" class="button primary">保存して続行</button>
      </div>`;
    overlay.appendChild(modal); document.body.appendChild(overlay);
    document.getElementById('debrief-save').onclick=()=>{
      const score=Math.min(5, Math.max(1, parseInt(document.getElementById('debrief-score').value||'3',10)));
      const note=(document.getElementById('debrief-note').value||'').slice(0,140);
      const data=g.loadData(); const idx=data.currentHypotheses.findIndex(h=>h.id===g.currentHypothesis.id); const payload={score, note, at:new Date().toISOString()}; if (idx!==-1){ data.currentHypotheses[idx].debrief=payload; } if (!data.meta) data.meta={}; data.meta.lastDebrief=payload; g.saveData(data); overlay.remove(); onDone && onDone();
    };
  };

  g.completeHypothesis = function completeHypothesis(showHome=true){
    const data=g.loadData(); const index=data.currentHypotheses.findIndex(h=>h.id===g.currentHypothesis.id);
    if (index!==-1){
      const hypothesis=data.currentHypotheses[index]; hypothesis.completedDate=new Date().toISOString();
      if (!hypothesis.finalAchievementRate && hypothesis.finalAchievementRate!==0){ const achievedDays=Object.keys(hypothesis.achievements||{}).length; let finalRate=Math.round((achievedDays/hypothesis.totalDays)*100); if (hypothesis.achievementDecrease){ finalRate=Math.max(0, finalRate - hypothesis.achievementDecrease);} hypothesis.finalAchievementRate=finalRate; }
      let hasDoubleOrNothing=false; if (data.cards && data.cards.activeEffects){ hasDoubleOrNothing = data.cards.activeEffects.some(e=> e.cardId==='double_or_nothing'); }
      if (hasDoubleOrNothing && hypothesis.finalAchievementRate<100){ const penaltyCards=['extension_card','short_term','achievement_decrease','hard_mode','reset_risk']; for (let i=0;i<2;i++){ const randomCard=penaltyCards[Math.floor(Math.random()*penaltyCards.length)]; data.cards.pendingPenalties.push({cardId:randomCard, acquiredDate:new Date().toISOString()}); } data.cards.activeEffects = data.cards.activeEffects.filter(e=> e.cardId!=='double_or_nothing'); setTimeout(()=>{ g.showCardEffect && g.showCardEffect('ダブルオアナッシング発動！','100%未満のため、ペナルティカードを2枚獲得...','#ef4444'); }, 500); }
      data.completedHypotheses.push(hypothesis); data.currentHypotheses.splice(index, 1); g.saveData(data);
      if (showHome){ g.showNotification && g.showNotification('✅ 仮説の検証が完了しました！','success'); g.showHomeView && g.showHomeView(); }
    }
  };
})();

