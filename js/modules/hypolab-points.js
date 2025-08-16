// Points system extracted from hypolab-local.js (behavior unchanged)
// Exposes functions on window for backward compatibility.

const LEVEL_THRESHOLDS = [
    { level: 1, name: '初心者', min: 0, max: 150 },
    { level: 2, name: '見習い', min: 151, max: 450 },
    { level: 3, name: '習慣家', min: 451, max: 900 },
    { level: 4, name: '実践者', min: 901, max: 1500 },
    { level: 5, name: '達人', min: 1501, max: 2250 },
    { level: 6, name: 'マスター', min: 2251, max: 3300 },
    { level: 7, name: 'グランドマスター', min: 3301, max: 4500 },
    { level: 8, name: 'レジェンド', min: 4501, max: 6000 },
    { level: 9, name: '神', min: 6001, max: 7800 },
    { level: 10, name: '超越者', min: 7801, max: Infinity }
];

function calculateLevel(lifetimeEarned) {
    for (const threshold of LEVEL_THRESHOLDS) {
        if (lifetimeEarned <= threshold.max) {
            return threshold;
        }
    }
    const extraPoints = lifetimeEarned - 7801;
    const extraLevels = Math.floor(extraPoints / 1400);
    return {
        level: 10 + extraLevels,
        name: '超越者',
        min: 7801 + (extraLevels * 1400),
        max: 7801 + ((extraLevels + 1) * 1400)
    };
}

function calculatePointsWithBoosts(basePoints, source, category = null) {
    const data = loadData();
    let finalPoints = basePoints;
    let multiplier = 1.0;
    let bonus = 0;

    const isChallenge = (source === 'daily_challenge' || source === 'weekly_challenge' || source === 'challenge');
    if (isChallenge) {
        return basePoints;
    }
    if (data.cards && data.cards.activeEffects) {
        const now = new Date();
        const pointGem = data.cards.activeEffects.find(effect => 
            effect.type === 'point_multiplier' && 
            new Date(effect.startDate) <= now && 
            new Date(effect.endDate) >= now
        );
        if (pointGem) { multiplier *= pointGem.multiplier; }

        const rainbowBoost = data.cards.activeEffects.find(effect => 
            effect.type === 'all_category_boost' && 
            new Date(effect.startDate) <= now && 
            new Date(effect.endDate) >= now
        );
        if (rainbowBoost && category) { multiplier *= rainbowBoost.multiplier; }

        const slowdown = data.cards.activeEffects.find(effect => 
            effect.type === 'slowdown' && 
            new Date(effect.startDate) <= now && 
            new Date(effect.endDate) >= now
        );
        if (slowdown) { multiplier *= 0.5; }

        const reverseCurse = data.cards.activeEffects.find(effect => 
            effect.type === 'reverse_curse' && 
            new Date(effect.startDate) <= now && 
            new Date(effect.endDate) >= now
        );
        if (reverseCurse && source === 'habit') { return 0; }
        
        // パワーブースト: 習慣達成時のみ+5pt
        const powerBoost = data.cards.activeEffects.find(effect => 
            effect.type === 'power_boost' && 
            new Date(effect.startDate) <= now && 
            new Date(effect.endDate) >= now
        );
        if (powerBoost && source === 'habit') { bonus += 5; }
    }

    if (!(typeof EVENTS_DISABLED !== 'undefined' && EVENTS_DISABLED) && data.events && data.events.activeBoosts) {
        const currentHour = new Date().getHours();
        data.events.activeBoosts.forEach(boost => {
            if (boost.effect === 'points_multiplier') {
                multiplier *= boost.value;
            } else if (boost.effect === 'achievement_bonus' && source === 'habit') {
                if (!data.events.dailyAchievementCount) data.events.dailyAchievementCount = 0;
                if (data.events.dailyAchievementCount < 3) {
                    bonus += boost.value;
                    data.events.dailyAchievementCount++;
                    saveData(data);
                }
            } else if (boost.effect === 'flat_bonus') {
                bonus += boost.value;
            } else if (boost.effect === 'time_bonus') {
                if (boost.hours && boost.hours.includes(currentHour)) {
                    multiplier *= boost.multiplier;
                }
            } else if (boost.effect === 'lucky_time') {
                if (boost.hours && boost.hours.includes(currentHour)) {
                    bonus += boost.bonus;
                }
            } else if (boost.effect === 'category_boost' && category === boost.category) {
                multiplier *= boost.multiplier;
            } else if (boost.effect === 'random_points' && source === 'habit') {
                const dice = Math.floor(Math.random() * (boost.max - boost.min + 1)) + boost.min;
                bonus += dice;
            } else if (boost.effect === 'coin_flip' && source === 'habit') {
                const win = Math.random() < 0.5;
                multiplier *= win ? boost.win : boost.lose;
            } else if (boost.effect === 'chain' && source === 'habit') {
                if (!data.events.chainCount) data.events.chainCount = 0;
                if (data.events.chainCount < boost.maxBonus) {
                    data.events.chainCount++;
                    bonus += data.events.chainCount;
                    saveData(data);
                } else {
                    bonus += boost.maxBonus;
                }
            } else if (boost.effect === 'momentum' && source === 'habit') {
                if (!data.events.momentumIndex) data.events.momentumIndex = 0;
                const index = Math.min(data.events.momentumIndex, boost.multipliers.length - 1);
                multiplier *= boost.multipliers[index];
                data.events.momentumIndex++;
                saveData(data);
            }

            const effect = boost.effect;
            if (typeof effect === 'object') {
                switch (effect.type) {
                    case 'global_multiplier':
                        multiplier *= effect.value;
                        break;
                    case 'category_multiplier':
                        if (category === effect.target) { multiplier *= effect.value; }
                        break;
                }
            }
        });
    }
    finalPoints = Math.round(basePoints * multiplier + bonus);
    return finalPoints;
}

