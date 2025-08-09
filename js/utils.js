// Utils for HypoLab (safe prelude). If functions already exist, don't override.
(function(){
  try {
    if (typeof window === 'undefined') return;
    const STORAGE_KEY = 'hypolab_local_data';

    if (typeof window.escapeHTML !== 'function') {
      window.escapeHTML = function escapeHTML(str) {
        if (str == null) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      };
    }

    if (typeof window.loadData !== 'function') {
      window.loadData = function loadData() {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) {
          return {
            currentHypotheses: [],
            completedHypotheses: [],
            cards: { inventory: [], pendingPenalties: [] },
            meta: {}
          };
        }
        const parsed = JSON.parse(data);
        if (!parsed.cards) parsed.cards = { inventory: [], pendingPenalties: [] };
        if (!parsed.completedHypotheses) parsed.completedHypotheses = [];
        if (!parsed.currentHypotheses) parsed.currentHypotheses = [];
        if (!parsed.meta) parsed.meta = {};
        return parsed;
      };
    }

    if (typeof window.saveData !== 'function') {
      window.saveData = function saveData(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      };
    }
  } catch (_) {}
})();

