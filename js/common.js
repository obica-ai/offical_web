/* ---------- 环境注入（支持 ?sbUrl=...&sbKey=...） ---------- */
// ---- 放在 common.js 顶部（UI 工具附近）----
function on(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

(function(){
  try{
    const usp=new URLSearchParams(location.search);
    const u=usp.get('sbUrl'); const k=usp.get('sbKey');
    if(u&&k){ window.SUPABASE_URL=u; window.SUPABASE_ANON_KEY=k; }
  }catch(_){}
})();
const SUPABASE_URL = window.SUPABASE_URL || 'https://ddycdlhhgezffmybssvw.supabase.co';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkeWNkbGhoZ2V6ZmZteWJzc3Z3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1NDA4MzAsImV4cCI6MjA3MjExNjgzMH0.JAU94T7uUZQCvuXtaZbMc3VXTAKQyprTX0H62AGOtyo';

if(!SUPABASE_URL || SUPABASE_URL.includes('YOUR-PROJECT') || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY==='YOUR-ANON-KEY'){
  document.getElementById('statusBar')?.classList.remove('hidden');
}

/* ---------- Supabase ---------- */
const sb = (typeof supabase!=='undefined') ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

/* ---------- UI 工具 ---------- */
function toast(msg, type='info'){
  const t=document.getElementById('toast'); if(!t) return;
  t.className='fixed top-20 left-1/2 -translate-x-1/2 z-50';
  t.innerHTML='<div class="px-4 py-2 rounded-md shadow border '+(type==='error'?'bg-red-50 text-red-700 border-red-200':'bg-emerald-50 text-emerald-700 border-emerald-200')+'">'+msg+'</div>';
  t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),3000);
}
function card(el){ return `<div class="border rounded-lg p-3 bg-white shadow-sm">${el}</div>`; }
function badge(t){ return `<span class="inline-block text-xs px-2 py-0.5 rounded-full bg-gray-100 border">${t}</span>`; }
function fmtAddr(o){ const line1=[o.city,o.state,o.postal].filter(Boolean).join(', '); const line2=[o.street1,o.street2].filter(Boolean).join(' '); return {line1,line2}; }
function maskName(name){ if(!name) return '匿名'; const s=String(name).trim(); if(!s) return '匿名'; const parts=s.split(/\s+/); const base=parts.length>1?parts[parts.length-1]:s[0]; return base+'**'; }
function genderLabel(g){ return g==='male'?'男':(g==='female'?'女':'-'); }

/* ---------- 地址 ---------- */
function normalizePostal(country,v){ if(!v) return null; v=v.toUpperCase().trim(); if(country==='CA') return v.replace(/\s+/g,''); return v; }
function isValidPostal(country,v){ if(!v) return false; if(country==='US') return /^\d{5}(-\d{4})?$/.test(v); if(country==='CA') return /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/.test(v); return false; }
function readAddress(prefix){
  const country=document.getElementById(prefix+'-country').value||'US';
  const street1=document.getElementById(prefix+'-street1').value.trim();
  const street2=document.getElementById(prefix+'-street2').value.trim();
  const city=document.getElementById(prefix+'-city').value.trim();
  const state=(document.getElementById(prefix+'-state').value||'').trim().toUpperCase();
  const postal=normalizePostal(country, document.getElementById(prefix+'-postal').value);
  if(prefix.includes('origin') && !/^[A-Za-z ]+$/.test(city)) return {ok:false,msg:'出发城市只能包含英文字母和空格'};
  if(!street1||!city||!state||!postal) return {ok:false,msg:'请完整填写地址（街道/城市/州/邮编）'};
  if(!isValidPostal(country,postal)) return {ok:false,msg:'邮编格式不正确（US: 12345/12345-6789；CA: A1A 1A1）'};
  return {ok:true,data:{country,street1,street2:street2||null,city,state,postal}};
}

