
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

// Try creating an asset with minimal fields
const testAsset = {
  hostname: 'QA-TEST-HOSTNAME-' + Date.now(),
  serial_number: 'QA-SN-' + Date.now(),
  tipe_perangkat: 'Laptop',
  status: 'In Use',
  kondisi: 'Normal',
  spesifikasi: 'QA test asset',
  brand_merek: 'Lenovo',
  model: 'ThinkPad',
};

const create = await req('POST', '/api/assets', testAsset, token);
console.log(JSON.stringify({ status: create.status, body: create.body }, null, 2));
