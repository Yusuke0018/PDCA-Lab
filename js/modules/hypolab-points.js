// Points system extracted from hypolab-local.js (behavior unchanged)
// Exposes functions on window for backward compatibility.

const LEVEL_THRESHOLDS = [
    { level: 1, min: 0, max: 75 },
    { level: 2, min: 76, max: 225 },
    { level: 3, min: 226, max: 450 },
    { level: 4, min: 451, max: 750 },
    { level: 5, min: 751, max: 1125 },
    { level: 6, min: 1126, max: 1650 },
    { level: 7, min: 1651, max: 2250 },
    { level: 8, min: 2251, max: 3000 },
    { level: 9, min: 3001, max: 3900 }
];

function getLevelTitle(level) {
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n|0));
    const lv = clamp(level, 1, 10000);
    const stageTitles = [
        ['駆け出し冒険者', '見習い旅人', '草原を駆ける者'],
        ['熟練の戦士', '森を統べる者', '王国に名を刻む者'],
        ['英雄の継承者', '龍を討つ者', '世界を巡る賢者'],
        ['星を導く者', '天空の覇者', '永劫の守護者'],
        ['神話を紡ぐ者', '運命を超える者', '全てを極めし者']
    ];
    if (lv <= 25) {
        const stageIndex = Math.floor((lv - 1) / 5);
        const posInStage = ((lv - 1) % 5) + 1;
        const titleIndex = posInStage <= 2 ? 0 : (posInStage <= 4 ? 1 : 2);
        return stageTitles[stageIndex][titleIndex];
    }
    return '全てを極めし者';
}

function calculateLevel(lifetimeEarned) {
    for (const t of LEVEL_THRESHOLDS) {
        if (lifetimeEarned <= t.max) {
            return { level: t.level, name: getLevelTitle(t.level), min: t.min, max: t.max };
        }
    }
    const baseMin = 3901;
    const step = 700;
    const extraLevels = Math.floor((lifetimeEarned - baseMin) / step);
    let level = 10 + extraLevels;
    let min = baseMin + (extraLevels * step);
    let max = baseMin + ((extraLevels + 1) * step) - 1;
    if (level > 10000) {
        level = 10000;
        min = lifetimeEarned;
        max = lifetimeEarned;
    }
    return { level, name: getLevelTitle(level), min, max };
}

function calculatePointsWithBoosts(basePoints, source, category = null, habitId = null) {
    return Math.round(basePoints);
}

function calculatePointsWithBoostsDetailed(basePoints, source, category = null, habitId = null) {
    return { finalPoints: Math.round(basePoints), multiplierTotal: 1.0, bonusTotal: 0, notes: [] };
}

function earnPoints(amount, source, description, multiplier = 1.0, category = null, habitId = null, meta = {}) {
    const data = loadData();
    const finalAmount = Math.round((amount || 0) * (multiplier || 1.0));

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
    if (typeof updatePointDisplay === 'function') {
        updatePointDisplay();
    }
    return finalAmount;
}

function spendPoints(amount, rewardName) {
    // 報酬・支出機能は廃止
    return false;
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