/* ---------- 资料 ---------- */
async function fetchProfile(){
  const { data:{ user } } = await sb.auth.getUser(); if(!user) return null;
  const { data, error } = await sb.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle();
  if(error && error.code!=='PGRST116') throw error; return data||null;
}
async function setUserRole(role){
  const { data:{ user } } = await sb.auth.getUser(); if(!user) return;
  const { error } = await sb.from('user_profiles').upsert({ user_id:user.id, user_role:role }, { onConflict:'user_id' });
  if(error) throw error;
  // 角色设置后，根据角色跳转到对应页面
  if(role==='passenger') location.href='passenger.html';
  else location.href='driver.html';
}
async function ensureUserRole(){
  const profile = await fetchProfile();
  return profile?.user_role || null;
}
async function saveOrCreateProfile(){
  const payload={
    p_full_name: document.getElementById('profile-name')?.value?.trim()||null,
    p_phone:     document.getElementById('profile-phone')?.value?.trim()||null,
    p_id_number: document.getElementById('profile-id-number')?.value?.trim()||null,
    p_gender:    document.getElementById('profile-gender')?.value||null,
    p_age:       document.getElementById('profile-age')?.value?parseInt(document.getElementById('profile-age').value,10):null,
    p_bio:       document.getElementById('profile-bio')?.value?.trim()||null,
  };
  try{
    const { data, error } = await sb.rpc('upsert_my_profile', payload);
    if(error) throw error; return data;
  }catch(_){
    const uid = (await sb.auth.getSession()).data.session.user.id;
    const { data, error } = await sb.from('user_profiles').upsert({
      user_id: uid, full_name: payload.p_full_name, phone: payload.p_phone, id_number: payload.p_id_number,
      gender: payload.p_gender, age: payload.p_age, bio: payload.p_bio, updated_at: new Date().toISOString()
    }, { onConflict:'user_id' }).select().single();
    if(error) throw error; return data;
  }
}
async function fetchProfilesForUserIds(ids){
  const uniq=Array.from(new Set((ids||[]).filter(Boolean))); if(uniq.length===0) return {};
  try{
    const { data, error } = await sb.from('profile_public').select('user_id, full_name, gender').in('user_id', uniq);
    if(error) throw error; const map={}; (data||[]).forEach(p=>map[p.user_id]=p); return map;
  }catch(_){
    try{
      const { data, error } = await sb.from('user_profiles').select('user_id, full_name, gender').in('user_id', uniq);
      if(error) throw error; const map={}; (data||[]).forEach(p=>map[p.user_id]=p); return map;
    }catch(e2){ console.warn('fetchProfiles failed', e2); return {}; }
  }
}

/* ---------- Auth ---------- */
async function login(){
  const email=document.getElementById('authEmail').value.trim();
  const pass=document.getElementById('authPass').value.trim();
  if(!email||!pass){ toast('请输入邮箱与密码','error'); return; }
  const btn=document.getElementById('btnLogin'); btn.disabled=true; btn.textContent='登录中…';
  try{ const { error } = await sb.auth.signInWithPassword({ email, password:pass }); if(error) throw error; toast('登录成功','success'); }
  catch(e){ toast('登录失败：'+(e.message||'Bad Request'),'error'); }
  finally{ btn.disabled=false; btn.textContent='登录'; }
}
async function register(){
  const email=document.getElementById('authEmail').value.trim();
  const pass=document.getElementById('authPass').value.trim();
  if(!email||!pass){ toast('请输入邮箱与密码','error'); return; }
  const btn=document.getElementById('btnRegister'); btn.disabled=true; btn.textContent='注册中…';
  try{
    localStorage.setItem('lastEmail',email); localStorage.setItem('lastOtpType','signup');
    const { data, error } = await sb.auth.signUp({ email, password:pass, options:{ emailRedirectTo:'https://obica-ai.github.io/travel_web/verified.html' }});
    if(error) throw error;
    if(data.user && !data.session){ openOtp('signup', email); toast('验证码已发送到邮箱，请输入 6 位代码完成注册验证','success'); }
    else toast('注册成功！','success');
  }catch(e){ toast('注册失败：'+(e.message||'Database error'),'error'); }
  finally{ btn.disabled=false; btn.textContent='注册'; }
}
async function magicLink(){
  const email=document.getElementById('authEmail').value.trim(); if(!email){ toast('请输入邮箱','error'); return; }
  const btn=document.getElementById('btnMagic'); btn.disabled=true; btn.textContent='发送中…';
  try{
    localStorage.setItem('lastEmail',email); localStorage.setItem('lastOtpType','signup');
    await sb.auth.signInWithOtp({ email, options:{ emailRedirectTo:'https://obica-ai.github.io/travel_web/verified.html' }});
    toast('已发送登录链接，请查收邮箱','success');
  }catch(e){ toast('发送失败：'+(e.message||'配置错误'),'error'); }
  finally{ btn.disabled=false; btn.textContent='发登录链接'; }
}
async function signOut(){ await sb.auth.signOut(); toast('已退出','success'); }

