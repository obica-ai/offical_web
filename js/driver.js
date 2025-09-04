// driver.js
;(function () {
  const app = window.__app;
  if (!app || !app.requireRole) {
    console.error('common.js 未加载或 requireRole 未导出');
    return;
  }

  app.requireRole('driver', {
    onAllow: async () => {
      await Promise.all([loadPassengersList(), loadMyDriverSchedules()]);
      document.documentElement.classList.remove('guard');
    }
  });
})();


/* ----------------- 本页状态 ----------------- */
const listCache = { passengers: [] };
let editingDriverId = null;

/* ----------------- 渲染乘客需求 ----------------- */
function renderPassengersList(filterText = '') {
  const wrap = document.getElementById('passenger-list'); if (!wrap) return;
  const t = (filterText || '').toLowerCase();
  const rows = listCache.passengers.filter(r => {
    if (!t) return true;
    const s = [
      r.origin_city || r.from_city, r.origin_state, r.origin_postal_code,
      r.destination_city || r.to_city, r.destination_state, r.destination_postal_code
    ].filter(Boolean).join(' ').toLowerCase();
    return s.includes(t);
  });

  wrap.innerHTML = rows.map(r => {
    const o = fmtAddr({ city: r.origin_city || r.from_city || '-', state: r.origin_state || '-', postal: r.origin_postal_code || '', street1: r.origin_street1 || '', street2: r.origin_street2 || '' });
    const d = fmtAddr({ city: r.destination_city || r.to_city || '-', state: r.destination_state || '-', postal: r.destination_postal_code || '', street1: r.destination_street1 || '', street2: r.destination_street2 || '' });
    const dt = `${r.date} ${r.time?.slice(0, 5) || ''}`;

    return card(`
      <div>
        <div class="flex items-center gap-2 mb-1">
          ${badge('乘客')}
          ${badge('需 ' + (r.seats_needed ?? '-') + ' 座')}
          ${(window.__app?.statusBadge ? window.__app.statusBadge(r.status ?? 'open') : '')}
        </div>
        <div class="text-sm font-medium">出发：${o.line1}</div>
        <div class="text-xs text-gray-500">${o.line2 || ''}</div>
        <div class="text-sm mt-1">到达：${d.line1}</div>
        <div class="text-xs text-gray-500">${d.line2 || ''}</div>
        <div class="text-sm mt-1">时间：${dt}</div>

        <div class="flex gap-3 mt-2">
          <button class="text-sm text-blue-600 underline"
                  data-act="claim" data-id="${r.id}" data-seats="${r.seats_needed || 1}">
            接单
          </button>
          <button class="text-sm text-gray-500 underline"
                  data-act="view" data-id="${r.id}">
            详情
          </button>
        </div>
      </div>
    `);
  }).join('') || '<div class="text-sm text-gray-500">暂无记录</div>';
}

/* ----------------- 载入乘客需求（排除自己） ----------------- */
async function loadPassengersList() {
  const now = Date.now();
  const start = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const end = new Date(now + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: { user } } = await sb.auth.getUser();
  const uid = user?.id || null;

  let q = sb.from('passenger_requests').select('*')
    .gte('date', start).lte('date', end)
    .order('date', { ascending: true })
    .order('time', { ascending: true })
    .limit(50);
  if (uid) q = q.neq('user_id', uid);

  const { data, error } = await q;
  if (error) { toast('加载乘客需求失败：' + error.message, 'error'); return; }

  const profileMap = await fetchProfilesForUserIds((data || []).map(r => r.user_id));
  listCache.passengers = (data || []).map(r => ({ ...r, _profile: profileMap[r.user_id] || null }));
  renderPassengersList(document.getElementById('passenger-filter')?.value?.trim());
}

