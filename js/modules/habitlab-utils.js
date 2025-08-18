// Common utility functions extracted from hypolab-local.js (non-breaking)
// Expose on window for global access.

function escapeHTML(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function dateKeyLocal(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getTargetDaysForHypothesis(hypothesis) {
    if (!hypothesis) return 0;
    const startDate = new Date(hypothesis.startDate);
    const today = new Date();
    startDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const timeDiff = today.getTime() - startDate.getTime();
    const rawDaysPassed = Math.max(1, Math.floor(timeDiff / (1000 * 60 * 60 * 24)) + 1);
    const daysPassed = hypothesis.isUnlimited ? rawDaysPassed : Math.min(rawDaysPassed, hypothesis.totalDays);
    let targetDays = daysPassed;
    const frequency = hypothesis.frequency;
    if (frequency) {
        if (frequency.type === 'weekly') {
            const weeks = Math.ceil(daysPassed / 7);
            targetDays = Math.min(weeks * frequency.count, daysPassed);
        } else if (frequency.type === 'weekdays') {
            targetDays = 0;
            for (let i = 0; i < daysPassed; i++) {
                const checkDate = new Date(startDate);
                checkDate.setDate(startDate.getDate() + i);
                if (frequency.weekdays.includes(checkDate.getDay())) {
                    targetDays++;
                }
            }
        }
    }
    return targetDays;
}

function getActivityDateKey(date = new Date()) {
    const now = new Date(date);
    const hour = now.getHours();
    if (hour < 2) {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return dateKeyLocal(yesterday);
    }
    return dateKeyLocal(now);
}

// expose
window.escapeHTML = escapeHTML;
window.dateKeyLocal = dateKeyLocal;
window.getTargetDaysForHypothesis = getTargetDaysForHypothesis;
window.getActivityDateKey = getActivityDateKey;

