require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const { supabase } = require('../src/config/supabase');

const DRIVER_NAMES = [
  'Jean Pierre Habimana','Emmanuel Niyonzima','Patrick Ntirenganya','Alice Uwimana',
  'Samuel Bizimungu','Grace Mukamana','Joseph Hakizimana','Marie Uwase',
  'Claude Nshimiyimana','Diane Iradukunda','Eric Mucyo','Florence Nyirahabimana',
  'Alexis Rugamba','Solange Mukandori','Vincent Ndayishimiye','Ange Uwamariya',
  'David Gasana','Rebecca Mukamusoni','Moses Ntagungira','Celine Uwingabire',
  'Frank Mugiraneza','Aline Uwamahoro','Pierre Kalisa','Odette Mukamurenzi',
  'Bernard Nsengimana','Jacqueline Mutesi','Robert Gatera','Sylvie Ingabire',
];

async function run() {
  console.log('=== Seeding drivers ===\n');

  // Clear existing drivers and their users
  await supabase.from('drivers').delete().gte('created_at', '2000-01-01');

  const { data: buses } = await supabase.from('buses').select('id').eq('status', 'active').limit(DRIVER_NAMES.length);
  const passwordHash = await bcrypt.hash('driver123', 10);

  const users   = [];
  const drivers = [];

  for (let i = 0; i < DRIVER_NAMES.length; i++) {
    const name  = DRIVER_NAMES[i];
    const email = `driver${i + 1}@movexa.rw`;
    const phone = `+25078${String(1000000 + i).slice(1)}`;

    users.push({
      full_name:     name,
      email,
      phone,
      role:          'driver',
      password_hash: passwordHash,
      is_active:     true,
    });
  }

  const { data: createdUsers, error: ue } = await supabase
    .from('users')
    .upsert(users, { onConflict: 'email' })
    .select('id,email');
  if (ue) { console.error('User insert error:', ue.message); process.exit(1); }

  for (let i = 0; i < createdUsers.length; i++) {
    const name  = DRIVER_NAMES[i];
    const bus   = buses?.[i];
    drivers.push({
      user_id:         createdUsers[i].id,
      full_name:       name,
      phone:           `+25078${String(1000000 + i).slice(1)}`,
      license_number:  `LIC${String(10000 + i)}`,
      assigned_bus_id: bus?.id || null,
      status:          'available',
    });
  }

  const { error: de } = await supabase.from('drivers').upsert(drivers, { onConflict: 'license_number' });
  if (de) { console.error('Driver insert error:', de.message); process.exit(1); }

  console.log(`✓ Seeded ${drivers.length} drivers`);
  console.log('  Login: driver1@movexa.rw / driver123');
}

run().catch(err => { console.error(err); process.exit(1); });
