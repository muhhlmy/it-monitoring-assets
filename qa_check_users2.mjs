
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
// Try different endpoints/params
const r1 = await req('GET', '/api/users', null, token);
console.log('users no params:', JSON.stringify({ status: r1.status, keys: Object.keys(r1.body||{}), total: r1.body?.total, data_len: r1.body?.data?.length }));
const r2 = await req('GET', '/api/users?page=1&pageSize=50', null, token);
console.log('users page/pageSize:', JSON.stringify({ status: r2.status, total: r2.body?.total, data_len: r2.body?.data?.length }));
const r3 = await req('GET', '/api/users?includeInactive=true', null, token);
console.log('users includeInactive:', JSON.stringify({ status: r3.status, total: r3.body?.total, data_len: r3.body?.data?.length }));
// Raw body snippet
console.log('raw body snippet:', JSON.stringify(r1.body).slice(0,400));
