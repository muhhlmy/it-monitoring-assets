
import http from 'http';

function req(method, path, body) {
  return new Promise((resolve) => {
    const opts = { hostname: '192.168.100.85', port: 5000, path, method,
      headers: { 'Content-Type': 'application/json' }, timeout: 10000 };
    const r = http.request(opts, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
    r.on('error', e => resolve({ error: e.message }));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

const users = [
  { key: 'superadmin', email: 'superadmin@admin.com', password: 'admin123' },
  { key: 'admin', email: 'admin@admin.com', password: 'admin123' },
  { key: 'user', email: 'user@user.com', password: 'user12345' },
];

const results = {};
for (const u of users) {
  const r = await req('POST', '/api/auth/login', { email: u.email, password: u.password });
  results[u.key] = { status: r.token ? 200 : 'FAIL', hasToken: !!r.token, user: r.user?.role };
}
console.log(JSON.stringify(results, null, 2));
