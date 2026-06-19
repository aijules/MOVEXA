require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { PORT } = require('./config/env');
const simulation = require('./services/simulation.service');
const { startPaymentPoller } = require('./services/paymentPoller.service');

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

simulation.setIO(io);

io.on('connection', (socket) => {
  socket.on('join:route', ({ routeId }) => socket.join(`route:${routeId}`));
  socket.on('join:stop',  ({ stopId })  => socket.join(`stop:${stopId}`));
  socket.on('disconnect', () => {});
});

async function start() {
  // Supabase — no DB connect needed (client handles it)
  simulation.startSimulation();
  startPaymentPoller();

  server.listen(PORT, () => {
    console.log(`\n✓ MOVEXA API running on port ${PORT}`);
    console.log(`  Health:   http://localhost:${PORT}/api/health`);
    console.log(`  Routes:   http://localhost:${PORT}/api/routes`);
    console.log(`  Vehicles: http://localhost:${PORT}/api/vehicles/live`);
    console.log(`  Journeys: http://localhost:${PORT}/api/journeys/search?from=Sonatubes&to=Kabuga`);
    console.log(`  Admin:    http://localhost:${PORT}/api/admin/dashboard\n`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
