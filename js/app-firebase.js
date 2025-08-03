// PDCA Lab - Firebase統合版
import { db, auth } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    getDocs, 
    updateDoc, 
    doc, 
    query, 
    where, 
    orderBy,
    serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// グローバル変数
let currentUser = null;
let plans = [];
let tasks = [];
let evaluations = [];
let improvements = [];
let activities = [];

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    setupAuthListener();
    setupEventListeners();
});

// 認証状態の監視
function setupAuthListener() {
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        updateAuthUI();
        
        if (user) {
            loadAllData();
        } else {
            clearAllData();
        }
    });
}

// 認証UIの更新
function updateAuthUI() {
    const authButton = document.getElementById('auth-button');
    const userEmail = document.getElementById('user-email');
    
    if (currentUser) {
        authButton.textContent = 'ログアウト';
        userEmail.textContent = currentUser.email;
        authButton.onclick = handleLogout;
    } else {
        authButton.textContent = 'ログイン';
        userEmail.textContent = '';
        authButton.onclick = handleLogin;
    }
}

// ログイン処理
async function handleLogin() {
    const email = prompt('メールアドレスを入力してください:');
    if (!email) return;
    
    const password = prompt('パスワードを入力してください:');
    if (!password) return;
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
        alert('ログインしました');
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            // 新規ユーザーの場合は登録
            if (confirm('新規登録しますか？')) {
                try {
                    await createUserWithEmailAndPassword(auth, email, password);
                    alert('登録完了しました');
                } catch (createError) {
                    alert('登録エラー: ' + createError.message);
                }
            }
        } else {
            alert('ログインエラー: ' + error.message);
        }
    }
}

// ログアウト処理
async function handleLogout() {
    if (confirm('ログアウトしますか？')) {
        try {
            await signOut(auth);
            alert('ログアウトしました');
        } catch (error) {
            alert('ログアウトエラー: ' + error.message);
        }
    }
}

// データのクリア
function clearAllData() {
    plans = [];
    tasks = [];
    evaluations = [];
    improvements = [];
    activities = [];
    updateDashboard();
}

// 全データの読み込み
async function loadAllData() {
    if (!currentUser) return;
    
    try {
        // Plans
        const plansQuery = query(
            collection(db, 'plans'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc')
        );
        const plansSnapshot = await getDocs(plansQuery);
        plans = plansSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Tasks
        const tasksQuery = query(
            collection(db, 'tasks'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc')
        );
        const tasksSnapshot = await getDocs(tasksQuery);
        tasks = tasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Evaluations
        const evaluationsQuery = query(
            collection(db, 'evaluations'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc')
        );
        const evaluationsSnapshot = await getDocs(evaluationsQuery);
        evaluations = evaluationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Improvements
        const improvementsQuery = query(
            collection(db, 'improvements'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc')
        );
        const improvementsSnapshot = await getDocs(improvementsQuery);
        improvements = improvementsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Activities
        const activitiesQuery = query(
            collection(db, 'activities'),
            where('userId', '==', currentUser.uid),
            orderBy('timestamp', 'desc')
        );
        const activitiesSnapshot = await getDocs(activitiesQuery);
        activities = activitiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        updateDashboard();
        renderPlans();
    } catch (error) {
        console.error('データ読み込みエラー:', error);
    }
}

// イベントリスナーの設定
function setupEventListeners() {
    // ナビゲーション
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const section = e.target.dataset.section;
            showSection(section);
        });
    });

    // フォーム
    document.getElementById('plan-form').addEventListener('submit', handlePlanSubmit);
    document.getElementById('task-form').addEventListener('submit', handleTaskSubmit);
    document.getElementById('check-form').addEventListener('submit', handleCheckSubmit);
    document.getElementById('act-form').addEventListener('submit', handleActSubmit);
}

// セクション表示切り替え
function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(sectionId).classList.add('active');
    document.querySelector(`[data-section="${sectionId}"]`).classList.add('active');
    
    switch(sectionId) {
        case 'dashboard':
            updateDashboard();
            break;
        case 'plan':
            renderPlans();
            break;
        case 'do':
            renderTasks();
            updatePlanSelects();
            break;
        case 'check':
            updatePlanSelects();
            renderEvaluations();
            break;
        case 'act':
            updatePlanSelects();
            renderImprovements();
            break;
    }
}

// Plan 計画の処理
async function handlePlanSubmit(e) {
    e.preventDefault();
    
    if (!currentUser) {
        alert('ログインしてください');
        return;
    }
    
    const planData = {
        userId: currentUser.uid,
        title: document.getElementById('goal-title').value,
        description: document.getElementById('goal-description').value,
        deadline: document.getElementById('goal-deadline').value,
        metrics: document.getElementById('goal-metrics').value,
        status: 'active',
        progress: 0,
        createdAt: serverTimestamp()
    };
    
    try {
        const docRef = await addDoc(collection(db, 'plans'), planData);
        planData.id = docRef.id;
        planData.createdAt = new Date();
        plans.unshift(planData);
        
        await addActivity(`新しい計画「${planData.title}」が作成されました`);
        
        e.target.reset();
        renderPlans();
        updateDashboard();
    } catch (error) {
        console.error('計画の保存エラー:', error);
        alert('計画の保存に失敗しました');
    }
}