/* ----------------- 我的时间表 ----------------- */
async function loadMyDriverSchedules() {
  const wrap = document.getElementById('my-driver-schedules');
  const counter = document.getElementById('my-driver-count');
  if (!wrap || !counter) return;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) { wrap.innerHTML = '<div class="text-sm text-gray-500">登录后可查看你发布的时间表</div>'; counter.textContent = '—'; return; }

  const { data, error } = await sb.from('driver_schedules').select('*').eq('user_id', user.id)
    .order('date', { ascending: false })
    .order('time', { ascending: false })
    .limit(50);
  if (error) { wrap.innerHTML = `<div class="text-sm text-red-600">${error.message}</div>`; counter.textContent = '—'; return; }

  counter.textContent = `${(data || []).length} 条`;
  wrap.innerHTML = (data || []).map(r => {
    const o = fmtAddr({ city: r.origin_city || r.from_city || '-', state: r.origin_state || '-', postal: r.origin_postal_code || '', street1: r.origin_street1 || '', street2: r.origin_street2 || '' });
    const d = fmtAddr({ city: r.destination_city || r.to_city || '-', state: r.destination_state || '-', postal: r.destination_postal_code || '', street1: r.destination_street1 || '', street2: r.destination_street2 || '' });
    const dt = `${r.date} ${r.time?.slice(0, 5) || ''}`;
    const price = (r.price_per_person && Number(r.price_per_person) > 0) ? `${r.price_per_person}` : '—';
    return card(`
      <div>
        <div class="flex items-center gap-2 mb-1">
          ${badge('我的时间表')} ${badge('可载 ' + r.available_seats + ' 人')}
          ${(window.__app?.statusBadge ? window.__app.statusBadge(r.status ?? 'open') : '')}
        </div>
        <div class="text-sm font-medium">出发：${o.line1}</div>
        <div class="text-xs text-gray-500">${o.line2 || ''}</div>
        <div class="text-sm mt-1">到达：${d.line1}</div>
        <div class="text-xs text-gray-500">${d.line2 || ''}</div>
        <div class="text-sm mt-1">时间：${dt}</div>
        <div class="text-sm text-gray-600">价格/人：${price}</div>
        ${r.note ? `<div class="text-xs text-gray-500 mt-1">备注：${r.note}</div>` : ''}
        <div class="flex gap-2 mt-2">
          <button class="text-blue-600 text-sm underline" data-act="edit-driver" data-id="${r.id}">编辑</button>
          <button class="text-red-600 text-sm underline"  data-act="del-driver"  data-id="${r.id}">删除</button>
        </div>
      </div>
    `);
  }).join('') || '<div class="text-sm text-gray-500">暂无记录</div>';


}

