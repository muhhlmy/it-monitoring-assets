
import http from 'http';
function req(method, path, body, token) {
  return new Promise((resolve) => {
    const opts = { hostname: '192.168.100.85', port: 5000, path, method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, timeout: 10000 };
    const r = http.request(opts, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: data.slice(0,500) }); } });
    });
    r.on('error', e => resolve({ error: e.message }));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

const sa = await req('POST', '/api/auth/login', { email: 'superadmin@admin.com', password: 'admin123' });
const token = sa.body?.token;

// Update user id=3 (user@user.com) to set my_assets = read_only
const update = await req('PUT', '/api/users/3', {
  nama: 'User Karyawan',
  email: 'user@user.com',
  role: 'user',
  permissions: {
    dashboard: 'none',
    assets: 'none',
    assets_ga: 'none',
    assets_ops: 'none',
    my_assets: 'read_only',
    tickets: 'read_only',
    submissions: 'none',
    users: 'none',
    logs: 'none',
    karyawan: 'none',
    export: 'none'
  }
}, token);
console.log(JSON.stringify({ status: update.status, body: update.body }, null, 2));