// 計画の表示
function renderPlans() {
    const container = document.getElementById('plans-container');
    
    if (plans.length === 0) {
        container.innerHTML = '<p>まだ計画がありません</p>';
        return;
    }
    
    container.innerHTML = plans.map(plan => `
        <div class="plan-item">
            <h4>${plan.title}</h4>
            <p>${plan.description}</p>
            <div class="meta">
                <span>期限: ${formatDate(plan.deadline)}</span> | 
                <span class="status-badge status-${plan.status}">${getStatusText(plan.status)}</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${plan.progress}%"></div>
            </div>
            <p>進捗: ${plan.progress}%</p>
        </div>
    `).join('');
}

// Do 実行の処理
async function handleTaskSubmit(e) {
    e.preventDefault();
    
    if (!currentUser) {
        alert('ログインしてください');
        return;
    }
    
    const taskData = {
        userId: currentUser.uid,
        planId: document.getElementById('task-plan').value,
        description: document.getElementById('task-description').value,
        completed: false,
        createdAt: serverTimestamp()
    };
    
    try {
        const docRef = await addDoc(collection(db, 'tasks'), taskData);
        taskData.id = docRef.id;
        taskData.createdAt = new Date();
        tasks.unshift(taskData);
        
        const plan = plans.find(p => p.id === taskData.planId);
        await addActivity(`${plan.title}にタスクが追加されました`);
        
        e.target.reset();
        renderTasks();
    } catch (error) {
        console.error('タスクの保存エラー:', error);
        alert('タスクの保存に失敗しました');
    }
}

// タスクの表示
function renderTasks() {
    const container = document.getElementById('active-tasks');
    const activeTasks = tasks.filter(task => !task.completed);
    
    if (activeTasks.length === 0) {
        container.innerHTML = '<p>実行中のタスクはありません</p>';
        return;
    }
    
    container.innerHTML = activeTasks.map(task => {
        const plan = plans.find(p => p.id === task.planId);
        return `
            <div class="task-item">
                <h4>${task.description}</h4>
                <p>計画: ${plan ? plan.title : '不明'}</p>
                <button class="btn-secondary" onclick="window.completeTask('${task.id}')">完了</button>
            </div>
        `;
    }).join('');
}

// タスクの完了
window.completeTask = async function(taskId) {
    if (!currentUser) return;
    
    try {
        const taskIndex = tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
            await updateDoc(doc(db, 'tasks', taskId), {
                completed: true,
                completedAt: serverTimestamp()
            });
            
            tasks[taskIndex].completed = true;
            tasks[taskIndex].completedAt = new Date();
            
            const plan = plans.find(p => p.id === tasks[taskIndex].planId);
            await addActivity(`タスク「${tasks[taskIndex].description}」が完了しました`);
            
            renderTasks();
            updateDashboard();
        }
    } catch (error) {
        console.error('タスク完了エラー:', error);
        alert('タスクの完了に失敗しました');
    }
}

// Check 評価の処理
async function handleCheckSubmit(e) {
    e.preventDefault();
    
    if (!currentUser) {
        alert('ログインしてください');
        return;
    }
    
    const evaluationData = {
        userId: currentUser.uid,
        planId: document.getElementById('check-plan').value,
        progress: parseInt(document.getElementById('progress-percentage').value),
        notes: document.getElementById('evaluation-notes').value,
        createdAt: serverTimestamp()
    };
    
    try {
        const docRef = await addDoc(collection(db, 'evaluations'), evaluationData);
        evaluationData.id = docRef.id;
        evaluationData.createdAt = new Date();
        evaluations.unshift(evaluationData);
        
        // 計画の進捗を更新
        const planIndex = plans.findIndex(p => p.id === evaluationData.planId);
        if (planIndex !== -1) {
            await updateDoc(doc(db, 'plans', evaluationData.planId), {
                progress: evaluationData.progress
            });
            plans[planIndex].progress = evaluationData.progress;
            await addActivity(`${plans[planIndex].title}の進捗が${evaluationData.progress}%に更新されました`);
        }
        
        e.target.reset();
        renderEvaluations();
        updateDashboard();
    } catch (error) {
        console.error('評価の保存エラー:', error);
        alert('評価の保存に失敗しました');
    }
}

// 評価履歴の表示
function renderEvaluations() {
    const container = document.getElementById('evaluations-container');
    
    if (evaluations.length === 0) {
        container.innerHTML = '<p>まだ評価がありません</p>';
        return;
    }
    
    container.innerHTML = evaluations.map(evaluation => {
        const plan = plans.find(p => p.id === evaluation.planId);
        return `
            <div class="evaluation-item">
                <h4>${plan ? plan.title : '不明な計画'}</h4>
                <p>進捗: ${evaluation.progress}%</p>
                ${evaluation.notes ? `<p>メモ: ${evaluation.notes}</p>` : ''}
                <div class="meta">${formatDateTime(evaluation.createdAt)}</div>
            </div>
        `;
    }).join('');
}

