
const boardCache = { drivers:[], passengers:[] };

function renderBoard(filterText=''){
  const dWrap=document.getElementById('driver-board');
  const pWrap=document.getElementById('passenger-board');
  const dCount=document.getElementById('driver-count');
  const pCount=document.getElementById('passenger-count');
  const t=(filterText||'').toLowerCase();
  const match=(r)=>{
    if(!t) return true;
    const s=[r.origin_city,r.origin_state,r.origin_postal_code,r.destination_city,r.destination_state,r.destination_postal_code]
      .filter(Boolean).join(' ').toLowerCase();
    return s.includes(t);
  };
  const drivers=boardCache.drivers.filter(match);
  const passengers=boardCache.passengers.filter(match);
  dCount.textContent=`${drivers.length} 条`;
  pCount.textContent=`${passengers.length} 条`;

  dWrap.innerHTML = drivers.map(r=>{
    const o=fmtAddr({city:r.origin_city||r.from_city||'-', state:r.origin_state||'-', postal:r.origin_postal_code||'', street1:r.origin_street1||'', street2:r.origin_street2||''});
    const d=fmtAddr({city:r.destination_city||r.to_city||'-', state:r.destination_state||'-', postal:r.destination_postal_code||'', street1:r.destination_street1||'', street2:r.destination_street2||''});
    const dt=`${r.date} ${r.time?.slice(0,5)||''}`;
    const price=(r.price_per_person && Number(r.price_per_person)>0)?`${r.price_per_person}`:'—';
    return card(`<div><div class="flex items-center gap-2 mb-1">${badge('司机')} ${badge('可载 '+r.available_seats+' 人')}</div>
      <div class="text-sm font-medium">出发：${o.line1}</div><div class="text-xs text-gray-500">${o.line2||''}</div>
      <div class="text-sm mt-1">到达：${d.line1}</div><div class="text-xs text-gray-500">${d.line2||''}</div>
      <div class="text-sm mt-1">时间：${dt}</div><div class="text-sm text-gray-600">价格/人：${price}</div></div>`);
  }).join('') || '<div class="text-sm text-gray-500">暂无记录</div>';

  pWrap.innerHTML = passengers.map(r=>{
    const o=fmtAddr({city:r.origin_city||r.from_city||'-', state:r.origin_state||'-', postal:r.origin_postal_code||'', street1:r.origin_street1||'', street2:r.origin_street2||''});
    const d=fmtAddr({city:r.destination_city||r.to_city||'-', state:r.destination_state||'-', postal:r.destination_postal_code||'', street1:r.destination_street1||'', street2:r.destination_street2||''});
    const dt=`${r.date} ${r.time?.slice(0,5)||''}`;
    return card(`
    <div class="flex items-start justify-between gap-3">
      <div>
        <div class="flex items-center gap-2 mb-1">
          ${badge('乘客')} ${badge('需 '+r.seats_needed+' 座')}
        </div>
        <div class="text-sm font-medium">出发：${o.line1}</div>
        <div class="text-xs text-gray-500">${o.line2 || ''}</div>
        <div class="text-sm mt-1">到达：${d.line1}</div>
        <div class="text-xs text-gray-500">${d.line2 || ''}</div>
        <div class="text-sm mt-1">时间：${dt}</div>
        ${r.note ? `<div class="text-xs text-gray-500 mt-1">备注：${r.note}</div>` : ''}

        <!-- ✅ 新增：拼单按钮，仅乘客栏 -->
        <div class="mt-2">
          <button class="px-2 py-1 text-sm rounded-md border"
                  data-act="carpool" data-id="${r.id}">
            拼单
          </button>
        </div>
      </div>
    </div>
  `);
}).join('') || '<div class="text-sm text-gray-500">暂无记录</div>';
}

async function loadBoard(){
  const now=Date.now();
  const start=new Date(now-30*24*60*60*1000).toISOString().slice(0,10);
  const end  =new Date(now+90*24*60*60*1000).toISOString().slice(0,10);
  const { data:{ user } } = await sb.auth.getUser();
  const uid=user?.id||null;

  let qd=sb.from('driver_schedules').select('*').gte('date',start).lte('date',end).order('date',{ascending:true}).order('time',{ascending:true}).limit(50);
  if(uid) qd=qd.neq('user_id',uid);
  let qp=sb.from('passenger_requests').select('*').gte('date',start).lte('date',end).order('date',{ascending:true}).order('time',{ascending:true}).limit(50);
  if(uid) qp=qp.neq('user_id',uid);

  const [{data:d, error:de},{data:p, error:pe}] = await Promise.all([qd,qp]);
  if(de) toast('加载司机时间表失败：'+de.message,'error');
  if(pe) toast('加载乘客需求失败：'+pe.message,'error');
  boardCache.drivers=d||[]; boardCache.passengers=p||[];
  renderBoard(document.getElementById('board-filter')?.value?.trim());
}

/* Realtime（可选） */
let rtSub=null;
function setupRealtime(){
  try{
    if(rtSub){ sb.removeChannel(rtSub); rtSub=null; }
    rtSub = sb.channel('board-ch')
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'driver_schedules'},()=>loadBoard())
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'driver_schedules'},()=>loadBoard())
      .on('postgres_changes',{event:'DELETE',schema:'public',table:'driver_schedules'},()=>loadBoard())
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'passenger_requests'},()=>loadBoard())
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'passenger_requests'},()=>loadBoard())
      .on('postgres_changes',{event:'DELETE',schema:'public',table:'passenger_requests'},()=>loadBoard())
      .subscribe(()=>{});
  }catch(e){ console.warn('Realtime unavailable',e); }
}

/* 页面初始化钩子：登录状态变化时都刷新公告栏 */
window.onAfterAuthChange = (_session)=>{ loadBoard(); setupRealtime(); };

document.getElementById('btnBoardRefresh')?.addEventListener('click', loadBoard);
document.getElementById('board-filter')?.addEventListener('input', e=> renderBoard(e.target.value.trim()));

document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('[data-act="carpool"]');
  if (!btn) return;
  const id = btn.dataset.id;

  const app = window.__app;
  if (!app) return;

  // 未登录：先提示登录
  const { data:{ session } } = await app.sb.auth.getSession();
  if (!session?.user) { app.toast('请先登录后再拼单','error'); return; }

  // 必须是“乘客”角色
  try {
    const role = await app.ensureUserRole();
    if (role !== 'passenger') {
      location.href = 'index.html#denied';      // 主页面会弹“角色不匹配”
      return;
    }
  } catch {
    location.href = 'index.html#denied';
    return;
  }

  // 跳到乘客页并携带 copyFrom 参数，乘客页会自动预填
  const qs = new URLSearchParams({ copyFrom: id });
  location.href = `passenger.html?${qs.toString()}`;
});