// ===== OTP 验证通用逻辑 =====
      let otpCtx = null;   // 'signup' | 'email'
      let otpEmail = null;
      
      function openOtp(type, email){
        otpCtx = type;
        otpEmail = email;
        document.getElementById('otp-email').textContent = email;
        document.getElementById('otp-code').value = '';
        document.getElementById('otp-section').classList.remove('hidden');
        document.getElementById('otp-code').focus();
      }
      
      function closeOtp(){
        document.getElementById('otp-section').classList.add('hidden');
      }
      
      async function verifyOtpSubmit(){
        const token = (document.getElementById('otp-code').value || '').trim();
        if(!/^\d{6}$/.test(token)){ toast('请输入 6 位数字验证码', 'error'); return; }
        try{
          const { error } = await sb.auth.verifyOtp({ email: otpEmail, token, type: otpCtx });
          if (error) throw error;
      
          toast('邮箱验证成功', 'success');
          closeOtp();
      
          // 验证成功后通常会拥有会话；刷新 UI
          const { data:{ session } } = await sb.auth.getSession();
          updateAuthUI(session);
        }catch(e){
          toast('验证失败：' + (e.message || '无效验证码'), 'error');
        }
      }
      
      

/* ---------- 顶部 Auth UI ---------- */
function updateAuthUI(session){
  const authed=!!session?.user;
  document.getElementById('authStatus')?.replaceChildren(document.createTextNode(authed?`已登录：${session.user.email}`:'未登录'));
  document.getElementById('authBox')?.classList.toggle('hidden', authed);
  document.getElementById('btnSignOut')?.classList.toggle('hidden', !authed);

  // 页面钩子：每页可定义 window.onAfterAuthChange 来加载自身数据
  if(typeof window.onAfterAuthChange==='function'){ window.onAfterAuthChange(session); }
}

/* ---------- 绑定通用按钮（若存在） & 初始化 ---------- */
// ===== 安全事件绑定（存在才绑定；并等 DOMReady）=====
(function () {
  function on(id, event, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
  }

  function bindAll() {
    // 顶部 Auth 按钮（页面没有的话不会绑定）
    on('btnLogin', 'click', login);
    on('btnRegister', 'click', register);
    on('btnMagic', 'click', magicLink);
    on('btnSignOut', 'click', signOut);

    // OTP 区块（仅在含有 OTP 的页面才绑定）
    on('btnVerifyOtp', 'click', verifyOtpSubmit);
    on('btnOtpCancel', 'click', closeOtp);
    const otpInput = document.getElementById('otp-code');
    if (otpInput) {
      otpInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') verifyOtpSubmit();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindAll);
  } else {
    bindAll();
  }
})();



(async ()=>{
  const { data:{ session } } = await sb.auth.getSession();
  updateAuthUI(session);
})();
sb.auth.onAuthStateChange((_evt, session)=> updateAuthUI(session));

/* ---------- 导出到全局，供子页脚本使用 ---------- */
window.__app = {
  sb, toast, card, badge, fmtAddr, maskName, genderLabel,
  readAddress, saveOrCreateProfile, fetchProfilesForUserIds,
  ensureUserRole, setUserRole
};