// Act 改善の処理
async function handleActSubmit(e) {
    e.preventDefault();
    
    if (!currentUser) {
        alert('ログインしてください');
        return;
    }
    
    const improvementData = {
        userId: currentUser.uid,
        planId: document.getElementById('act-plan').value,
        action: document.getElementById('improvement-action').value,
        actionType: document.querySelector('input[name="action-type"]:checked').value,
        createdAt: serverTimestamp()
    };
    
    try {
        const docRef = await addDoc(collection(db, 'improvements'), improvementData);
        improvementData.id = docRef.id;
        improvementData.createdAt = new Date();
        improvements.unshift(improvementData);
        
        // 計画のステータスを更新
        const planIndex = plans.findIndex(p => p.id === improvementData.planId);
        if (planIndex !== -1) {
            if (improvementData.actionType === 'complete') {
                await updateDoc(doc(db, 'plans', improvementData.planId), {
                    status: 'completed'
                });
                plans[planIndex].status = 'completed';
                await addActivity(`${plans[planIndex].title}が完了しました`);
            } else {
                await addActivity(`${plans[planIndex].title}の改善アクションが記録されました`);
            }
        }
        
        e.target.reset();
        renderImprovements();
        updateDashboard();
    } catch (error) {
        console.error('改善の保存エラー:', error);
        alert('改善の保存に失敗しました');
    }
}

// 改善履歴の表示
function renderImprovements() {
    const container = document.getElementById('improvements-container');
    
    if (improvements.length === 0) {
        container.innerHTML = '<p>まだ改善アクションがありません</p>';
        return;
    }
    
    container.innerHTML = improvements.map(improvement => {
        const plan = plans.find(p => p.id === improvement.planId);
        return `
            <div class="improvement-item">
                <h4>${plan ? plan.title : '不明な計画'}</h4>
                <p>${improvement.action}</p>
                <p>アクション: ${getActionTypeText(improvement.actionType)}</p>
                <div class="meta">${formatDateTime(improvement.createdAt)}</div>
            </div>
        `;
    }).join('');
}

// ダッシュボードの更新
function updateDashboard() {
    const activePlans = plans.filter(p => p.status === 'active').length;
    const completedPlans = plans.filter(p => p.status === 'completed').length;
    
    document.getElementById('active-cycles').textContent = activePlans;
    document.getElementById('completed-cycles').textContent = completedPlans;
    
    const totalProgress = plans.length > 0 
        ? Math.round(plans.reduce((sum, plan) => sum + plan.progress, 0) / plans.length)
        : 0;
    document.getElementById('overall-progress').textContent = totalProgress + '%';
    
    renderActivities();
}

// 活動履歴の表示
function renderActivities() {
    const list = document.getElementById('activity-list');
    
    if (activities.length === 0) {
        list.innerHTML = '<li>まだ活動がありません</li>';
        return;
    }
    
    const recentActivities = activities.slice(0, 5);
    list.innerHTML = recentActivities.map(activity => 
        `<li>${activity.message} - ${formatDateTime(activity.timestamp)}</li>`
    ).join('');
}

// 活動の追加
async function addActivity(message) {
    if (!currentUser) return;
    
    const activityData = {
        userId: currentUser.uid,
        message: message,
        timestamp: serverTimestamp()
    };
    
    try {
        const docRef = await addDoc(collection(db, 'activities'), activityData);
        activityData.id = docRef.id;
        activityData.timestamp = new Date();
        activities.unshift(activityData);
        
        // 最新100件のみ保持
        if (activities.length > 100) {
            activities = activities.slice(0, 100);
        }
    } catch (error) {
        console.error('活動の保存エラー:', error);
    }
}

// 計画選択セレクトボックスの更新
function updatePlanSelects() {
    const selects = ['task-plan', 'check-plan', 'act-plan'];
    
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            const activePlans = plans.filter(p => p.status === 'active');
            select.innerHTML = '<option value="">計画を選択してください</option>' +
                activePlans.map(plan => 
                    `<option value="${plan.id}">${plan.title}</option>`
                ).join('');
        }
    });
}

// ユーティリティ関数
function formatDate(dateInput) {
    if (!dateInput) return '未設定';
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    return date.toLocaleDateString('ja-JP');
}

function formatDateTime(dateInput) {
    if (!dateInput) return '未設定';
    const date = dateInput instanceof Date ? dateInput : 
                 dateInput.toDate ? dateInput.toDate() : new Date(dateInput);
    return date.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getStatusText(status) {
    const statusMap = {
        active: '進行中',
        completed: '完了',
        pending: '保留'
    };
    return statusMap[status] || status;
}

function getActionTypeText(actionType) {
    const actionMap = {
        continue: '現在の計画を継続',
        modify: '計画を修正',
        complete: '計画を完了'
    };
    return actionMap[actionType] || actionType;
}