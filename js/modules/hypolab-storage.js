// Storage helpers extracted from hypolab-local.js (behavior unchanged)
// Exposes STORAGE_KEY, loadData, saveData on window for backward compatibility.

const STORAGE_KEY = 'hypolab_local_data';

// データの読み込み
function loadData() {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
        return {
            currentHypotheses: [],
            completedHypotheses: [],
            cards: {
                inventory: [],
                pendingPenalties: []
            },
            challenges: {
                daily: null,
                weekly: null,
                completedToday: [],
                completedThisWeek: [],
                lastDailyReset: new Date().toDateString(),
                lastWeeklyReset: new Date().toISOString(),
                history: [],
                streak: 0,
                lastStreakDate: null,
                totalCompleted: 0,
                customChallenges: []
            },
            events: {
                activeBoosts: [],
                lastEventCheck: new Date().toISOString(),
                milestoneNotifications: {},
                eventHistory: [],
                boostEnabled: true
            },
            meta: {}
        };
    }
    const parsed = JSON.parse(data);
    // 旧バージョンのデータ対応
    if (!parsed.cards) {
        parsed.cards = {
            inventory: [],
            pendingPenalties: []
        };
    }
    if (!parsed.completedHypotheses) {
        parsed.completedHypotheses = [];
    }
    if (!parsed.currentHypotheses) {
        parsed.currentHypotheses = [];
    }
    if (!parsed.meta) {
        parsed.meta = {};
    }
    // ポイントシステムがない場合は初期化
    if (!parsed.pointSystem) {
        parsed.pointSystem = {
            currentPoints: 0,
            lifetimeEarned: 0,
            lifetimeSpent: 0,
            currentLevel: 1,
            levelProgress: 0,
            streakMultiplier: 1.0,
            dailyEffortUsed: 0,
            dailyEffortLastReset: new Date().toDateString(),
            customRewards: [],
            transactions: []
        };
    }
    // チャレンジシステムがない場合は初期化
    if (!parsed.challenges) {
        parsed.challenges = {
            daily: null,
            weekly: null,
            completedToday: [],
            completedThisWeek: [],
            lastDailyReset: new Date().toDateString(),
            lastWeeklyReset: new Date().toISOString(),
            history: [],
            streak: 0,
            lastStreakDate: null,
            totalCompleted: 0,
            customChallenges: []
        };
    }
    // チャレンジ履歴がない場合は初期化
    if (!parsed.challenges.history) parsed.challenges.history = [];
    if (parsed.challenges.streak === undefined) parsed.challenges.streak = 0;
    if (!parsed.challenges.lastStreakDate) parsed.challenges.lastStreakDate = null;
    if (parsed.challenges.totalCompleted === undefined) parsed.challenges.totalCompleted = 0;
    if (!parsed.challenges.customChallenges) parsed.challenges.customChallenges = [];
    // イベントシステムがない場合は初期化
    if (!parsed.events) {
        parsed.events = {
            activeBoosts: [],
            lastEventCheck: new Date().toISOString(),
            milestoneNotifications: {},
            eventHistory: [],
            boostEnabled: true
        };
    }
    
    // 旧カテゴリーを新カテゴリーにマッピング
    const categoryMapping = {
        'reading': 'hobby',    // 読書 → 趣味
        'wellness': 'health'   // 養生 → 健康
    };
    
    // 現在の習慣のカテゴリーを更新
    if (parsed.currentHypotheses) {
        parsed.currentHypotheses.forEach(h => {
            if (categoryMapping[h.category]) {
                h.category = categoryMapping[h.category];
            }
        });
    }
    
    // 完了済み習慣のカテゴリーも更新
    if (parsed.completedHypotheses) {
        parsed.completedHypotheses.forEach(h => {
            if (categoryMapping[h.category]) {
                h.category = categoryMapping[h.category];
            }
        });
    }
    
    // 日付が変わったら努力ポイントとデイリーチャレンジをリセット
    const today = new Date().toDateString();
    if (parsed.pointSystem && parsed.pointSystem.dailyEffortLastReset !== today) {
        parsed.pointSystem.dailyEffortUsed = 0;
        parsed.pointSystem.dailyEffortLastReset = today;
    }
    if (parsed.challenges && parsed.challenges.lastDailyReset !== today) {
        parsed.challenges.daily = null;
        parsed.challenges.completedToday = [];
        parsed.challenges.lastDailyReset = today;
    }
    // 週が変わったらウィークリーチャレンジをリセット
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    if (parsed.challenges && new Date(parsed.challenges.lastWeeklyReset) < weekStart) {
        parsed.challenges.weekly = null;
        parsed.challenges.completedThisWeek = [];
        parsed.challenges.lastWeeklyReset = weekStart.toISOString();
    }
    return parsed;
}

// データの保存
function saveData(data) {
    // 週末スペシャルの値を保存前に検証
    if (data.events && data.events.activeBoosts) {
        data.events.activeBoosts = data.events.activeBoosts.map(boost => {
            if (boost.eventId === 'weekend_special') {
                // 週末スペシャルは必ず1.2倍に修正
                boost.value = 1.2;
                boost.description = '週末はポイント1.2倍！';
            }
            return boost;
        });
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// expose
window.STORAGE_KEY = STORAGE_KEY;
window.loadData = loadData;
window.saveData = saveData;

