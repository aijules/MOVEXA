const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const staticFiles = ['index.html', 'app.js', 'style.css'];

fs.rmSync(dist, { recursive: true, force: true });
for (const app of ['simulator', 'dashboard']) {
  const target = path.join(dist, app);
  fs.mkdirSync(target, { recursive: true });
  for (const file of staticFiles) {
    fs.copyFileSync(path.join(root, app, file), path.join(target, file));
  }
  fs.copyFileSync(path.join(root, app, 'server.js'), path.join(target, 'server.js'));
}

fs.cpSync(path.join(root, 'backend'), path.join(dist, 'backend'), {
  recursive: true,
  filter: source => !source.endsWith('.log') && !source.endsWith('.env'),
});
fs.copyFileSync(path.join(root, '.env.production.example'), path.join(dist, '.env.production.example'));
console.log(`USSD production bundle created at ${dist}`);