/* ----------------- 新增/更新时间表 ----------------- */
async function addDriverSchedule() {
  const { data: sess } = await sb.auth.getSession();
  if (!sess?.session) { toast('请先登录', 'error'); return; }
  try { await saveOrCreateProfile(); } catch (e) { toast('保存个人资料失败：' + e.message, 'error'); return; }

  const o = readAddress('driver-origin'); if (!o.ok) { toast(o.msg, 'error'); return; }
  const d = readAddress('driver-dest');   if (!d.ok) { toast(d.msg, 'error'); return; }

  const date = document.getElementById('driver-date').value;
  const time = document.getElementById('driver-time').value;
  const seats = parseInt(document.getElementById('driver-seats').value, 10);
  const price = parseFloat(document.getElementById('driver-price').value) || 0;
  const note  = document.getElementById('driver-note').value.trim();
  const luggageCap = parseInt(document.getElementById('driver-luggage')?.value, 10) || 0;
  const status     = document.getElementById('driver-status')?.value || 'open';
  if (!date || !time || !seats || seats <= 0) { toast('日期/时间/座位必填', 'error'); return; }

  const payload = {
    date, time, available_seats: seats,
    price_per_person: isNaN(price) ? 0 : price,
    note,
    origin_country: o.data.country,
    origin_street1: o.data.street1,
    origin_street2: o.data.street2,
    origin_city:    o.data.city,
    origin_state:   o.data.state,
    origin_postal_code: o.data.postal,
    destination_country: d.data.country,
    destination_street1: d.data.street1,
    destination_street2: d.data.street2,
    destination_city:    d.data.city,
    destination_state:   d.data.state,
    destination_postal_code: d.data.postal,
    from_city: o.data.city, to_city: d.data.city,
    luggage_capacity: luggageCap,
    status
  };

  const btn = document.getElementById('add-driver-schedule');
  btn.disabled = true; btn.textContent = editingDriverId ? '保存中…' : '提交中…';
  try {
    if (editingDriverId) {
      const { error } = await sb.from('driver_schedules').update(payload).eq('id', editingDriverId);
      if (error) throw error;
      toast('已保存修改', 'success');
    } else {
      const { error } = await sb.from('driver_schedules').insert({ user_id: sess.session.user.id, ...payload });
      if (error) throw error;
      toast('时间表发布成功', 'success');
    }
    await Promise.all([loadMyDriverSchedules(), loadPassengersList()]);
    editingDriverId = null; setDriverSubmitLabel(false); resetDriverForm();
  } catch (e) {
    toast('提交失败：' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '发布时间表';
  }
}

/* ----------------- 表单辅助 ----------------- */
function setDriverSubmitLabel(editing) {
  const btn = document.getElementById('add-driver-schedule');
  const cancel = document.getElementById('cancel-driver-edit');
  if (editing) { btn.textContent = '保存修改'; cancel?.classList.remove('hidden'); }
  else { btn.textContent = '发布时间表'; cancel?.classList.add('hidden'); }
}
function resetDriverForm() {
  ['driver-origin-street1','driver-origin-street2','driver-origin-city','driver-origin-state','driver-origin-postal',
   'driver-dest-street1','driver-dest-street2','driver-dest-city','driver-dest-state','driver-dest-postal',
   'driver-date','driver-time','driver-seats','driver-price','driver-note'
  ].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('driver-origin-country').value = 'US';
  document.getElementById('driver-dest-country').value   = 'US';
}

/* ----------------- 编辑/删除/接单 事件委托 ----------------- */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const id = el.dataset.id, act = el.dataset.act;

  if (act === 'edit-driver') {
    const { data, error } = await sb.from('driver_schedules').select('*').eq('id', id).single();
    if (error) { toast('读取失败：' + error.message, 'error'); return; }

    document.getElementById('driver-origin-country').value = data.origin_country || 'US';
    document.getElementById('driver-origin-street1').value = data.origin_street1 || '';
    document.getElementById('driver-origin-street2').value = data.origin_street2 || '';
    document.getElementById('driver-origin-city').value   = data.origin_city || '';
    document.getElementById('driver-origin-state').value  = data.origin_state || '';
    document.getElementById('driver-origin-postal').value = data.origin_postal_code || '';

    document.getElementById('driver-dest-country').value  = data.destination_country || 'US';
    document.getElementById('driver-dest-street1').value  = data.destination_street1 || '';
    document.getElementById('driver-dest-street2').value  = data.destination_street2 || '';
    document.getElementById('driver-dest-city').value     = data.destination_city || '';
    document.getElementById('driver-dest-state').value    = data.destination_state || '';
    document.getElementById('driver-dest-postal').value   = data.destination_postal_code || '';

    document.getElementById('driver-date').value  = data.date || '';
    document.getElementById('driver-time').value  = data.time || '';
    document.getElementById('driver-seats').value = data.available_seats || '';
    document.getElementById('driver-price').value = data.price_per_person || '';
    document.getElementById('driver-note').value  = data.note || '';

    const lugEl = document.getElementById('driver-luggage'); if (lugEl) lugEl.value = (data.luggage_capacity ?? 0);
    const stEl  = document.getElementById('driver-status');  if (stEl)  stEl.value  = (data.status ?? 'open');

    editingDriverId = id; setDriverSubmitLabel(true);
    window.scrollTo({ top: document.getElementById('add-driver-schedule').offsetTop - 200, behavior: 'smooth' });
    return;
  }

  if (act === 'del-driver') {
    if (!confirm('确定删除这条时间表吗？')) return;
    const { error } = await sb.from('driver_schedules').delete().eq('id', id);
    if (error) { toast('删除失败：' + error.message, 'error'); return; }
    toast('已删除', 'success'); loadMyDriverSchedules();
    return;
  }

  if (act === 'view') {
    // 这里可以弹详情；先简单提示
    toast('可在此处打开需求详情面板（TODO）', 'info');
    return;
  }

  if (act === 'claim') {
  const reqId = id;

  try {
    // 需要已登录司机
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { toast('请先登录', 'error'); return; }

    // 读取乘客需求
    const { data: pr, error: prErr } = await sb
      .from('passenger_requests')
      .select('*')
      .eq('id', reqId)
      .single();

    if (prErr || !pr) { toast('该乘客需求不存在', 'error'); return; }

    // 尝试复用“同日期+时间+路线”的我的时间表
    let scheduleId = null;
    const { data: exist, error: exErr } = await sb
      .from('driver_schedules')
      .select('id')
      .eq('user_id', user.id)
      .eq('date', pr.date)
      .eq('time', pr.time)
      .eq('origin_city', pr.origin_city || pr.from_city)
      .eq('destination_city', pr.destination_city || pr.to_city)
      .maybeSingle(); // 可能不存在

    if (exErr) {
      // 查询报错不致命，继续走创建
      console.warn('check existing schedule error', exErr);
    }

    if (exist?.id) {
      scheduleId = exist.id;
    } else {
      // 自动创建一个时间表（座位默认按该乘客需求 seats_needed）
      const payloadSchedule = {
        user_id: user.id,
        date: pr.date,
        time: pr.time,
        available_seats: pr.seats_needed || 1,
        price_per_person: 0,
        note: '由接单自动创建',
        origin_country: pr.origin_country || 'US',
        origin_street1: pr.origin_street1 || '',
        origin_street2: pr.origin_street2 || '',
        origin_city:    pr.origin_city || pr.from_city || '',
        origin_state:   pr.origin_state || '',
        origin_postal_code: pr.origin_postal_code || '',
        destination_country: pr.destination_country || 'US',
        destination_street1: pr.destination_street1 || '',
        destination_street2: pr.destination_street2 || '',
        destination_city:    pr.destination_city || pr.to_city || '',
        destination_state:   pr.destination_state || '',
        destination_postal_code: pr.destination_postal_code || '',
        from_city: pr.origin_city || pr.from_city || '',
        to_city:   pr.destination_city || pr.to_city || '',
        status: 'matched'
      };

      const { data: ins, error: insErr } = await sb
        .from('driver_schedules')
        .insert(payloadSchedule)
        .select('id')
        .single();

      if (insErr) { toast('创建时间表失败：' + insErr.message, 'error'); return; }
      scheduleId = ins.id;
    }

    // 写入/更新匹配关系
    const seats = pr.seats_needed || 1;
    const { error: mErr } = await sb.from('matches').upsert({
      passenger_request_id: pr.id,
      driver_schedule_id: scheduleId,
      seats,
      status: 'accepted',
      created_by: user.id
    }, { onConflict: 'passenger_request_id,driver_schedule_id' });
    if (mErr) { toast('创建匹配失败：' + mErr.message, 'error'); return; }

    // 更新乘客需求状态为已接单
    await sb.from('passenger_requests').update({ status: 'matched' }).eq('id', pr.id);

    toast('已接单，并将该行程加入到你的时间表', 'success');
    await Promise.all([loadPassengersList(), loadMyDriverSchedules()]);
  } catch (err) {
    toast('接单失败：' + (err.message || '未知错误'), 'error');
  }
  return;
}

});

/* ----------------- 取消编辑 ----------------- */
document.getElementById('cancel-driver-edit')?.addEventListener('click', () => {
  editingDriverId = null; setDriverSubmitLabel(false); resetDriverForm();
});

/* ----------------- 页内按钮绑定 ----------------- */
document.getElementById('btnPassengersRefresh')?.addEventListener('click', loadPassengersList);
document.getElementById('passenger-filter')?.addEventListener('input', e => renderPassengersList(e.target.value.trim()));
document.getElementById('add-driver-schedule')?.addEventListener('click', addDriverSchedule);

/* ----------------- 登录变化钩子 ----------------- */
window.onAfterAuthChange = async (_session) => {
  await Promise.all([loadPassengersList(), loadMyDriverSchedules()]);

};

