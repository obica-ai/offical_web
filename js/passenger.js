
const listCache={ drivers:[] };
let editingPassengerId=null;

/* 渲染可用司机 */
function renderDriversList(filterText=''){
  const wrap=document.getElementById('driver-list'); if(!wrap) return;
  const t=(filterText||'').toLowerCase();
  const rows=listCache.drivers.filter(r=>{
    if(!t) return true;
    const s=[r.origin_city||r.from_city,r.origin_state,r.origin_postal_code,r.destination_city||r.to_city,r.destination_state,r.destination_postal_code].filter(Boolean).join(' ').toLowerCase();
    return s.includes(t);
  });
  wrap.innerHTML = rows.map(r=>{
    const o=fmtAddr({city:r.origin_city||r.from_city||'-',state:r.origin_state||'-',postal:r.origin_postal_code||'',street1:r.origin_street1||'',street2:r.origin_street2||''});
    const d=fmtAddr({city:r.destination_city||r.to_city||'-',state:r.destination_state||'-',postal:r.destination_postal_code||'',street1:r.destination_street1||'',street2:r.destination_street2||''});
    const dt=`${r.date} ${r.time?.slice(0,5)||''}`;
    const price=(r.price_per_person && Number(r.price_per_person)>0)?`${r.price_per_person}`:'—';
    const prof=r._profile||{};
    return card(`<div>
      <div class="flex items-center gap-2 mb-1">${badge('司机')} ${badge('可载 '+r.available_seats+' 人')} ${badge(maskName(prof.full_name))} ${badge('性别 '+genderLabel(prof.gender))}</div>
      <div class="text-sm font-medium">出发：${o.line1}</div><div class="text-xs text-gray-500">${o.line2||''}</div>
      <div class="text-sm mt-1">到达：${d.line1}</div><div class="text-xs text-gray-500">${d.line2||''}</div>
      <div class="text-sm mt-1">时间：${dt}</div><div class="text-sm text-gray-600">价格/人：${price}</div>
    </div>`);
  }).join('') || '<div class="text-sm text-gray-500">暂无记录</div>';
}

/* 载入可用司机（排除自己） */
async function loadDriversList(){
  const now=Date.now();
  const start=new Date(now-30*24*60*60*1000).toISOString().slice(0,10);
  const end  =new Date(now+90*24*60*60*1000).toISOString().slice(0,10);
  const { data:{ user } } = await sb.auth.getUser();
  const uid=user?.id||null;

  let q=sb.from('driver_schedules').select('*').gte('date',start).lte('date',end)
    .order('date',{ascending:true}).order('time',{ascending:true}).limit(50);
  if(uid) q=q.neq('user_id',uid);

  const { data, error } = await q;
  if(error){ toast('加载司机时间表失败：'+error.message,'error'); return; }

  // 可选：司机资料（如果有公开视图可拉）
  const profileMap = await fetchProfilesForUserIds((data||[]).map(r=>r.user_id));
  listCache.drivers=(data||[]).map(r=>({...r,_profile:profileMap[r.user_id]||null}));
  renderDriversList(document.getElementById('driver-filter')?.value?.trim());
}

/* 我的需求 */
async function loadMyPassengerRequests(){
  const wrap=document.getElementById('my-passenger-requests');
  const counter=document.getElementById('my-passenger-count');
  if(!wrap||!counter) return;
  const { data:{ user } } = await sb.auth.getUser();
  if(!user){ wrap.innerHTML='<div class="text-sm text-gray-500">登录后可查看你发布的需求</div>'; counter.textContent='—'; return; }

  const { data, error } = await sb.from('passenger_requests').select('*').eq('user_id', user.id)
    .order('date',{ascending:false}).order('time',{ascending:false}).limit(50);
  if(error){ wrap.innerHTML=`<div class="text-sm text-red-600">${error.message}</div>`; counter.textContent='—'; return; }
  counter.textContent=`${(data||[]).length} 条`;
  wrap.innerHTML=(data||[]).map(r=>{
    const o=fmtAddr({city:r.origin_city||r.from_city||'-',state:r.origin_state||'-',postal:r.origin_postal_code||'',street1:r.origin_street1||'',street2:r.origin_street2||''});
    const d=fmtAddr({city:r.destination_city||r.to_city||'-',state:r.destination_state||'-',postal:r.destination_postal_code||'',street1:r.destination_street1||'',street2:r.destination_street2||''});
    const dt=`${r.date} ${r.time?.slice(0,5)||''}`;
    return card(`<div>
      <div class="flex items-center gap-2 mb-1">${badge('我的需求')} ${badge('需 '+r.seats_needed+' 座')}</div>
      <div class="text-sm font-medium">出发：${o.line1}</div><div class="text-xs text-gray-500">${o.line2||''}</div>
      <div class="text-sm mt-1">到达：${d.line1}</div><div class="text-xs text-gray-500">${d.line2||''}</div>
      <div class="text-sm mt-1">时间：${dt}</div>${r.note?`<div class="text-xs text-gray-500 mt-1">备注：${r.note}</div>`:''}
      <div class="flex gap-2 mt-2">
        <button class="text-blue-600 text-sm underline" data-act="edit-passenger" data-id="${r.id}">编辑</button>
        <button class="text-red-600 text-sm underline"  data-act="del-passenger"  data-id="${r.id}">删除</button>
      </div></div>`);
  }).join('') || '<div class="text-sm text-gray-500">暂无记录</div>';
}

