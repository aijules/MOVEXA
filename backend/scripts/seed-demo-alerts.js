require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { supabase } = require('../src/config/supabase');

async function run() {
  console.log('=== Seeding demo incidents/alerts ===\n');

  const { data: routes } = await supabase.from('routes').select('id,route_code').limit(5);
  const routeIds = (routes || []).map(r => r.id);

  await supabase.from('incidents').delete().gte('created_at', '2000-01-01');

  const now = new Date();
  const incidents = [
    {
      route_id:    routeIds[0] || null,
      type:        'delay',
      title:       'Route delay due to road works',
      description: 'Road maintenance near Nyabugogo causing 8-minute delays on affected routes.',
      severity:    'warning',
      status:      'open',
      is_active:   true,
      starts_at:   new Date(now.getTime() - 30 * 60000).toISOString(),
    },
    {
      route_id:    routeIds[1] || null,
      type:        'traffic',
      title:       'Heavy traffic — downtown junction',
      description: 'Peak hour congestion at Downtown–Kimironko junction. Minor delays expected.',
      severity:    'info',
      status:      'investigating',
      is_active:   true,
      starts_at:   new Date(now.getTime() - 15 * 60000).toISOString(),
    },
    {
      route_id:    routeIds[2] || null,
      type:        'breakdown',
      title:       'Bus breakdown — Route 201',
      description: 'Vehicle RAD 112 B has broken down near Remera. Replacement dispatched.',
      severity:    'critical',
      status:      'investigating',
      is_active:   true,
      starts_at:   new Date(now.getTime() - 10 * 60000).toISOString(),
    },
    {
      route_id:    null,
      type:        'info',
      title:       'Welcome to MOVEXA',
      description: 'Real-time public transport tracking for Kigali. Live buses now active.',
      severity:    'info',
      status:      'open',
      is_active:   true,
      starts_at:   now.toISOString(),
    },
  ];

  const { error } = await supabase.from('incidents').insert(incidents);
  if (error) { console.error('Error:', error.message); process.exit(1); }
  console.log(`✓ Created ${incidents.length} demo incidents`);

  // Demo adaptive actions
  await supabase.from('adaptive_actions').delete().gte('created_at', '2000-01-01');
  const actions = [
    { route_id: routeIds[0] || null, action_type: 'notify_passengers', reason: 'Minor delay detected (4 min)',      severity: 'warning', status: 'applied' },
    { route_id: routeIds[1] || null, action_type: 'adjust_schedule',   reason: 'Major delay — next departure pushed', severity: 'warning', status: 'pending' },
    { route_id: routeIds[2] || null, action_type: 'suggest_backup',    reason: 'Critical delay — backup needed',    severity: 'critical', status: 'pending' },
  ];
  await supabase.from('adaptive_actions').insert(actions);
  console.log(`✓ Created ${actions.length} demo adaptive actions`);
}

run().catch(err => { console.error(err); process.exit(1); });
