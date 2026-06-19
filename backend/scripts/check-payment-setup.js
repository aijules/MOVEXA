require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { supabase } = require('../src/config/supabase');
const { URUBUTO } = require('../src/config/env');

const required = {
  URUBUTO_API_KEY: URUBUTO.API_KEY,
  URUBUTO_MERCHANT_CODE: URUBUTO.MERCHANT_CODE,
  URUBUTO_SERVICE_CODE: URUBUTO.SERVICE_CODE,
};

async function check() {
  const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) {
    console.error(`Missing payment configuration: ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const { error } = await supabase.from('ticket_payments').select('id').limit(1);
  if (error) {
    console.error(`Payment database is not ready: ${error.message}`);
    console.error('Run scripts/create-ticket-payments-table.sql in the Supabase SQL editor.');
    process.exitCode = 1;
    return;
  }

  console.log('Payment setup is ready: UrubutoPay configuration and ticket_payments table found.');
}

check().catch((error) => {
  console.error(`Payment setup check failed: ${error.message}`);
  process.exitCode = 1;
});
