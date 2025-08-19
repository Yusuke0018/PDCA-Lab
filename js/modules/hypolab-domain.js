// Domain helpers (safe, no behavior change): define only if absent
(function(){
  if (!window.DayStatus) {
    window.DayStatus = Object.freeze({ done: 'done', missed: 'missed', none: 'none' });
  }
  if (!window.getWeekNumber) {
    window.getWeekNumber = function(date, startDate){
      const d = new Date(date); d.setHours(0,0,0,0);
      const s = new Date(startDate || date); s.setHours(0,0,0,0);
      const days = Math.floor((d - s) / (24*60*60*1000));
      return Math.floor(days / 7) + 1;
    };
  }
})();

