/**
 * Adaptive Scheduling Engine
 * Evaluates delay and triggers actions per REQUIREMENTS.md
 */
const { supabase } = require('../config/supabase');

function getAction(delayMins) {
  if (delayMins <= 3)  return { type: 'none',            severity: 'normal',   message: 'On time' };
  if (delayMins <= 8)  return { type: 'notify_passengers', severity: 'warning', message: 'Minor delay — passengers notified' };
  if (delayMins <= 15) return { type: 'adjust_schedule',   severity: 'warning', message: 'Schedule adjusted due to delay' };
  return                      { type: 'suggest_backup',    severity: 'critical', message: 'Major disruption, backup recommended' };
}

async function triggerAdaptiveAction(routeId, tripId, delayMins) {
  const action = getAction(delayMins);
  if (action.type === 'none') return action;

  // Check if we already logged this trip's action recently (last 10 min)
  const cutoff = new Date(Date.now() - 10 * 60000).toISOString();
  const { data: existing } = await supabase
    .from('adaptive_actions')
    .select('id')
    .eq('trip_id', tripId)
    .eq('action_type', action.type)
    .gte('created_at', cutoff)
    .maybeSingle();

  if (!existing) {
    await supabase.from('adaptive_actions').insert({
      route_id:    routeId,
      trip_id:     tripId,
      action_type: action.type,
      reason:      `Delay: ${delayMins} min`,
      severity:    action.severity,
      status:      'pending',
    });
  }

  return action;
}

module.exports = { getAction, triggerAdaptiveAction };
