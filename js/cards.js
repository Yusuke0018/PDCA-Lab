// Cards master and rendering/exposure (extracted)
(function(){
  if (typeof window === 'undefined') return;

  // CARD_MASTER: export if not already defined
  if (typeof window.CARD_MASTER === 'undefined') {
    window.CARD_MASTER = {
      skip_ticket: { id:'skip_ticket', type:'reward', name:'スキップチケット', description:'使った日を達成済みにできる', icon:'⏭️', rarity:'common', color:'#3b82f6' },
      achievement_boost: { id:'achievement_boost', type:'reward', name:'達成ブースト', description:'任意の2日を達成済みにできる', icon:'🌟', rarity:'rare', color:'#10b981' },
      perfect_bonus: { id:'perfect_bonus', type:'reward', name:'パーフェクトボーナス', description:'次の仮説で100%達成時、報酬カード2枚獲得', icon:'🎯', rarity:'legendary', color:'#f59e0b' },
      protect_shield: { id:'protect_shield', type:'reward', name:'プロテクトシールド', description:'次の仮説でペナルティカードを無効化する', icon:'🛡️', rarity:'rare', color:'#10b981' },
      achievement_booster: { id:'achievement_booster', type:'reward', name:'達成率ブースター', description:'最終達成率に+15%のボーナス', icon:'📈', rarity:'common', color:'#3b82f6' },
      chaos_vortex: { id:'chaos_vortex', type:'penalty', name:'混乱の渦', description:'達成/未達成がランダムで3日分入れ替わる', icon:'🌀', rarity:'rare', color:'#dc2626' },
      second_chance: { id:'second_chance', type:'reward', name:'セカンドチャンス', description:'仮説終了後でも3日分追加で挑戦できる', icon:'🎯', rarity:'rare', color:'#10b981' },
      double_or_nothing: { id:'double_or_nothing', type:'penalty', name:'ダブルオアナッシング', description:'次の仮説で100%達成しないとペナルティカード2枚', icon:'⚠️', rarity:'rare', color:'#dc2626' }
    };
  }

  // createCardElement
  if (typeof window.createCardElement !== 'function') {
    window.createCardElement = function createCardElement(card, count) {
      const div = document.createElement('div');
      div.className = `card-item ${card.type}`;
      div.innerHTML = `
        <div class="card-icon">${card.icon}</div>
        <div class="card-name">${card.name}</div>
        <div class="card-description">${card.description}</div>
        ${count > 1 ? `<div class="card-count">×${count}</div>` : ''}
      `;
      return div;
    };
  }

  // updateCardDisplay
  if (typeof window.updateCardDisplay !== 'function') {
    window.updateCardDisplay = function updateCardDisplay() {
      const data = (typeof loadData === 'function') ? loadData() : { cards: { inventory: [], pendingPenalties: [] } };
      const inventoryContainer = document.getElementById('card-inventory');
      const penaltyContainer = document.getElementById('penalty-cards');
      if (!inventoryContainer || !penaltyContainer) return;

      const cardCounts = {};
      (data.cards.inventory||[]).forEach(card => {
        if (!card.used) {
          cardCounts[card.cardId] = (cardCounts[card.cardId] || 0) + 1;
        }
      });
      inventoryContainer.innerHTML = '';
      if (Object.keys(cardCounts).length === 0) {
        inventoryContainer.innerHTML = '<p style="color: var(--text-secondary);">所持カードはありません</p>';
      } else {
        Object.entries(cardCounts).forEach(([cardId, count]) => {
          const card = (window.CARD_MASTER||{})[cardId];
          if (card) {
            const cardElement = window.createCardElement(card, count);
            inventoryContainer.appendChild(cardElement);
          }
        });
      }

      penaltyContainer.innerHTML = '';
      if ((data.cards.pendingPenalties||[]).length === 0) {
        penaltyContainer.innerHTML = '<p style="color: var(--text-secondary);">ペナルティカードはありません</p>';
      } else {
        const penaltyCounts = {};
        (data.cards.pendingPenalties||[]).forEach(penalty => {
          penaltyCounts[penalty.cardId] = (penaltyCounts[penalty.cardId] || 0) + 1;
        });
        Object.entries(penaltyCounts).forEach(([cardId, count]) => {
          const card = (window.CARD_MASTER||{})[cardId];
          if (card) {
            const cardElement = window.createCardElement(card, count);
            penaltyContainer.appendChild(cardElement);
          }
        });
      }
    };
  }

  // showCardAcquisition / closeCardAcquisition
  if (typeof window.showCardAcquisition !== 'function') {
    window.showCardAcquisition = function showCardAcquisition(cardIds, callback) {
      const modal = document.getElementById('card-acquisition-modal');
      const container = document.getElementById('acquired-cards-container');
      if (!modal || !container) return;
      container.innerHTML = '';
      (cardIds||[]).forEach((cardId, index) => {
        const card = (window.CARD_MASTER||{})[cardId];
        if (card) {
          const cardDiv = document.createElement('div');
          cardDiv.className = `card-item ${card.type} card-reveal`;
          cardDiv.style.animationDelay = `${index * 0.3}s`;
          cardDiv.innerHTML = `
            <div class="card-icon">${card.icon}</div>
            <div class="card-name">${card.name}</div>
            <div class="card-description">${card.description}</div>
          `;
          container.appendChild(cardDiv);
        }
      });
      modal.style.display = 'flex';
      window.cardAcquisitionCallback = callback;
    };
  }
  if (typeof window.closeCardAcquisition !== 'function') {
    window.closeCardAcquisition = function closeCardAcquisition() {
      const modal = document.getElementById('card-acquisition-modal');
      if (modal) modal.style.display = 'none';
      if (window.cardAcquisitionCallback) {
        window.cardAcquisitionCallback();
        window.cardAcquisitionCallback = null;
      }
    };
  }
})();

