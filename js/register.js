// register.js
// 依赖：common.js 已加载并在 window.__app 暴露 { sb, toast, setUserRole }。
// 可选 hCaptcha：若你有站点 key，先在 HTML 引入 hCaptcha 脚本，
// 然后这里设置 window.HCAPTCHA_SITEKEY='你的key'；纯前端无法校验 token，严肃场景请用 Edge Function 校验。

(function () {
  const app = window.__app || {};
  const sb   = app.sb;
  const toast = app.toast || ((m)=>alert(m));

  if (!sb) {
    console.error('Supabase client (sb) not found. Make sure common.js is loaded before register.js');
    return;
  }

// —— 简易算术人类校验 —— //
let mA = 0, mB = 0;

function genMath() {
  mA = 2 + Math.floor(Math.random() * 8); // 2..9
  mB = 2 + Math.floor(Math.random() * 8);
  const aEl = document.getElementById('math-a');
  const bEl = document.getElementById('math-b');
  if (aEl) aEl.textContent = mA;
  if (bEl) bEl.textContent = mB;
  const ans = document.getElementById('math-answer');
  if (ans) ans.value = '';
}

function passedHumanCheck() {
  const ans = (document.getElementById('math-answer')?.value || '').trim();
  if (!/^\d+$/.test(ans)) { (window.__app?.toast||alert)('请完成算术校验'); return false; }
  if (Number(ans) !== mA + mB) {
    (window.__app?.toast||alert)('算术校验失败，请重试'); 
    genMath();
    return false;
  }
  return true;
}

// 页面加载完生成一次题目
document.addEventListener('DOMContentLoaded', genMath);

// 可选：给“注册”表单绑定校验（如果有 id="register-form"）
document.getElementById('register-form')?.addEventListener('submit', (e) => {
  if (!passedHumanCheck()) e.preventDefault();
});

// 可选：如果你加了“换一题”按钮，id 设为 btnRefreshMath
document.getElementById('btnRefreshMath')?.addEventListener('click', genMath);
  // --------- 帮助方法 ----------
  function selectedRole() {
    const el = document.querySelector('input[name="user-role"]:checked');
    return el ? el.value : 'passenger';
  }
  function redirectUrl() {
    // 指向 verified.html（兼容 GitHub Pages 子路径）
    const base = location.pathname.replace(/\/[^/]*$/, '/'); // 当前目录
    return (window.EMAIL_REDIRECT_URL) || (location.origin + base + 'verified.html');
  }

  async function upsertProfileAndRole() {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.user) return;

      const payload = {
        user_id: session.user.id,
        full_name: document.getElementById('profile-name')?.value?.trim() || null,
        phone: document.getElementById('profile-phone')?.value?.trim() || null,
        gender: document.getElementById('profile-gender')?.value || null,
        user_role: selectedRole(),
        updated_at: new Date().toISOString()
      };

      // 直接 upsert（你 RLS 已做“仅本人可写”策略）
      const { error } = await sb.from('user_profiles').upsert(
        payload, { onConflict: 'user_id' }
      );
      if (error) throw error;

      // 根据角色跳转（与站内导航保持一致）
      if (typeof app.setUserRole === 'function') {
        await app.setUserRole(payload.user_role);
      }
    } catch (e) {
      console.warn('upsertProfileAndRole failed', e);
      toast('保存资料失败：' + (e.message || 'Unknown'), 'error');
    }
  }

  // 注册提交
  async function onSubmit(e) {
    e.preventDefault();

    const email = document.getElementById('reg-email').value.trim();
    const pass  = document.getElementById('reg-pass').value;
    const pass2 = document.getElementById('reg-pass2').value;

    if (!email || !pass) { toast('请填写邮箱和密码','error'); return; }
    if (pass.length < 6) { toast('密码至少 6 位','error'); return; }
    if (pass !== pass2)  { toast('两次输入的密码不一致','error'); return; }
    if (!passedHumanCheck()) return;

    const btn = document.getElementById('btnRegisterSubmit');
    btn.disabled = true; btn.textContent = '提交中…';

    try {
      // 提前缓存 profile（若无会话，等验证后写入）
      const pending = {
        name:   document.getElementById('profile-name')?.value?.trim() || null,
        phone:  document.getElementById('profile-phone')?.value?.trim() || null,
        gender: document.getElementById('profile-gender')?.value || null,
        role:   selectedRole()
      };
      localStorage.setItem('pendingProfile', JSON.stringify(pending));
      localStorage.setItem('lastEmail', email);
      localStorage.setItem('lastOtpType', 'signup');

      const { data, error } = await sb.auth.signUp({
        email,
        password: pass,
        options: { emailRedirectTo: redirectUrl() }
      });
      if (error) throw error;

      // 已直接登录（未开启邮件确认）
      if (data.session?.user) {
        toast('注册成功！','success');
        await upsertProfileAndRole();
        return;
      }

      // 启用了邮件确认：显示 OTP 流程（也兼容你点击邮件链接完成验证）
      if (data.user && !data.session) {
        // 你在 common.js 里实现了 openOtp；若不存在就简单提示去邮箱查收
        if (typeof window.openOtp === 'function') {
          window.openOtp('signup', email);
        } else {
          toast('注册成功！请到邮箱查收验证码/确认链接完成验证','success');
        }
      }
    } catch (e) {
      toast('注册失败：' + (e.message || 'Unknown'), 'error');
    } finally {
      btn.disabled = false; btn.textContent = '注册';
      genMath();
    }
  }

  // 在验证完成并拥有 session 时，把 pendingProfile 写入数据库并跳转
  window.onAfterAuthChange = async (session) => {
    if (!session?.user) return;
    const buf = localStorage.getItem('pendingProfile');
    if (!buf) return;
    try {
      await upsertProfileAndRole();
    } finally {
      localStorage.removeItem('pendingProfile');
    }
  };

  // 绑定
  function bind() {
    document.getElementById('reg-form')?.addEventListener('submit', onSubmit);

    // 若启用了 hCaptcha，把容器显示并设置 sitekey
    if (window.HCAPTCHA_SITEKEY) {
      const wrap = document.getElementById('hcaptcha-wrap');
      const node = wrap?.querySelector('.h-captcha');
      if (wrap && node) {
        node.setAttribute('data-sitekey', window.HCAPTCHA_SITEKEY);
        wrap.classList.remove('hidden');
        document.getElementById('math-wrap')?.classList.add('hidden');
      }
    }
    genMath();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
