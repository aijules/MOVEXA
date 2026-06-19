const dayjs = require('dayjs');

function minutesToHHMM(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function HHMMtoMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

function isPeakHour(hhmm) {
  const mins = HHMMtoMinutes(hhmm);
  return (mins >= 7 * 60 && mins <= 9 * 60) || (mins >= 17 * 60 && mins <= 19 * 60);
}

function getPeakDelayMinutes(hhmm) {
  if (!isPeakHour(hhmm)) return 0;
  const mins = HHMMtoMinutes(hhmm);
  if (mins >= 7 * 60 && mins <= 9 * 60) return Math.floor(Math.random() * 5) + 3;
  return Math.floor(Math.random() * 6) + 4;
}

function generateDepartureTimes(startHHMM = '05:00', endHHMM = '22:00', headwayMinutes = 20) {
  const times = [];
  let current = HHMMtoMinutes(startHHMM);
  const end = HHMMtoMinutes(endHHMM);
  while (current <= end) {
    times.push(minutesToHHMM(current));
    current += headwayMinutes;
  }
  return times;
}

function nowHHMM() {
  return dayjs().format('HH:mm');
}

function todayString() {
  return dayjs().format('YYYYMMDD');
}

module.exports = { minutesToHHMM, HHMMtoMinutes, isPeakHour, getPeakDelayMinutes, generateDepartureTimes, nowHHMM, todayString };
