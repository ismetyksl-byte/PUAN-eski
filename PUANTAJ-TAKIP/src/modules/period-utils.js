export function daysInPeriod(p){
  const [y,m] = p.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
export function weekday(p, day){ // 0=Sun..6=Sat
  const [y,m] = p.split('-').map(Number);
  return new Date(y, m-1, day).getDay();
}
export function validatePeriod(p){
  return typeof p === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
}

