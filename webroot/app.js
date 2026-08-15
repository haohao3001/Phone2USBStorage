/* Phone2USBStorage WebUI
 * 不依赖 import map / 任何 npm 包名,直接调用 KernelSU WebView 注入的全局 ksu 对象。
 * 与 bindhosts 使用的 kernelsu-alt 库同机制,在官方 KernelSU、
 * KernelSU-Next(MMRL)、APatch 等所有注入了全局 ksu 的环境中均可工作。
 */

const MODDIR = '/data/adb/modules/phone2usbstorage';
const IMG = '/data/adb/phone2usbstorage/storage.img';

const terminal = document.getElementById('terminal');
const createSection = document.getElementById('create-section');
const deleteSection = document.getElementById('delete-section');
const sizeInput = document.getElementById('size-input');
const createBtn = document.getElementById('create-btn');
const deleteBtn = document.getElementById('delete-btn');
const sizeValueNum = document.getElementById('size-value-num');
const confirmDialog = document.getElementById('confirm-dialog');
const confirmOk = document.getElementById('confirm-ok');
const confirmCancel = document.getElementById('confirm-cancel');

/* ---------- 日志输出到终端 ---------- */

function log(text, cls = '') {
    const line = document.createElement('div');
    if (cls) line.className = cls;
    line.textContent = text;
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

/* ---------- 全局错误捕获：所有 JS 错误都打印到终端 ---------- */

window.addEventListener('error', (e) => {
    log(`[JS 错误] ${e.message}（${e.filename}:${e.lineno}）`, 'err');
});

window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason instanceof Error ? `${e.reason.message}${e.reason.stack ? '\n' + e.reason.stack : ''}` : String(e.reason);
    log(`[JS 未捕获异常] ${reason}`, 'err');
});

/* ---------- exec 桥接：封装全局 ksu 对象 ---------- */

let __cbCounter = 0;

/**
 * 执行 shell 命令（root 权限）。
 * ksu.exec(command, optionsJSON, callbackName) 通过 window[callbackName] 回调返回结果。
 * 任何异常都不会外抛，统一转化为 errno/stdout/stderr 返回。
 */
function exec(command, options = {}) {
    return new Promise((resolve) => {
        const cbName = `webui_exec_${Date.now()}_${__cbCounter++}`;
        window[cbName] = (errno, stdout, stderr) => {
            delete window[cbName];
            resolve({ errno, stdout, stderr });
        };
        try {
            if (typeof ksu !== 'undefined' && typeof ksu.exec === 'function') {
                ksu.exec(command, JSON.stringify(options), cbName);
            } else {
                log('[错误] 未检测到 KernelSU API（全局 ksu 对象不可用）', 'err');
                resolve({ errno: 1, stdout: '', stderr: 'ksu is not defined' });
            }
        } catch (e) {
            delete window[cbName];
            log(`[错误] ksu.exec 调用异常：${e.message}`, 'err');
            resolve({ errno: 1, stdout: '', stderr: String(e.message || e) });
        }
    });
}

/** 弹系统 Toast（可选 API，失败忽略） */
function toast(msg) {
    try {
        if (typeof ksu !== 'undefined' && typeof ksu.toast === 'function') ksu.toast(msg);
    } catch (e) { /* ignore */ }
}

/* ---------- 事件监听器：同步注册，不依赖任何异步执行结果 ---------- */

createBtn.addEventListener('click', onCreate);
sizeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') onCreate(); });
deleteBtn.addEventListener('click', () => { confirmDialog.hidden = false; });
confirmOk.addEventListener('click', onDelete);
confirmCancel.addEventListener('click', () => { confirmDialog.hidden = true; });
confirmDialog.addEventListener('click', (e) => { if (e.target === confirmDialog) confirmDialog.hidden = true; });

/* ---------- 工具函数 ---------- */

/** 执行命令，stdout/stderr/退出码全部输出到终端 */
async function run(cmd) {
    log(`$ ${cmd}`, 'cmd');
    const { errno, stdout, stderr } = await exec(cmd);
    if (stdout && stdout.trim()) log(stdout.replace(/\n+$/, ''), 'out');
    if (stderr && stderr.trim()) log(stderr.replace(/\n+$/, ''), 'err');
    if (errno !== 0) log(`[退出码 ${errno}]`, 'err');
    return { errno, stdout };
}

