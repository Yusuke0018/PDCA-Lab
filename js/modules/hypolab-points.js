// Points system extracted from hypolab-local.js (behavior unchanged)
// Exposes functions on window for backward compatibility.

const LEVEL_THRESHOLDS = [
  { level: 1, name: "駆け出し冒険者", min: 0, max: 10 },
  { level: 2, name: "若葉の探索者", min: 11, max: 25 },
  { level: 3, name: "見習いの旅人", min: 26, max: 45 },
  { level: 4, name: "初心の斥候", min: 46, max: 70 },
  { level: 5, name: "野営の番人", min: 71, max: 100 },
  { level: 6, name: "小契約の請負人", min: 101, max: 135 },
  { level: 7, name: "小鬼狩りの手", min: 136, max: 175 },
  { level: 8, name: "村落の護り手", min: 176, max: 220 },
  { level: 9, name: "依頼所の常連見習い", min: 221, max: 270 },
  { level: 10, name: "初級冒険者", min: 271, max: 325 },
  { level: 11, name: "初級探索者", min: 326, max: 385 },
  { level: 12, name: "新鋭の踏破者", min: 386, max: 450 },
  { level: 13, name: "罠外しの巧者", min: 451, max: 520 },
  { level: 14, name: "洞窟の探り手", min: 521, max: 595 },
  { level: 15, name: "荒野の護衛人", min: 596, max: 675 },
  { level: 16, name: "迅速の伝令", min: 676, max: 760 },
  { level: 17, name: "任務取りまとめ役", min: 761, max: 850 },
  { level: 18, name: "小隊の補佐", min: 851, max: 945 },
  { level: 19, name: "常設任務の担い手", min: 946, max: 1045 },
  { level: 20, name: "中級冒険者", min: 1046, max: 1150 },
  { level: 21, name: "現場慣れの請負人", min: 1151, max: 1260 },
  { level: 22, name: "路地裏の目利き", min: 1261, max: 1375 },
  { level: 23, name: "調査の名手", min: 1376, max: 1495 },
  { level: 24, name: "地図描きの達者", min: 1496, max: 1620 },
  { level: 25, name: "魔跡の観測者", min: 1621, max: 1750 },
  { level: 26, name: "獣群の分断者", min: 1751, max: 1885 },
  { level: 27, name: "交渉の仲立ち", min: 1886, max: 2025 },
  { level: 28, name: "小隊長", min: 2026, max: 2170 },
  { level: 29, name: "救難の先導者", min: 2171, max: 2320 },
  { level: 30, name: "上級冒険者", min: 2321, max: 2475 },
  { level: 31, name: "熟練の斥候長", min: 2476, max: 2635 },
  { level: 32, name: "前線の指揮手", min: 2636, max: 2800 },
  { level: 33, name: "盾壁の構築者", min: 2801, max: 2970 },
  { level: 34, name: "討伐隊の屋台骨", min: 2971, max: 3145 },
  { level: 35, name: "連盟認定の俊英", min: 3146, max: 3325 },
  { level: 36, name: "隠匿の看破者", min: 3326, max: 3510 },
  { level: 37, name: "異常事態の収束者", min: 3511, max: 3700 },
  { level: 38, name: "魔境の案内役", min: 3701, max: 3895 },
  { level: 39, name: "危地脱出の達人", min: 3896, max: 4095 },
  { level: 40, name: "英雄候補", min: 4096, max: 4300 },
  { level: 41, name: "熟練冒険者", min: 4301, max: 4510 },
  { level: 42, name: "名望ある請負頭", min: 4511, max: 4725 },
  { level: 43, name: "秘境の踏破者", min: 4726, max: 4945 },
  { level: 44, name: "古文の解読者", min: 4946, max: 5170 },
  { level: 45, name: "神秘の識者", min: 5171, max: 5400 },
  { level: 46, name: "巨獣の討ち手", min: 5401, max: 5635 },
  { level: 47, name: "都市の守護者", min: 5636, max: 5875 },
  { level: 48, name: "緊急招集の要", min: 5876, max: 6120 },
  { level: 49, name: "名品の使い手", min: 6121, max: 6370 },
  { level: 50, name: "達人冒険者", min: 6371, max: 6625 },
  { level: 51, name: "百戦錬磨", min: 6626, max: 6885 },
  { level: 52, name: "戦術の指南役", min: 6886, max: 7150 },
  { level: 53, name: "号令の指揮官", min: 7151, max: 7420 },
  { level: 54, name: "災厄封じの印持ち", min: 7421, max: 7695 },
  { level: 55, name: "辺境の楯", min: 7696, max: 7975 },
  { level: 56, name: "強敵粉砕の覇腕", min: 7976, max: 8260 },
  { level: 57, name: "巨塔の攻略者", min: 8261, max: 8550 },
  { level: 58, name: "深層の開拓者", min: 8551, max: 8845 },
  { level: 59, name: "風聞に名高い者", min: 8846, max: 9145 },
  { level: 60, name: "宗師冒険者", min: 9146, max: 9450 },
  { level: 61, name: "勇名の旗手", min: 9451, max: 9510 },
  { level: 62, name: "人々の英雄", min: 9511, max: 9570 },
  { level: 63, name: "魔境の征服者", min: 9571, max: 9630 },
  { level: 64, name: "天賦の策士", min: 9631, max: 9690 },
  { level: 65, name: "運命の切り拓き手", min: 9691, max: 9750 },
  { level: 66, name: "星の導き手", min: 9751, max: 9810 },
  { level: 67, name: "大陸の守護者", min: 9811, max: 9870 },
  { level: 68, name: "古竜の討伐者", min: 9871, max: 9930 },
  { level: 69, name: "王都の柱石", min: 9931, max: 9990 },
  { level: 70, name: "覇者", min: 9991, max: 10000 },
  { level: 71, name: "伝説の担い手", min: 10001, max: 10010 },
  { level: 72, name: "古き誓約の継承者", min: 10011, max: 10020 },
  { level: 73, name: "世界の均衡者", min: 10021, max: 10030 },
  { level: 74, name: "深淵の覗き手", min: 10031, max: 10040 },
  { level: 75, name: "真理の探究者", min: 10041, max: 10050 },
  { level: 76, name: "神器の選定者", min: 10051, max: 10060 },
  { level: 77, name: "灯火の継ぎ手", min: 10061, max: 10070 },
  { level: 78, name: "大陸史の転回者", min: 10071, max: 10080 },
  { level: 79, name: "神話の門番", min: 10081, max: 10090 },
  { level: 80, name: "伝説の勇者", min: 10091, max: 10100 },
  { level: 81, name: "天命の奏者", min: 10101, max: 10110 },
  { level: 82, name: "神域の旅人", min: 10111, max: 10120 },
  { level: 83, name: "星界の探索者", min: 10121, max: 10130 },
  { level: 84, name: "時の越境者", min: 10131, max: 10140 },
  { level: 85, name: "宿命の解放者", min: 10141, max: 10150 },
  { level: 86, name: "次元の航行者", min: 10151, max: 10160 },
  { level: 87, name: "永劫の観測者", min: 10161, max: 10170 },
  { level: 88, name: "因果の調律者", min: 10171, max: 10180 },
  { level: 89, name: "創世の記録者", min: 10181, max: 10190 },
  { level: 90, name: "神話的存在", min: 10191, max: 10200 },
  { level: 91, name: "世界樹の守り手", min: 10201, max: 10210 },
  { level: 92, name: "星海の統べる者", min: 10211, max: 10220 },
  { level: 93, name: "天地を統べる者", min: 10221, max: 10230 },
  { level: 94, name: "宇宙意志の代行者", min: 10231, max: 10240 },
  { level: 95, name: "創造の火の継承者", min: 10241, max: 10250 },
  { level: 96, name: "終末の回避者", min: 10251, max: 10260 },
  { level: 97, name: "歴史を書き換える者", min: 10261, max: 10270 },
  { level: 98, name: "世界線の導師", min: 10271, max: 10280 },
  { level: 99, name: "絶対者", min: 10281, max: 10290 },
  { level: 100, name: "超越者", min: 10291, max: Infinity },
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
    const baseMin = 10291;
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