/* 新增/更新需求（与原逻辑一致） */
async function addPassengerRequest(){
  const { data:sess } = await sb.auth.getSession();
  if(!sess?.session){ toast('请先登录','error'); return; }
  try{ await saveOrCreateProfile(); }catch(e){ toast('保存个人资料失败：'+e.message,'error'); return; }

  const o=readAddress('passenger-origin'); if(!o.ok){ toast(o.msg,'error'); return; }
  const d=readAddress('passenger-dest');   if(!d.ok){ toast(d.msg,'error'); return; }

  const date=document.getElementById('passenger-date').value;
  const time=document.getElementById('passenger-time').value;
  const seats=parseInt(document.getElementById('passenger-seats').value,10);
  const note=document.getElementById('passenger-note').value.trim();
  if(!date||!time||!seats||seats<=0){ toast('日期/时间/座位必填','error'); return; }

  const payload={
    date,time,seats_needed:seats,note,
    origin_country:o.data.country,origin_street1:o.data.street1,origin_street2:o.data.street2,origin_city:o.data.city,origin_state:o.data.state,origin_postal_code:o.data.postal,
    destination_country:d.data.country,destination_street1:d.data.street1,destination_street2:d.data.street2,destination_city:d.data.city,destination_state:d.data.state,destination_postal_code:d.data.postal,
    from_city:o.data.city,to_city:d.data.city
  };

  const btn=document.getElementById('add-passenger-request'); btn.disabled=true; btn.textContent=editingPassengerId?'保存中…':'提交中…';
  try{
    if(editingPassengerId){
      const { error } = await sb.from('passenger_requests').update(payload).eq('id', editingPassengerId);
      if(error) throw error; toast('已保存修改','success');
    }else{
      const { error } = await sb.from('passenger_requests').insert({ user_id:sess.session.user.id, ...payload });
      if(error) throw error; toast('需求发布成功','success');
    }
    await loadMyPassengerRequests();
    await loadDriversList();
    editingPassengerId=null; setPassengerSubmitLabel(false); resetPassengerForm();
  }catch(e){ toast('提交失败：'+e.message,'error'); }
  finally{ btn.disabled=false; btn.textContent='发布需求'; }
}

/* 表单辅助 */
function setPassengerSubmitLabel(editing){
  const btn=document.getElementById('add-passenger-request');
  const cancel=document.getElementById('cancel-passenger-edit');
  if(editing){ btn.textContent='保存修改'; cancel?.classList.remove('hidden'); }
  else{ btn.textContent='发布需求'; cancel?.classList.add('hidden'); }
}
function resetPassengerForm(){
  ['passenger-origin-street1','passenger-origin-street2','passenger-origin-city','passenger-origin-state','passenger-origin-postal',
   'passenger-dest-street1','passenger-dest-street2','passenger-dest-city','passenger-dest-state','passenger-dest-postal',
   'passenger-date','passenger-time','passenger-seats','passenger-note'
  ].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('passenger-origin-country').value='US';
  document.getElementById('passenger-dest-country').value='US';
}

/* 编辑/删除事件委托（与你现有一致） */
document.addEventListener('click', async (e)=>{
  const el=e.target.closest('[data-act]'); if(!el) return;
  const id=el.dataset.id, act=el.dataset.act;
  if(act==='edit-passenger'){
    const { data, error } = await sb.from('passenger_requests').select('*').eq('id', id).single();
    if(error){ toast('读取失败：'+error.message,'error'); return; }
    document.getElementById('passenger-origin-country').value=data.origin_country||'US';
    document.getElementById('passenger-origin-street1').value=data.origin_street1||'';
    document.getElementById('passenger-origin-street2').value=data.origin_street2||'';
    document.getElementById('passenger-origin-city').value=data.origin_city||'';
    document.getElementById('passenger-origin-state').value=data.origin_state||'';
    document.getElementById('passenger-origin-postal').value=data.origin_postal_code||'';
    document.getElementById('passenger-dest-country').value=data.destination_country||'US';
    document.getElementById('passenger-dest-street1').value=data.destination_street1||'';
    document.getElementById('passenger-dest-street2').value=data.destination_street2||'';
    document.getElementById('passenger-dest-city').value=data.destination_city||'';
    document.getElementById('passenger-dest-state').value=data.destination_state||'';
    document.getElementById('passenger-dest-postal').value=data.destination_postal_code||'';
    document.getElementById('passenger-date').value=data.date||'';
    document.getElementById('passenger-time').value=data.time||'';
    document.getElementById('passenger-seats').value=data.seats_needed||'';
    document.getElementById('passenger-note').value=data.note||'';
    editingPassengerId=id; setPassengerSubmitLabel(true);
    window.scrollTo({ top: document.getElementById('add-passenger-request').offsetTop-200, behavior:'smooth' });
  }
  if(act==='del-passenger'){
    if(!confirm('确定删除这条需求吗？')) return;
    const { error } = await sb.from('passenger_requests').delete().eq('id', id);
    if(error){ toast('删除失败：'+error.message,'error'); return; }
    toast('已删除','success'); loadMyPassengerRequests();
  }
});

/* 取消编辑 */
document.getElementById('cancel-passenger-edit')?.addEventListener('click', ()=>{
  editingPassengerId=null; setPassengerSubmitLabel(false); resetPassengerForm();
});

/* 事件绑定 */
document.getElementById('btnDriversRefresh')?.addEventListener('click', loadDriversList);
document.getElementById('driver-filter')?.addEventListener('input', e=> renderDriversList(e.target.value.trim()));
document.getElementById('add-passenger-request')?.addEventListener('click', addPassengerRequest);

/* 登录变化钩子：需是乘客角色才能完全使用；没设角色也允许看列表 */
window.onAfterAuthChange = async (_session)=>{
  loadDriversList();
  loadMyPassengerRequests();
};

