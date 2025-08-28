// Router facade (no behavior change): delegates to existing globals
(function(){
  if (!window.router) window.router = {};
  ['showHomeView','showStatusView','showStatsView','showHistoryView','showNewHypothesisView','showPointsView'].forEach(fn => {
    window.router[fn] = function(){ if (typeof window[fn] === 'function') return window[fn].apply(window, arguments); };
  });
})();