function calculatePointsWithBoostsDetailed(basePoints, source, category = null) {
    const data = loadData();
    let multiplier = 1.0;
    let bonus = 0;
    const notes = [];
    const now = new Date();

    const isChallenge = (source === 'daily_challenge' || source === 'weekly_challenge' || source === 'challenge');
    if (isChallenge) {
        return { finalPoints: basePoints, multiplierTotal: 1.0, bonusTotal: 0, notes };
    }
    if (data.cards && data.cards.activeEffects) {
        const pointGem = data.cards.activeEffects.find(e => e.type === 'point_multiplier' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
        if (pointGem) { multiplier *= pointGem.multiplier; notes.push(`PointGem ×${pointGem.multiplier}`); }
        const rainbow = data.cards.activeEffects.find(e => e.type === 'all_category_boost' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
        if (rainbow && category) { multiplier *= rainbow.multiplier; notes.push(`RainbowBoost ×${rainbow.multiplier}`); }
        const comboChain = data.cards.activeEffects.find(e => e.type === 'combo_multiplier' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
        if (comboChain && source === 'combo') { multiplier *= (comboChain.value || 2.0); notes.push(`Combo ×${comboChain.value || 2.0}`); }
        const catFest = data.cards.activeEffects.find(e => e.type === 'category_theme_boost' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
        if (catFest && category && catFest.target === category) { multiplier *= (catFest.multiplier || 1.5); notes.push(`Festival(${category}) ×${catFest.multiplier || 1.5}`); }
        const hh = data.cards.activeEffects.find(e => e.type === 'time_window_bonus' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
        if (hh) { bonus += (hh.value || 10); notes.push(`HappyHour +${hh.value || 10}`); }
        const todayKey = dateKeyLocal(new Date());
        const spark = data.cards.activeEffects.find(e => e.type === 'streak_spark' && e.dayKey === todayKey && (e.count || 0) < (e.bonuses ? e.bonuses.length : 0));
        if (spark && source === 'habit') {
            const idx = spark.count || 0;
            const add = (spark.bonuses && spark.bonuses[idx]) ? spark.bonuses[idx] : 0;
            if (add > 0) { bonus += add; notes.push(`Sparkle +${add}`); }
            spark.count = idx + 1;
            saveData(data);
        }
        const slow = data.cards.activeEffects.find(e => e.type === 'slowdown' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
        if (slow) { multiplier *= 0.5; notes.push('Slowdown ×0.5'); }
        const reverse = data.cards.activeEffects.find(e => e.type === 'reverse_curse' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
        if (reverse && source === 'habit') { return { finalPoints: 0, multiplierTotal: 0, bonusTotal: 0, notes: ['ReverseCurse'] }; }
        // パワーブースト: 習慣達成時のみ+5pt
        const powerBoost = data.cards.activeEffects.find(e => e.type === 'power_boost' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
        if (powerBoost && source === 'habit') { bonus += 5; notes.push('PowerBoost +5'); }
    }

    if (!(typeof EVENTS_DISABLED !== 'undefined' && EVENTS_DISABLED) && data.events && data.events.activeBoosts) {
        data.events.activeBoosts.forEach(boost => {
            const eff = boost.effect;
            switch (eff.type) {
                case 'global_multiplier': multiplier *= eff.value; notes.push(`Global ×${eff.value}`); break;
                case 'category_multiplier': if (category === eff.target) { multiplier *= eff.value; notes.push(`${eff.target} ×${eff.value}`); } break;
                case 'category_bonus': if (category === eff.target) { bonus += eff.value; notes.push(`${eff.target} +${eff.value}`); } break;
                case 'challenge_multiplier': if (source === 'challenge') { multiplier *= eff.value; notes.push(`Challenge ×${eff.value}`); } break;
                case 'time_bonus':
                    const hour = new Date().getHours();
                    if ((boost.duration === 'morning' && hour >= 6 && hour <= 9) || (boost.duration === 'night' && hour >= 20 && hour <= 23)) {
                        bonus += eff.value; notes.push(`Time +${eff.value}`);
                    }
                    break;
            }
        });
    }

    const finalPoints = Math.round(basePoints * multiplier + bonus);
    return { finalPoints, multiplierTotal: multiplier, bonusTotal: bonus, notes };
}

function earnPoints(amount, source, description, multiplier = 1.0, category = null, habitId = null, meta = {}) {
    const data = loadData();
    const boost = calculatePointsWithBoostsDetailed(amount, source, category);
    const finalAmount = Math.round((boost.finalPoints) * multiplier);

    const beforePoints = data.pointSystem.currentPoints;
    data.pointSystem.currentPoints += finalAmount;
    data.pointSystem.lifetimeEarned += finalAmount;
    data.pointSystem.levelProgress = data.pointSystem.lifetimeEarned;

    const newLevel = calculateLevel(data.pointSystem.lifetimeEarned);
    const oldLevel = data.pointSystem.currentLevel;
    data.pointSystem.currentLevel = newLevel.level;

    const transaction = {
        timestamp: new Date().toISOString(),
        type: 'earn',
        amount: amount,
        source: source,
        description: description,
        multiplier: multiplier,
        finalAmount: finalAmount
    };
    if (habitId) { transaction.habitId = habitId; }
    if (boost && boost.notes && boost.notes.length > 0) { transaction.appliedEffects = boost.notes; }
    if (meta && typeof meta === 'object') { transaction.meta = meta; }
    data.pointSystem.transactions.unshift(transaction);
    if (data.pointSystem.transactions.length > 100) { data.pointSystem.transactions = data.pointSystem.transactions.slice(0, 100); }
    saveData(data);

    if (newLevel.level > oldLevel && typeof showLevelUpNotification === 'function') {
        showLevelUpNotification(oldLevel, newLevel);
    }
    if (typeof showPointAnimation === 'function') {
        showPointAnimation(finalAmount);
    }
    if ((boost.multiplierTotal && boost.multiplierTotal !== 1) || (boost.bonusTotal && boost.bonusTotal !== 0)) {
        const title = '💎 ポイントブースト！';
        const effects = boost.notes && boost.notes.length ? boost.notes.join(' / ') : '効果適用';
        if (typeof showCardEffect === 'function') {
            showCardEffect(title, `+${finalAmount}pt (${effects})`, '#06b6d4');
        }
    }
    if (typeof updatePointDisplay === 'function') {
        updatePointDisplay();
    }
    return finalAmount;
}

function spendPoints(amount, rewardName) {
    const data = loadData();
    if (data.pointSystem.currentPoints < amount) { return false; }
    data.pointSystem.currentPoints -= amount;
    data.pointSystem.lifetimeSpent += amount;
    data.pointSystem.transactions.unshift({ timestamp: new Date().toISOString(), type: 'spend', amount, source: 'reward', description: rewardName });
    if (data.pointSystem.transactions.length > 100) { data.pointSystem.transactions = data.pointSystem.transactions.slice(0, 100); }
    saveData(data);
    if (typeof updatePointDisplay === 'function') { updatePointDisplay(); }
    return true;
}

function addEffortBonus(points, reason = '') {
    if (points < 1 || points > 3) { return false; }
    const data = loadData();
    data.pointSystem.dailyEffortUsed = (data.pointSystem.dailyEffortUsed || 0) + 1;
    saveData(data);
    const final = earnPoints(points, 'effort_bonus', reason || `努力ボーナス (${points}pt)`);
    if (typeof updatePointsView === 'function') { updatePointsView(); }
    if (typeof updateStatistics === 'function') { updateStatistics(); }
    return final >= 0;
}

// expose
window.LEVEL_THRESHOLDS = LEVEL_THRESHOLDS;
window.calculateLevel = calculateLevel;
window.calculatePointsWithBoosts = calculatePointsWithBoosts;
window.calculatePointsWithBoostsDetailed = calculatePointsWithBoostsDetailed;
window.earnPoints = earnPoints;
window.spendPoints = spendPoints;
window.addEffortBonus = addEffortBonus;

