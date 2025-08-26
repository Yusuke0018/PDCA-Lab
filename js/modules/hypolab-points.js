// Points system extracted from hypolab-local.js (behavior unchanged)
// Exposes functions on window for backward compatibility.

const LEVEL_THRESHOLDS = [
  { level: 1, name: "駆け出し冒険者", min: 0, max: 0 },
  { level: 2, name: "若葉の探索者", min: 1, max: 7 },
  { level: 3, name: "見習いの旅人", min: 8, max: 19 },
  { level: 4, name: "初心の斥偵", min: 20, max: 37 },
  { level: 5, name: "野営の番人", min: 38, max: 59 },
  { level: 6, name: "小契約の請負人", min: 60, max: 84 },
  { level: 7, name: "小鬼狩りの手", min: 85, max: 113 },
  { level: 8, name: "村落の護り手", min: 114, max: 144 },
  { level: 9, name: "依頼所の常連見習い", min: 145, max: 179 },
  { level: 10, name: "初級冒険者", min: 180, max: 216 },
  { level: 11, name: "初級探索者", min: 217, max: 255 },
  { level: 12, name: "新鋭の踏破者", min: 256, max: 297 },
  { level: 13, name: "罠外しの巧者", min: 298, max: 342 },
  { level: 14, name: "洞窟の探り手", min: 343, max: 388 },
  { level: 15, name: "荒野の護衛人", min: 389, max: 437 },
  { level: 16, name: "迅速の伝令", min: 438, max: 488 },
  { level: 17, name: "任務取りまとめ役", min: 489, max: 541 },
  { level: 18, name: "小隊の補佐", min: 542, max: 597 },
  { level: 19, name: "常設任務の担い手", min: 598, max: 654 },
  { level: 20, name: "中級冒険者", min: 655, max: 713 },
  { level: 21, name: "現場慣れの請負人", min: 714, max: 774 },
  { level: 22, name: "路地裏の目利き", min: 775, max: 837 },
  { level: 23, name: "調査の名手", min: 838, max: 901 },
  { level: 24, name: "地図描きの達者", min: 902, max: 968 },
  { level: 25, name: "魔跡の観測者", min: 969, max: 1036 },
  { level: 26, name: "獣群の分断者", min: 1037, max: 1106 },
  { level: 27, name: "交渉の仲立ち", min: 1107, max: 1177 },
  { level: 28, name: "小隊長", min: 1178, max: 1251 },
  { level: 29, name: "救難の先導者", min: 1252, max: 1326 },
  { level: 30, name: "上級冒険者", min: 1327, max: 1402 },
  { level: 31, name: "熟練の斥候長", min: 1403, max: 1480 },
  { level: 32, name: "前線の指揮手", min: 1481, max: 1560 },
  { level: 33, name: "盾壁の構築者", min: 1561, max: 1641 },
  { level: 34, name: "討伐隊の屋台骨", min: 1642, max: 1724 },
  { level: 35, name: "連盟認定の俊英", min: 1725, max: 1808 },
  { level: 36, name: "隠匿の看破者", min: 1809, max: 1894 },
  { level: 37, name: "異常事態の収束者", min: 1895, max: 1982 },
  { level: 38, name: "魔境の案内役", min: 1983, max: 2070 },
  { level: 39, name: "危地脱出の達人", min: 2071, max: 2161 },
  { level: 40, name: "英雄候補", min: 2162, max: 2252 },
  { level: 41, name: "熟練冒険者", min: 2253, max: 2346 },
  { level: 42, name: "名望ある請負頭", min: 2347, max: 2440 },
  { level: 43, name: "秘境の踏破者", min: 2441, max: 2536 },
  { level: 44, name: "古文の解読者", min: 2537, max: 2633 },
  { level: 45, name: "神秘の識者", min: 2634, max: 2732 },
  { level: 46, name: "巨獣の討ち手", min: 2733, max: 2832 },
  { level: 47, name: "都市の守護者", min: 2833, max: 2933 },
  { level: 48, name: "緊急招集の要", min: 2934, max: 3036 },
  { level: 49, name: "名品の使い手", min: 3037, max: 3140 },
  { level: 50, name: "達人冒険者", min: 3141, max: 3245 },
  { level: 51, name: "百戦錬磨", min: 3246, max: 3352 },
  { level: 52, name: "戦術の指南役", min: 3353, max: 3460 },
  { level: 53, name: "号令の指揮官", min: 3461, max: 3569 },
  { level: 54, name: "災厄封じの印持ち", min: 3570, max: 3679 },
  { level: 55, name: "辺境の楯", min: 3680, max: 3791 },
  { level: 56, name: "強敵粉砕の覇腕", min: 3792, max: 3904 },
  { level: 57, name: "巨塔の攻略者", min: 3905, max: 4018 },
  { level: 58, name: "深層の開拓者", min: 4019, max: 4134 },
  { level: 59, name: "風聞に名高い者", min: 4135, max: 4250 },
  { level: 60, name: "宗師冒険者", min: 4251, max: 4368 },
  { level: 61, name: "勇名の旗手", min: 4369, max: 4487 },
  { level: 62, name: "人々の英雄", min: 4488, max: 4608 },
  { level: 63, name: "魔境の征服者", min: 4609, max: 4729 },
  { level: 64, name: "天賦の策士", min: 4730, max: 4852 },
  { level: 65, name: "運命の切り拓き手", min: 4853, max: 4975 },
  { level: 66, name: "星の導き手", min: 4976, max: 5100 },
  { level: 67, name: "大陸の守護者", min: 5101, max: 5226 },
  { level: 68, name: "古竜の討伐者", min: 5227, max: 5354 },
  { level: 69, name: "王都の柱石", min: 5355, max: 5482 },
  { level: 70, name: "覇者", min: 5483, max: 5612 },
  { level: 71, name: "伝説の担い手", min: 5613, max: 5742 },
  { level: 72, name: "古き誓約の継承者", min: 5743, max: 5874 },
  { level: 73, name: "世界の均衡者", min: 5875, max: 6007 },
  { level: 74, name: "深淵の覗き手", min: 6008, max: 6141 },
  { level: 75, name: "真理の探究者", min: 6142, max: 6276 },
  { level: 76, name: "神器の選定者", min: 6277, max: 6413 },
  { level: 77, name: "灯火の継ぎ手", min: 6414, max: 6550 },
  { level: 78, name: "大陸史の転回者", min: 6551, max: 6688 },
  { level: 79, name: "神話の門番", min: 6689, max: 6828 },
  { level: 80, name: "伝説の勇者", min: 6829, max: 6969 },
  { level: 81, name: "天命の奏者", min: 6970, max: 7110 },
  { level: 82, name: "神域の旅人", min: 7111, max: 7253 },
  { level: 83, name: "星界の探索者", min: 7254, max: 7397 },
  { level: 84, name: "時の越境者", min: 7398, max: 7542 },
  { level: 85, name: "宿命の解放者", min: 7543, max: 7688 },
  { level: 86, name: "次元の航行者", min: 7689, max: 7834 },
  { level: 87, name: "永劫の観測者", min: 7835, max: 7982 },
  { level: 88, name: "因果の調律者", min: 7983, max: 8132 },
  { level: 89, name: "創世の記録者", min: 8133, max: 8282 },
  { level: 90, name: "神話的存在", min: 8283, max: 8433 },
  { level: 91, name: "世界樹の守り手", min: 8434, max: 8585 },
  { level: 92, name: "星海の統べる者", min: 8586, max: 8738 },
  { level: 93, name: "天地を統べる者", min: 8739, max: 8892 },
  { level: 94, name: "宇宙意志の代行者", min: 8893, max: 9047 },
  { level: 95, name: "創造の火の継承者", min: 9048, max: 9203 },
  { level: 96, name: "終末の回避者", min: 9204, max: 9360 },
  { level: 97, name: "歴史を書き換える者", min: 9361, max: 9519 },
  { level: 98, name: "世界線の導師", min: 9520, max: 9678 },
  { level: 99, name: "絶対者", min: 9679, max: 9838 },
  { level: 100, name: "超越者", min: 9839, max: 9999 },
];

function getLevelTitle(level) {
    // 100段階の称号を直接取得
    if (level >= 1 && level <= 100) {
        const threshold = LEVEL_THRESHOLDS[level - 1];
        return threshold ? threshold.name : '超越者';
    }
    return '超越者';
}

function calculateLevel(lifetimeEarned) {
    for (const t of LEVEL_THRESHOLDS) {
        if (lifetimeEarned <= t.max) {
            return { level: t.level, name: t.name, min: t.min, max: t.max };
        }
    }
    // レベル100以上の計算（通常到達しない）  
    const baseMin = 10000;
    const step = 100;
    const extraLevels = Math.floor((lifetimeEarned - baseMin) / step);
    let level = 100 + extraLevels;
    let min = baseMin + (extraLevels * step);
    let max = baseMin + ((extraLevels + 1) * step) - 1;
    if (level > 10000) {
        level = 10000;
        min = lifetimeEarned;
        max = lifetimeEarned;
    }
    return { level, name: '超越者', min, max };
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
