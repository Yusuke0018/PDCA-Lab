// Visual effects and reward/penalty selection logic
(function(){
  if (typeof window === 'undefined') return;
  const g = window;

  // カードエフェクト表示
  g.showCardEffect = function showCardEffect(title, message, color){
    const effectDiv=document.createElement('div');
    effectDiv.style.cssText=`position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:${color};color:white;padding:24px 48px;border-radius:20px;font-size:20px;font-weight:700;z-index:3000;animation:cardEffectAnimation 3s ease-out;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.3);`;
    effectDiv.innerHTML = `<h3 style="margin:0 0 12px 0;font-size:24px;">${title}</h3><p style="margin:0;font-size:16px;font-weight:400;">${message}</p>`;
    document.body.appendChild(effectDiv);
    setTimeout(()=>effectDiv.remove(), 3000);
  };

  // 達成率に基づきカードを抽選
  g.getCardsBasedOnAchievement = function getCardsBasedOnAchievement(achievementRate, hypothesis){
    const cards=[]; const data=g.loadData? g.loadData():{cards:{activeEffects:[],pendingPenalties:[]}};
    if (hypothesis && hypothesis.hardMode && achievementRate < 90) { return cards; }
    let hasPerfectBonus=false; if (data.cards && data.cards.activeEffects){ hasPerfectBonus = data.cards.activeEffects.some(e=> e.cardId==='perfect_bonus' && !e.targetHypothesisId ); }
    let hasSurpriseBoost=false; if (data.cards && data.cards.activeEffects){ hasSurpriseBoost = data.cards.activeEffects.some(e=> e.cardId==='surprise_boost' && (!e.targetHypothesisId || e.targetHypothesisId===hypothesis.id)); }
    if (achievementRate===100){ const rand=Math.random(); if (hasSurpriseBoost){ if (rand<0.25){ cards.push('perfect_bonus'); } else if (rand<0.70){ cards.push('achievement_boost'); } else { cards.push('skip_ticket'); } } else { if (rand<0.15){ cards.push('perfect_bonus'); } else if (rand<0.50){ cards.push('achievement_boost'); } else { cards.push('skip_ticket'); } } if (hasPerfectBonus){ const rand2=Math.random(); if (rand2<0.1){ cards.push('perfect_bonus'); } else if (rand2<0.4){ cards.push('achievement_boost'); } else { cards.push('skip_ticket'); } data.cards.activeEffects = data.cards.activeEffects.filter(e=> e.cardId!=='perfect_bonus'); g.saveData && g.saveData(data); setTimeout(()=>{ g.showCardEffect && g.showCardEffect('パーフェクトボーナス発動！','追加で報酬カードを1枚獲得！','#f59e0b'); }, 1000); } }
    else if (achievementRate>=80){ const rand=Math.random(); if (hasSurpriseBoost){ if (rand<0.35){ cards.push('achievement_boost'); } else { cards.push('skip_ticket'); } } else { if (rand<0.2){ cards.push('achievement_boost'); } else { cards.push('skip_ticket'); } } }
    else if (achievementRate<60){ const rand=Math.random(); if (rand<0.4){ const commonPenalties=['extension_card','short_term','achievement_decrease']; cards.push(commonPenalties[Math.floor(Math.random()*commonPenalties.length)]);} else { const rarePenalties=['hard_mode','reset_risk']; cards.push(rarePenalties[Math.floor(Math.random()*rarePenalties.length)]);} }
    if (hasSurpriseBoost && data.cards && data.cards.activeEffects){ data.cards.activeEffects = data.cards.activeEffects.filter(e=> !(e.cardId==='surprise_boost' && (!e.targetHypothesisId || e.targetHypothesisId===hypothesis.id))); g.saveData && g.saveData(data); setTimeout(()=>{ g.showCardEffect && g.showCardEffect('🎁 サプライズブースト消費','今回の抽選でレア率が上がりました','#3b82f6'); }, 500); }
    return cards;
  };
})();

