
import http from 'http';
function req(method, path, body, token) {
  return new Promise((resolve) => {
    const opts = { hostname: '192.168.100.85', port: 5000, path, method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, timeout: 10000 };
    const r = http.request(opts, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: data }); } });
    });
    r.on('error', e => resolve({ error: e.message }));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}
const sa = await req('POST', '/api/auth/login', { email: 'superadmin@admin.com', password: 'admin123' });
const token = sa.body?.token;
// Try different passwords
for (const pw of ['user12345', 'admin123', 'User12345!', 'password', 'user123']) {
  const r = await req('POST', '/api/auth/login', { email: 'user@user.com', password: pw });
  console.log(`user@user.com + ${pw}: ${r.status}`);
}
// Get users list
const users = await req('GET', '/api/users?limit=20', null, token);
const list = users.body?.data || [];
console.log('Total users:', list.length);
list.forEach(u => console.log(`  id=${u.id} email=${u.email} role=${u.role} active=${u.is_active}`));