function formatGB(bytes) {
    const gb = bytes / 1073741824;
    const s = String(Math.round(gb * 10) / 10);
    return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/* ---------- 业务逻辑 ---------- */

/**
 * 检测 /data/adb/phone2usbstorage/storage.img 是否存在：
 *  - 存在 → 读取字节数换算成 GB，显示镜像大小 + 删除按钮（红色）
 *  - 不存在 → 显示创建面板（输入框 + 确认创建）
 * 检测命令失败时兜底显示创建面板，并把错误打到终端。
 */
async function checkStatus(silent = true) {
    let out = 'NOT_EXISTS';
    const res = await exec(
        `if [ -f "${IMG}" ]; then ls -l "${IMG}" | awk '{print $5}'; else echo NOT_EXISTS; fi`
    );
    if (res.errno !== 0) {
        log(`[错误] 检测镜像状态失败（errno=${res.errno}）：${res.stderr || '无输出'}`, 'err');
    } else {
        out = String(res.stdout).trim();
    }

    if (out === 'NOT_EXISTS') {
        if (!silent) log('[Phone2USBStorage] 未检测到 storage.img，显示创建面板', 'info');
        createSection.hidden = false;
        deleteSection.hidden = true;
    } else {
        const bytes = parseInt(out, 10);
        if (isNaN(bytes)) {
            log(`[错误] 无法解析镜像大小："${out}"`, 'err');
        } else {
            const gb = formatGB(bytes);
            sizeValueNum.textContent = gb;
            if (!silent) log(`[Phone2USBStorage] 已检测到 storage.img，大小 ${gb} GB`, 'ok');
        }
        createSection.hidden = true;
        deleteSection.hidden = false;
    }
}

async function onCreate() {
    const m = String(sizeInput.value).trim().match(/^([1-9]|[1-5][0-9]|6[0-4])$/);
    if (!m) {
        log('[错误] 请输入 1 - 64 之间的整数（单位 GB）', 'err');
        return;
    }
    const gb = parseInt(m[1], 10);
    const mb = gb * 1024;
    createBtn.disabled = true;
    createBtn.textContent = '创建中…';
    log(`[Phone2USBStorage] 开始创建 ${gb} GB 镜像（${mb} MB，稀疏文件，秒级完成）…`, 'info');
    try {
        const { errno } = await run(`sh ${MODDIR}/webui.sh create ${mb}`);
        if (errno === 0) {
            toast(`镜像创建成功：${gb} GB`);
            log('[Phone2USBStorage] 镜像创建成功', 'ok');
        } else {
            toast('镜像创建失败，详见终端日志');
        }
        await checkStatus(false);
    } catch (e) {
        log(`[错误] ${e.message}`, 'err');
    } finally {
        createBtn.disabled = false;
        createBtn.textContent = '确认创建';
    }
}

async function onDelete() {
    confirmDialog.hidden = true;
    deleteBtn.disabled = true;
    log('[Phone2USBStorage] 开始删除镜像…', 'info');
    try {
        const { errno } = await run(`sh ${MODDIR}/webui.sh delete`);
        if (errno === 0) {
            toast('镜像已删除');
            log('[Phone2USBStorage] 镜像删除完成', 'ok');
        } else {
            toast('删除失败，详见终端日志');
        }
        await checkStatus(false);
    } catch (e) {
        log(`[错误] ${e.message}`, 'err');
    } finally {
        deleteBtn.disabled = false;
    }
}

/* ---------- 启动 ---------- */

(async function init() {
    log('=== Phone2USBStorage WebUI ===', 'info');
    if (typeof ksu === 'undefined') {
        log('[错误] 未检测到 KernelSU API（全局 ksu 对象不存在）', 'err');
        log('[提示] 请确认在 KernelSU / KernelSU-Next 管理器内打开本 WebUI', 'info');
        return;
    }
    await checkStatus(false);
    // 定时静默刷新状态，兼容电脑端或 adb 直接放置镜像的场景
    setInterval(() => { checkStatus(true); }, 10000);
})();
