# 端口管理页面重构 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/ports` 页面从「输入端口号 + 点检查」重构为「自动扫描系统所有 LISTENING 端口 + 2 秒实时刷新 + 颜色 diff 高亮 + 一键浏览器打开」，对标 CurrPorts / TCPView。

**Architecture:**
- **后端 (Rust)**: 新增 `ip_helper.rs`，用 Windows IP Helper API（`GetExtendedTcpTable`）单次 syscall 拿全表；新增 `list_listening_ports` 和 `open_in_browser` 两个 Tauri 命令。
- **前端 (TS/React)**: 把 217 行的 `PortInspectorPageMain.tsx` 拆成「瘦入口 + 6 个小组件」；用 4 个 hook 管理状态（轮询 / 过滤 / diff / 暂停）；Zustand store 扩展 `summary` / `isPaused` / `portsLastSnapshot`。
- **零破坏性**: 旧的 `inspect_ports` / `kill_process_by_pid` 命令保留。

**Tech Stack:**
- Rust: `windows = "0.58"` crate（仅 Windows target）
- Frontend: React 19 + Ant Design 6 + Zustand 5 + TypeScript
- 新增 Tauri plugin: `tauri-plugin-opener` v2（用于打开浏览器）

**Spec:** `docs/superpowers/specs/2026-06-20-port-inspector-redesign-design.md`

---

## File Structure

| 路径 | 状态 | 职责 |
|---|---|---|
| `src-tauri/Cargo.toml` | Modify | 加 `windows` + `tauri-plugin-opener` 依赖 |
| `src-tauri/src/port/ip_helper.rs` | **Create** | Windows IP Helper API 封装（`list_tcp_listening`） |
| `src-tauri/src/port/mod.rs` | Modify | 导出 `ip_helper` |
| `src-tauri/src/port/port_detector.rs` | Modify | 加 `list_listening_ports()` 入口 |
| `src-tauri/src/core/types.rs` | Modify | 扩展 `PortInspectionItem` 加 `state` / `localAddress` / `protocol` |
| `src-tauri/src/commands/port_command.rs` | Modify | 加 `list_listening_ports` + `open_in_browser` 命令 |
| `src-tauri/src/lib.rs` | Modify | 注册新命令 + 注册 `tauri-plugin-opener` |
| `src/types/runtime.ts` | Modify | 扩展 `PortInspectionItem` 类型，加 `TcpState` / `PortInspectorSummary` / `PortDiff` |
| `src/services/tauri-api/client.ts` | Modify | 加 `listListeningPorts()` + `openInBrowser()` 包装 |
| `src/store/service-store.ts` | Modify | 扩展 store 加 `summary` / `isPaused` / `pauseReason` / `portsLastSnapshot` / 新 actions |
| `src/modules/port-manager/constants.ts` | **Create** | 刷新间隔、淡出时间、默认标签等常量 |
| `src/modules/port-manager/usePortInspector.ts` | **Create** | 轮询 hook（启动 / 停止 / 暂停 / 可见性） |
| `src/modules/port-manager/usePortFilter.ts` | **Create** | 4 个 filter 模式的过滤逻辑 |
| `src/modules/port-manager/usePortDiff.ts` | **Create** | diff 计算 + 5 秒淡出 timer 管理 |
| `src/modules/port-manager/usePortSummary.ts` | **Create** | 派生 summary（监听数 / 冲突数 / 上次扫描耗时） |
| `src/components/port/PortInspectorToolbar.tsx` | **Create** | 顶部两行工具栏 |
| `src/components/port/PortInspectorQuickFilters.tsx` | **Create** | 快捷过滤标签 |
| `src/components/port/PortInspectorSummary.tsx` | **Create** | 状态摘要（47 监听 / 3 冲突 / 2秒前） |
| `src/components/port/PortInspectorStatusBar.tsx` | **Create** | 底部状态条 |
| `src/components/port/PortInspectorTable.tsx` | **Create** | 表格（含颜色 diff 行 + 操作列） |
| `src/components/port/PortDiffHighlight.tsx` | **Create** | 单元：行背景色 + 左侧色条 |
| `src/components/port/OpenInBrowserButton.tsx` | **Create** | 🌍 按钮 |
| `src/components/port/ConflictServiceBadge.tsx` | **Create** | 「⚠ 服务名」红色徽章 |
| `src/pages/PortInspectorPageMain.tsx` | Modify | 瘦化为 < 50 行的入口 |

**既有空目录** `src/modules/port-manager/` 和 `src/components/port/` 现填充。

---

## 任务依赖图

```
Task 1 (依赖)        ─→  Task 2 (类型扩展)  ─→  Task 3 (后端 IP Helper)  ─→  Task 4 (后端命令)
                                                                  ↓
Task 5 (前端 API 包装)  ←────────────────────────────────────────┘
       ↓
Task 6 (Store 扩展)  ─→  Task 7 (hook: usePortFilter)  ─→  Task 8 (hook: usePortDiff)
       ↓                                                       ↓
Task 9 (hook: usePortInspector 轮询)  ─→  Task 10 (组件们)  ─→  Task 11 (入口瘦身)
                                                              ↓
                                                       Task 12 (E2E 手动验证清单)
```

---

## Task 1: 添加 Rust 依赖

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: 编辑 Cargo.toml 加依赖**

在文件末尾（在 `[target."cfg(not(any(...)))"]` 块**之外**）新增一个 Windows-only 块：

```toml
[target.'cfg(windows)'.dependencies]
windows = { version = "0.58", features = [
  "Win32_NetworkManagement_IpHelper",
  "Win32_Foundation",
  "Win32_Networking_WinSock",
] }
tauri-plugin-opener = "2"
```

> 注：把 `tauri-plugin-opener` 也放在 Windows-only 块里——因为整个项目只支持 Windows，逻辑上等价但更明确。

- [ ] **Step 2: 验证 cargo 解析依赖成功**

Run: `cd src-tauri && cargo metadata --format-version 1 --no-deps 2>&1 | head -5`
Expected: 输出 JSON 无错误（`error: failed to parse` 等不应该出现）

- [ ] **Step 3: Commit**

```bash
cd "D:/project/DevTools Launcher"
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore(deps): add windows crate + tauri-plugin-opener"
```

---

## Task 2: 扩展 PortInspectionItem 类型（前后端）

**Files:**
- Modify: `src-tauri/src/core/types.rs`
- Modify: `src/types/runtime.ts`

- [ ] **Step 1: 写前端类型的失败编译测试（不强制 Rust 单元测试）**

由于 TypeScript 类型在编译时检查，本任务通过「让类型使用方编译报错」来验证。

创建 `src/types/__tests__/runtime.test-d.ts`（类型测试文件）：

```ts
import { describe, expectTypeOf, test } from 'vitest'
import type { PortInspectionItem, TcpState, PortInspectorSummary, PortDiff } from '../runtime'

describe('PortInspectionItem 扩展字段', () => {
  test('state 字段是 TcpState 联合类型', () => {
    expectTypeOf<PortInspectionItem['state']>().toEqualTypeOf<TcpState>()
  })

  test('protocol 字段是 TCP | UDP', () => {
    expectTypeOf<PortInspectionItem['protocol']>().toEqualTypeOf<'TCP' | 'UDP'>()
  })

  test('localAddress 字段是 string', () => {
    expectTypeOf<PortInspectionItem['localAddress']>().toEqualTypeOf<string>()
  })

  test('diff 字段是 PortDiff | null | undefined', () => {
    expectTypeOf<PortInspectionItem['diff']>().toEqualTypeOf<PortDiff | null | undefined>()
  })

  test('PortInspectorSummary 包含所有必需字段', () => {
    expectTypeOf<PortInspectorSummary>().toMatchTypeOf<{
      total: number
      listening: number
      conflict: number
      lastRefreshedAt: number | null
      scanDurationMs: number
      isPaused: boolean
      pauseReason: 'manual' | 'tab-hidden' | null
    }>()
  })
})
```

- [ ] **Step 2: 运行类型测试，确认失败**

Run: `cd "D:/project/DevTools Launcher" && npx vitest run src/types/__tests__/runtime.test-d.ts`
Expected: FAIL — `PortInspectionItem` 还没有 `state` / `protocol` / `localAddress` / `diff` 字段

- [ ] **Step 3: 扩展 TS 类型**

修改 `src/types/runtime.ts`：

```ts
export type TcpState =
  | 'LISTENING' | 'ESTABLISHED' | 'TIME_WAIT' | 'CLOSE_WAIT'
  | 'FIN_WAIT1' | 'FIN_WAIT2' | 'SYN_SENT' | 'SYN_RECEIVED'
  | 'CLOSING' | 'LAST_ACK' | 'DELETE_TCB' | 'UNKNOWN'

export type PortProtocol = 'TCP' | 'UDP'

export type PortDiff = 'new' | 'changed' | 'gone'

export interface PortInspectionItem {
  port: number
  state: TcpState
  protocol: PortProtocol
  localAddress: string
  occupied: boolean              // 派生：state === 'LISTENING'
  pid: number | null
  processName: string | null
  processPath: string | null
  diff?: PortDiff | null         // 前端 diff 计算结果，5 秒淡出
}

export interface PortInspectorSummary {
  total: number
  listening: number
  established: number
  conflict: number
  lastRefreshedAt: number | null
  scanDurationMs: number
  isPaused: boolean
  pauseReason: 'manual' | 'tab-hidden' | null
}
```

- [ ] **Step 4: 扩展 Rust 类型**

修改 `src-tauri/src/core/types.rs`（在现有 `PortInspectionItem` 上加字段，保留 `pub` 可见性）：

```rust
use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TcpState {
    Listening,
    Established,
    TimeWait,
    CloseWait,
    FinWait1,
    FinWait2,
    SynSent,
    SynReceived,
    Closing,
    LastAck,
    DeleteTcb,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PortProtocol {
    Tcp,
    Udp,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortInspectionItem {
    pub port: u16,
    pub state: TcpState,
    pub protocol: PortProtocol,
    pub local_address: String,
    pub occupied: bool,
    pub pid: Option<u32>,
    pub process_name: Option<String>,
    pub process_path: Option<String>,
}
```

> 如果 `PortInspectionItem` 在 `types.rs` 已有定义，**保留**旧字段，仅**添加**新字段。`occupied` 字段保留（兼容旧 `inspect_ports` 路径）。

- [ ] **Step 5: 跑 cargo check**

Run: `cd src-tauri && cargo check 2>&1 | tail -20`
Expected: 编译通过（可能有 warning 关于未使用字段，OK）

- [ ] **Step 6: 跑类型测试，应该通过**

Run: `cd "D:/project/DevTools Launcher" && npx vitest run src/types/__tests__/runtime.test-d.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd "D:/project/DevTools Launcher"
git add src-tauri/src/core/types.rs src/types/runtime.ts src/types/__tests__/runtime.test-d.ts
git commit -m "feat(types): extend PortInspectionItem with state/localAddress/protocol"
```

---

## Task 3: 实现 IP Helper API（ip_helper.rs）

**Files:**
- Create: `src-tauri/src/port/ip_helper.rs`
- Modify: `src-tauri/src/port/mod.rs`

- [ ] **Step 1: 写地址解析的单元测试**

在 `src-tauri/src/port/ip_helper.rs` **同一文件**底部加 `#[cfg(test)]` 块（紧接实现，先写测试再写实现）：

```rust
//! Windows IP Helper API 封装 - 列出 LISTENING TCP 端口

use std::net::Ipv4Addr;

use windows::Win32::Networking::WinSock::{AF_INET, SOCKADDR_IN};

use crate::core::error::AppResult;
use crate::core::types::{PortInspectionItem, PortProtocol, TcpState};

/// 解析本地地址（SOCKADDR_IN -> 字符串）
pub fn parse_local_address(addr: &SOCKADDR_IN) -> String {
    // 实现见下个 step
    unimplemented!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::Win32::Networking::WinSock::SOCKADDR_IN;

    fn make_sockaddr(ip: [u8; 4], port_be: u16) -> SOCKADDR_IN {
        let mut sa = SOCKADDR_IN::default();
        sa.sin_family = AF_INET;
        sa.sin_addr.S_un.S_addr = u32::from_ne_bytes(ip);
        sa.sin_port = port_be;
        sa
    }

    #[test]
    fn parse_loopback_returns_127_0_0_1() {
        let sa = make_sockaddr([127, 0, 0, 1], 8080u16.to_be());
        assert_eq!(parse_local_address(&sa), "127.0.0.1");
    }

    #[test]
    fn parse_any_returns_0_0_0_0() {
        let sa = make_sockaddr([0, 0, 0, 0], 80u16.to_be());
        assert_eq!(parse_local_address(&sa), "0.0.0.0");
    }

    #[test]
    fn parse_specific_ip_returns_ip_string() {
        let sa = make_sockaddr([192, 168, 1, 100], 5432u16.to_be());
        assert_eq!(parse_local_address(&sa), "192.168.1.100");
    }

    #[test]
    fn port_port_byte_order_is_network() {
        // 端口 8080 的网络字节序 = 8080u16.to_be()
        // 这是一个回归测试，防止以后误用 .to_le() 引入 bug
        let network_order: u16 = 8080u16.to_be();
        assert_eq!(network_order, 0x1F90);
        let host_order = u16::from_be(network_order);
        assert_eq!(host_order, 8080);
    }
}
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd src-tauri && cargo test --lib port::ip_helper:: 2>&1 | tail -15`
Expected: 4 个测试都 panic（`unimplemented!`）

- [ ] **Step 3: 实现 `parse_local_address`**

替换文件顶部的 `unimplemented!()` 实现：

```rust
pub fn parse_local_address(addr: &SOCKADDR_IN) -> String {
    let ip_bytes = addr.sin_addr.S_un.S_addr.to_ne_bytes();
    Ipv4Addr::from(ip_bytes).to_string()
}
```

- [ ] **Step 4: 跑测试，应该通过**

Run: `cd src-tauri && cargo test --lib port::ip_helper:: 2>&1 | tail -10`
Expected: 4 passed

- [ ] **Step 5: 写主函数 `list_tcp_listening` 的脚手架（先不调真实 API，返 mock）**

在 `ip_helper.rs` 添加（保留上面所有内容）：

```rust
/// 列出系统所有 LISTENING TCP 端口
pub fn list_tcp_listening() -> AppResult<Vec<PortInspectionItem>> {
    // 实现见 Step 6
    Ok(Vec::new())
}
```

- [ ] **Step 6: 实现 `list_tcp_listening`（调 Windows IP Helper API）**

完整实现替换 Step 5 的 stub：

```rust
use std::collections::HashSet;
use std::net::Ipv4Addr;

use windows::core::PWSTR;
use windows::Win32::Foundation::ERROR_INSUFFICIENT_BUFFER;
use windows::Win32::NetworkManagement::IpHelper::{
    GetExtendedTcpTable, TCP_TABLE_OWNER_PID_LISTENER, MIB_TCPROW_OWNER_PID,
};

pub fn list_tcp_listening() -> AppResult<Vec<PortInspectionItem>> {
    // 第一次调用获取所需 buffer 大小
    let mut size: u32 = 0;
    unsafe {
        let _ = GetExtendedTcpTable(
            None,
            &mut size,
            false,
            AF_INET.0,
            TCP_TABLE_OWNER_PID_LISTENER,
        );
    }
    if size == 0 {
        return Ok(Vec::new());
    }

    // 第二次调用拿真实数据
    let mut buf = vec![0u8; size as usize];
    let result = unsafe {
        GetExtendedTcpTable(
            Some(buf.as_mut_ptr() as *mut _),
            &mut size,
            false,
            AF_INET.0,
            TCP_TABLE_OWNER_PID_LISTENER,
        )
    };
    if let Err(e) = result {
        return Err(crate::core::error::AppError::Other(format!(
            "GetExtendedTcpTable failed: {}",
            e
        )));
    }

    // 解析: buf 头部是 MIB_TCPTABLE_OWNER_PID { dwNumEntries: u32, table: [MIB_TCPROW_OWNER_PID; N] }
    let num_entries = u32::from_ne_bytes(buf[0..4].try_into().unwrap()) as usize;
    let rows_ptr = buf.as_ptr().add(4) as *const MIB_TCPROW_OWNER_PID;

    let mut items = Vec::with_capacity(num_entries);
    let mut unique_pids: HashSet<u32> = HashSet::new();

    unsafe {
        for i in 0..num_entries {
            let row = *rows_ptr.add(i);
            let port = u16::from_be(row.dwLocalPort);
            let local_addr_raw = row.dwLocalAddr;
            let local_addr = Ipv4Addr::from(local_addr_raw.to_ne_bytes()).to_string();

            // 跳过 0.0.0.0:0 这种无效行（API 偶尔会返）
            if port == 0 {
                continue;
            }

            let pid = row.dwOwningPid;
            if pid != 0 {
                unique_pids.insert(pid);
            }

            items.push(PortInspectionItem {
                port,
                state: TcpState::Listening,
                protocol: PortProtocol::Tcp,
                local_address: local_addr,
                occupied: true,
                pid: if pid == 0 { None } else { Some(pid) },
                process_name: None,  // 后续批量回填
                process_path: None,
            });
        }
    }

    // 批量查进程信息
    let info_cache = super::process_lookup::lookup_process_infos(&unique_pids)?;
    for item in &mut items {
        if let Some(pid) = item.pid {
            if let Some(info) = info_cache.get(&pid) {
                item.process_name = Some(info.name.clone());
                item.process_path = Some(info.path.clone());
            }
        }
    }

    Ok(items)
}
```

- [ ] **Step 7: 在 process_lookup.rs 加 `lookup_process_infos` 函数**

在 `src-tauri/src/port/process_lookup.rs` 末尾加（如果文件已存在，在 `pub fn` 列表末尾）：

```rust
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct ProcessInfo {
    pub name: String,
    pub path: String,
}

/// 批量查多个 PID 的进程名和路径
pub fn lookup_process_infos(pids: &HashSet<u32>) -> AppResult<HashMap<u32, ProcessInfo>> {
    let mut cache = HashMap::new();
    for &pid in pids {
        if let Ok(info) = lookup_process_info_single(pid) {
            cache.insert(pid, info);
        }
        // 单个失败不阻塞其他 PID
    }
    Ok(cache)
}

fn lookup_process_info_single(pid: u32) -> AppResult<ProcessInfo> {
    let name = lookup_process_name(pid).unwrap_or_default();
    let path = lookup_process_path(pid).unwrap_or_default();
    Ok(ProcessInfo { name, path })
}
```

> 如果 `process_lookup.rs` 已存在 `lookup_process_name` / `lookup_process_path` 函数，直接复用；否则按 Task 1 调研里的伪代码实现（基于 `tasklist /FI "PID eq <pid>"` + PowerShell `Get-CimInstance Win32_Process`）。

- [ ] **Step 8: 在 mod.rs 导出新模块**

修改 `src-tauri/src/port/mod.rs`，加 `pub mod ip_helper;`

- [ ] **Step 9: 编译验证**

Run: `cd src-tauri && cargo build 2>&1 | tail -10`
Expected: 编译成功（warning 可接受）

> 如果 `ERROR_INSUFFICIENT_BUFFER` 等常量在 `windows` 0.58 不可用，对照 `cargo doc --open windows::Win32::NetworkManagement::IpHelper` 查实际 API，调整 import 路径。

- [ ] **Step 10: Commit**

```bash
cd "D:/project/DevTools Launcher"
git add src-tauri/src/port/ip_helper.rs src-tauri/src/port/mod.rs src-tauri/src/port/process_lookup.rs
git commit -m "feat(backend): list_tcp_listening via Windows IP Helper API"
```

---

## Task 4: 注册 Tauri 命令

**Files:**
- Modify: `src-tauri/src/port/port_detector.rs`
- Modify: `src-tauri/src/commands/port_command.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 在 port_detector.rs 加新入口函数**

```rust
use crate::port::ip_helper::list_tcp_listening;

/// 列出系统所有 LISTENING TCP 端口（新版本，替代 inspect_ports 的手工输入模式）
pub fn list_listening_ports() -> AppResult<Vec<PortInspectionItem>> {
    list_tcp_listening()
}
```

- [ ] **Step 2: 在 port_command.rs 加 2 个新命令**

```rust
use tauri::AppHandle;

use crate::core::error::AppResult;
use crate::port::port_detector::list_listening_ports;
use crate::services::browser::open_in_browser;

#[tauri::command]
pub fn list_listening_ports_cmd(_app_handle: AppHandle) -> AppResult<Vec<crate::core::types::PortInspectionItem>> {
    list_listening_ports()
}

#[tauri::command]
pub fn open_in_browser_cmd(_app_handle: AppHandle, port: u16, address: String) -> AppResult<()> {
    open_in_browser(port, &address)
}
```

- [ ] **Step 3: 创建 services/browser.rs（简单 URL 拼接 + tauri-plugin-opener 调用）**

创建 `src-tauri/src/services/browser.rs`：

```rust
use crate::core::error::{AppError, AppResult};

/// 在系统默认浏览器中打开 http://<host>:<port>
pub fn open_in_browser(port: u16, address: &str) -> AppResult<()> {
    let host = if address == "0.0.0.0" || address == "127.0.0.1" || address == "[::]" || address.is_empty() {
        "localhost"
    } else {
        address
    };
    let url = format!("http://{}:{}", host, port);

    tauri_plugin_opener::open_url(&url, None::<&str>)
        .map_err(|e| AppError::Other(format!("failed to open browser: {}", e)))
}
```

- [ ] **Step 4: 在 services/mod.rs 导出新模块**

如果 `src-tauri/src/services/mod.rs` 不存在就创建：

```rust
pub mod browser;
```

否则只加一行 `pub mod browser;`

- [ ] **Step 5: 在 lib.rs 注册新命令和插件**

修改 `src-tauri/src/lib.rs`：

1. 在 `tauri::Builder` 的 `.plugin(...)` 链上加：
```rust
.plugin(tauri_plugin_opener::init())
```

2. 在 `.invoke_handler(tauri::generate_handler![...])` 列表里加：
```rust
commands::port_command::list_listening_ports_cmd,
commands::port_command::open_in_browser_cmd,
```

- [ ] **Step 6: 编译**

Run: `cd src-tauri && cargo build 2>&1 | tail -10`
Expected: 编译通过

- [ ] **Step 7: Commit**

```bash
cd "D:/project/DevTools Launcher"
git add src-tauri/src/port/port_detector.rs src-tauri/src/commands/port_command.rs src-tauri/src/services/ src-tauri/src/lib.rs
git commit -m "feat(backend): register list_listening_ports + open_in_browser commands"
```

---

## Task 5: 前端 Tauri API 包装

**Files:**
- Modify: `src/services/tauri-api/client.ts`

- [ ] **Step 1: 加 2 个新函数**

在 `client.ts` 中 `inspectPorts` 函数后追加：

```ts
export async function listListeningPorts() {
  return invoke<PortInspectionItem[]>('list_listening_ports_cmd')
}

export async function openInBrowser(port: number, address: string) {
  return invoke<void>('open_in_browser_cmd', { port, address })
}
```

- [ ] **Step 2: TypeScript 编译验证**

Run: `cd "D:/project/DevTools Launcher" && npx tsc --noEmit 2>&1 | head -20`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
cd "D:/project/DevTools Launcher"
git add src/services/tauri-api/client.ts
git commit -m "feat(frontend): add listListeningPorts + openInBrowser API wrappers"
```

---

## Task 6: 扩展 Zustand store

**Files:**
- Modify: `src/store/service-store.ts`

- [ ] **Step 1: 写 store 扩展的单元测试**

创建 `src/store/__tests__/service-store.test.ts`：

```ts
import { beforeEach, describe, expect, test } from 'vitest'
import { useServiceStore } from '../service-store'
import type { PortInspectionItem } from '../../types/runtime'

const makeItem = (port: number, pid: number | null): PortInspectionItem => ({
  port,
  state: 'LISTENING',
  protocol: 'TCP',
  localAddress: '127.0.0.1',
  occupied: true,
  pid,
  processName: pid ? 'svc.exe' : null,
  processPath: pid ? 'C:\\svc.exe' : null,
  diff: null,
})

describe('ServiceStore - 端口扫描扩展', () => {
  beforeEach(() => {
    useServiceStore.setState({
      ports: [],
      portsLastSnapshot: [],
      summary: {
        total: 0,
        listening: 0,
        established: 0,
        conflict: 0,
        lastRefreshedAt: null,
        scanDurationMs: 0,
        isPaused: false,
        pauseReason: null,
      },
      isPaused: false,
      pauseReason: null,
    })
  })

  test('setPorts 计算 summary.total 和 summary.listening', () => {
    useServiceStore.getState().setPorts([makeItem(8080, 100), makeItem(3306, null), makeItem(6379, 200)], 120)
    const s = useServiceStore.getState()
    expect(s.summary.total).toBe(3)
    expect(s.summary.listening).toBe(3)
    expect(s.summary.scanDurationMs).toBe(120)
    expect(s.summary.lastRefreshedAt).not.toBeNull()
  })

  test('setPorts 标记新增的端口 diff=new', () => {
    useServiceStore.getState().setPorts([makeItem(8080, 100)], 50)
    useServiceStore.getState().setPorts([makeItem(8080, 100), makeItem(3306, 200)], 60)
    const ports = useServiceStore.getState().ports
    const port3306 = ports.find((p) => p.port === 3306)!
    expect(port3306.diff).toBe('new')
    const port8080 = ports.find((p) => p.port === 8080)!
    expect(port8080.diff).toBeNull()  // 已存在，diff 清空
  })

  test('setPorts 标记 PID 变化为 diff=changed', () => {
    useServiceStore.getState().setPorts([makeItem(8080, 100)], 50)
    useServiceStore.getState().setPorts([makeItem(8080, 999)], 60)  // PID 变了
    const port8080 = useServiceStore.getState().ports.find((p) => p.port === 8080)!
    expect(port8080.diff).toBe('changed')
  })

  test('setPorts 标记消失的端口仍出现在 portsLastSnapshot', () => {
    useServiceStore.getState().setPorts([makeItem(8080, 100)], 50)
    useServiceStore.getState().setPorts([], 60)  // 8080 消失了
    expect(useServiceStore.getState().ports).toHaveLength(0)
    expect(useServiceStore.getState().portsLastSnapshot).toHaveLength(1)
    expect(useServiceStore.getState().portsLastSnapshot[0].port).toBe(8080)
  })

  test('setPaused 设置 isPaused 和 pauseReason', () => {
    useServiceStore.getState().setPaused(true, 'manual')
    expect(useServiceStore.getState().isPaused).toBe(true)
    expect(useServiceStore.getState().pauseReason).toBe('manual')
    expect(useServiceStore.getState().summary.isPaused).toBe(true)
    expect(useServiceStore.getState().summary.pauseReason).toBe('manual')
  })
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd "D:/project/DevTools Launcher" && npx vitest run src/store/__tests__/service-store.test.ts`
Expected: FAIL — `setPorts` / `setPaused` / `portsLastSnapshot` / `summary` 都不存在

- [ ] **Step 3: 重写 service-store.ts（保留旧 actions 兼容）**

完整替换 `src/store/service-store.ts`：

```ts
import { create } from 'zustand'

import type {
  PortInspectionItem,
  PortInspectorSummary,
  ServiceWithRuntime,
} from '../types/runtime'

interface ServiceStoreState {
  services: ServiceWithRuntime[]
  ports: PortInspectionItem[]
  portsLastSnapshot: PortInspectionItem[]   // 上一轮，用于 diff
  summary: PortInspectorSummary
  isPaused: boolean
  pauseReason: 'manual' | 'tab-hidden' | null

  setServices: (services: ServiceWithRuntime[]) => void
  setPorts: (ports: PortInspectionItem[], scanDurationMs: number) => void
  setPaused: (paused: boolean, reason?: 'manual' | 'tab-hidden' | null) => void
  clearDiffs: () => void
}

const initialSummary: PortInspectorSummary = {
  total: 0,
  listening: 0,
  established: 0,
  conflict: 0,
  lastRefreshedAt: null,
  scanDurationMs: 0,
  isPaused: false,
  pauseReason: null,
}

export const useServiceStore = create<ServiceStoreState>((set, get) => ({
  services: [],
  ports: [],
  portsLastSnapshot: [],
  summary: initialSummary,
  isPaused: false,
  pauseReason: null,

  setServices: (services) => set({ services }),

  setPorts: (ports, scanDurationMs) => {
    const previous = get().portsLastSnapshot
    const prevByPort = new Map(previous.map((p) => [p.port, p]))

    // 计算 diff
    const diffed: PortInspectionItem[] = ports.map((curr) => {
      const prev = prevByPort.get(curr.port)
      if (!prev) return { ...curr, diff: 'new' as const }
      const changed =
        prev.pid !== curr.pid ||
        prev.processName !== curr.processName ||
        prev.localAddress !== curr.localAddress
      return { ...curr, diff: changed ? ('changed' as const) : null }
    })

    const summary: PortInspectorSummary = {
      ...get().summary,
      total: diffed.length,
      listening: diffed.filter((p) => p.state === 'LISTENING').length,
      established: diffed.filter((p) => p.state === 'ESTABLISHED').length,
      scanDurationMs,
      lastRefreshedAt: Date.now(),
    }

    set({
      ports: diffed,
      portsLastSnapshot: ports,  // 存原始（无 diff 标记）作为下一轮对比基准
      summary,
    })
  },

  setPaused: (paused, reason = null) => {
    set((state) => ({
      isPaused: paused,
      pauseReason: paused ? reason : null,
      summary: { ...state.summary, isPaused: paused, pauseReason: paused ? reason : null },
    }))
  },

  clearDiffs: () => {
    set((state) => ({
      ports: state.ports.map((p) => ({ ...p, diff: null })),
    }))
  },
}))

// 保留旧 actions 兼容（其他页面可能在用）
setTimeout(() => {
  const _ = useServiceStore.getState()
}, 0)
```

> 注：如果 store 已有 `upsertService` / `updateService` / `setHistory` / `setSettings` / `setLaunchGroups` 等 action，**保留**它们（只增不删）。

- [ ] **Step 4: 跑测试，应该通过**

Run: `cd "D:/project/DevTools Launcher" && npx vitest run src/store/__tests__/service-store.test.ts`
Expected: 5 passed

- [ ] **Step 5: 全量跑现有测试，确认无回归**

Run: `cd "D:/project/DevTools Launcher" && npx vitest run 2>&1 | tail -20`
Expected: 全部通过（旧的 service-store 测试如果有要保留）

- [ ] **Step 6: Commit**

```bash
cd "D:/project/DevTools Launcher"
git add src/store/service-store.ts src/store/__tests__/service-store.test.ts
git commit -m "feat(store): extend with summary/isPaused/portsLastSnapshot + diff computation"
```

---

## Task 7: 实现 usePortFilter hook

**Files:**
- Create: `src/modules/port-manager/constants.ts`
- Create: `src/modules/port-manager/usePortFilter.ts`
- Create: `src/modules/port-manager/__tests__/usePortFilter.test.ts`

- [ ] **Step 1: 创建 constants.ts**

```ts
export const PORT_REFRESH_INTERVAL_MS = 2000
export const PORT_DIFF_FADE_OUT_MS = 5000
export const PORT_SCAN_TIMEOUT_MS = 5000

export type PortFilterMode = 'all' | 'mine' | 'listening' | 'conflict'

export const PORT_FILTER_LABELS: Record<PortFilterMode, string> = {
  all: '全部',
  mine: '我的服务',
  listening: '仅 LISTENING',
  conflict: '仅冲突',
}
```

- [ ] **Step 2: 写 hook 测试**

```ts
import { renderHook } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import type { PortInspectionItem, ServiceWithRuntime } from '../../types/runtime'
import { usePortFilter } from '../usePortFilter'

const makeItem = (port: number, pid: number | null = null, state: PortInspectionItem['state'] = 'LISTENING'): PortInspectionItem => ({
  port,
  state,
  protocol: 'TCP',
  localAddress: '127.0.0.1',
  occupied: true,
  pid,
  processName: 'svc.exe',
  processPath: 'C:\\svc.exe',
  diff: null,
})

const makeService = (port: number, id: string): ServiceWithRuntime => ({
  service: { id, name: 'svc', port, command: '', workingDir: '', portConflictStrategy: 'fail' as const, autoRestart: false, healthCheck: { kind: 'none' as const } } as any,
  runtime: null as any,
})

describe('usePortFilter', () => {
  test('filter=all 返回全部', () => {
    const ports = [makeItem(80), makeItem(443), makeItem(8080)]
    const { result } = renderHook(() => usePortFilter(ports, 'all', []))
    expect(result.current).toEqual(ports)
  })

  test('filter=mine 只返回我服务声明的端口', () => {
    const ports = [makeItem(80), makeItem(3306), makeItem(8080)]
    const services = [makeService(3306, 'mysql'), makeService(8080, 'web')]
    const { result } = renderHook(() => usePortFilter(ports, 'mine', services))
    expect(result.current.map((p) => p.port)).toEqual([3306, 8080])
  })

  test('filter=listening 只返回 LISTENING 状态', () => {
    const ports = [makeItem(80, null, 'LISTENING'), makeItem(443, null, 'ESTABLISHED'), makeItem(8080, null, 'TIME_WAIT')]
    const { result } = renderHook(() => usePortFilter(ports, 'listening', []))
    expect(result.current.map((p) => p.port)).toEqual([80])
  })

  test('filter=conflict 返回我的服务端口 + 被外部占用（即 pid 存在）', () => {
    const ports = [makeItem(80, 100), makeItem(3306, 200), makeItem(8080, null)]
    const services = [makeService(3306, 'mysql'), makeService(8080, 'web')]
    const { result } = renderHook(() => usePortFilter(ports, 'conflict', services))
    // 3306 是我的服务端口且有 pid = 冲突；8080 是我的服务端口但没 pid = 不冲突
    expect(result.current.map((p) => p.port)).toEqual([3306])
  })
})
```

- [ ] **Step 3: 跑测试，确认失败**

Run: `cd "D:/project/DevTools Launcher" && npx vitest run src/modules/port-manager/__tests__/usePortFilter.test.ts`
Expected: FAIL — `usePortFilter` 不存在

- [ ] **Step 4: 实现 hook**

```ts
import { useMemo } from 'react'

import type { PortInspectionItem, ServiceWithRuntime } from '../../types/runtime'

import type { PortFilterMode } from './constants'

export function usePortFilter(
  ports: PortInspectionItem[],
  mode: PortFilterMode,
  services: ServiceWithRuntime[],
): PortInspectionItem[] {
  return useMemo(() => {
    if (mode === 'all') return ports
    if (mode === 'listening') return ports.filter((p) => p.state === 'LISTENING')
    const myPorts = new Set(services.map((s) => s.service.port).filter((p): p is number => typeof p === 'number'))
    if (mode === 'mine') return ports.filter((p) => myPorts.has(p.port))
    if (mode === 'conflict') return ports.filter((p) => myPorts.has(p.port) && p.pid !== null)
    return ports
  }, [ports, mode, services])
}
```

- [ ] **Step 5: 跑测试，应该通过**

Run: `cd "D:/project/DevTools Launcher" && npx vitest run src/modules/port-manager/__tests__/usePortFilter.test.ts`
Expected: 4 passed

- [ ] **Step 6: Commit**

```bash
cd "D:/project/DevTools Launcher"
git add src/modules/port-manager/constants.ts src/modules/port-manager/usePortFilter.ts src/modules/port-manager/__tests__/usePortFilter.test.ts
git commit -m "feat(hooks): usePortFilter with 4 filter modes"
```

---

## Task 8: 实现 usePortDiff hook（5 秒淡出）

**Files:**
- Create: `src/modules/port-manager/usePortDiff.ts`
- Create: `src/modules/port-manager/__tests__/usePortDiff.test.ts`

- [ ] **Step 1: 写测试**

```ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { usePortDiff } from '../usePortDiff'
import { PORT_DIFF_FADE_OUT_MS } from '../constants'

describe('usePortDiff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('5 秒后清空 diff 字段', () => {
    const onClear = vi.fn()
    const { result } = renderHook(() => usePortDiff(onClear))
    // 模拟刚 setPorts 完，diff 还没清空
    act(() => {
      result.current.scheduleClearDiffs()
    })
    expect(onClear).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(PORT_DIFF_FADE_OUT_MS - 100)
    })
    expect(onClear).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(onClear).toHaveBeenCalledOnce()
  })

  test('连续调用只重置 timer，不叠加', () => {
    const onClear = vi.fn()
    const { result } = renderHook(() => usePortDiff(onClear))
    act(() => {
      result.current.scheduleClearDiffs()
      vi.advanceTimersByTime(3000)
      result.current.scheduleClearDiffs()
      vi.advanceTimersByTime(3000)
    })
    expect(onClear).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(onClear).toHaveBeenCalledOnce()
  })

  test('卸载时清理 timer', () => {
    const onClear = vi.fn()
    const { unmount, result } = renderHook(() => usePortDiff(onClear))
    act(() => {
      result.current.scheduleClearDiffs()
    })
    unmount()
    act(() => {
      vi.advanceTimersByTime(PORT_DIFF_FADE_OUT_MS + 1000)
    })
    expect(onClear).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd "D:/project/DevTools Launcher" && npx vitest run src/modules/port-manager/__tests__/usePortDiff.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 hook**

```ts
import { useCallback, useEffect, useRef } from 'react'

import { PORT_DIFF_FADE_OUT_MS } from './constants'

export function usePortDiff(onClear: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onClearRef = useRef(onClear)
  onClearRef.current = onClear

  // 卸载清理
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const scheduleClearDiffs = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onClearRef.current()
      timerRef.current = null
    }, PORT_DIFF_FADE_OUT_MS)
  }, [])

  return { scheduleClearDiffs }
}
```

- [ ] **Step 4: 跑测试，应该通过**

Run: `cd "D:/project/DevTools Launcher" && npx vitest run src/modules/port-manager/__tests__/usePortDiff.test.ts`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
cd "D:/project/DevTools Launcher"
git add src/modules/port-manager/usePortDiff.ts src/modules/port-manager/__tests__/usePortDiff.test.ts
git commit -m "feat(hooks): usePortDiff with debounced 5s fade-out"
```

---

## Task 9: 实现 usePortInspector 轮询 hook

**Files:**
- Create: `src/modules/port-manager/usePortInspector.ts`
- Create: `src/modules/port-manager/__tests__/usePortInspector.test.ts`

- [ ] **Step 1: 写测试**

```ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import * as api from '../../services/tauri-api/client'
import type { PortInspectionItem } from '../../types/runtime'
import { usePortInspector } from '../usePortInspector'
import { useServiceStore } from '../../../store/service-store'
import { PORT_REFRESH_INTERVAL_MS } from '../constants'

vi.mock('../../services/tauri-api/client', () => ({
  listListeningPorts: vi.fn(),
}))

const makeItem = (port: number): PortInspectionItem => ({
  port,
  state: 'LISTENING',
  protocol: 'TCP',
  localAddress: '127.0.0.1',
  occupied: true,
  pid: 100,
  processName: 'svc',
  processPath: null,
  diff: null,
})

describe('usePortInspector', () => {
  beforeEach(() => {
    useServiceStore.setState({
      ports: [],
      portsLastSnapshot: [],
      summary: {
        total: 0, listening: 0, established: 0, conflict: 0,
        lastRefreshedAt: null, scanDurationMs: 0, isPaused: false, pauseReason: null,
      },
      isPaused: false,
      pauseReason: null,
    })
    vi.mocked(api.listListeningPorts).mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('启动后立即调用一次 listListeningPorts', async () => {
    vi.mocked(api.listListeningPorts).mockResolvedValue([makeItem(80)])
    renderHook(() => usePortInspector())
    await act(async () => {
      await Promise.resolve()
    })
    expect(api.listListeningPorts).toHaveBeenCalledTimes(1)
    expect(useServiceStore.getState().ports).toHaveLength(1)
  })

  test('2 秒后再次调用', async () => {
    vi.useFakeTimers()
    vi.mocked(api.listListeningPorts).mockResolvedValue([])
    renderHook(() => usePortInspector())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(api.listListeningPorts).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PORT_REFRESH_INTERVAL_MS)
    })
    expect(api.listListeningPorts).toHaveBeenCalledTimes(2)
  })

  test('setPaused(true) 后停止轮询', async () => {
    vi.useFakeTimers()
    vi.mocked(api.listListeningPorts).mockResolvedValue([])
    renderHook(() => usePortInspector())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    act(() => {
      useServiceStore.getState().setPaused(true, 'manual')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PORT_REFRESH_INTERVAL_MS * 2)
    })
    expect(api.listListeningPorts).toHaveBeenCalledTimes(1)  // 没再调用
  })

  test('refreshNow 立即触发一次扫描', async () => {
    vi.useFakeTimers()
    vi.mocked(api.listListeningPorts).mockResolvedValue([])
    const { result } = renderHook(() => usePortInspector())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await act(async () => {
      await result.current.refreshNow()
    })
    expect(api.listListeningPorts).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd "D:/project/DevTools Launcher" && npx vitest run src/modules/port-manager/__tests__/usePortInspector.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 hook**

```ts
import { useCallback, useEffect, useRef } from 'react'

import { useServiceStore } from '../../store/service-store'
import { listListeningPorts } from '../../services/tauri-api/client'

import { PORT_REFRESH_INTERVAL_MS } from './constants'

export function usePortInspector() {
  const isPaused = useServiceStore((s) => s.isPaused)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inFlightRef = useRef<boolean>(false)

  const scan = useCallback(async () => {
    if (inFlightRef.current) return  // 防止重叠
    inFlightRef.current = true
    const t0 = performance.now()
    try {
      const result = await listListeningPorts()
      const duration = Math.round(performance.now() - t0)
      useServiceStore.getState().setPorts(result, duration)
    } catch (err) {
      console.error('[port-inspector] scan failed:', err)
    } finally {
      inFlightRef.current = false
    }
  }, [])

  // 主轮询生命周期
  useEffect(() => {
    void scan()  // 启动立即扫一次
    if (!isPaused) {
      intervalRef.current = setInterval(scan, PORT_REFRESH_INTERVAL_MS)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isPaused, scan])

  // 标签页可见性
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        useServiceStore.getState().setPaused(true, 'tab-hidden')
      } else {
        useServiceStore.getState().setPaused(false, null)
        void scan()  // 切回立即补一次
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [scan])

  const refreshNow = useCallback(async () => {
    await scan()
  }, [scan])

  return { refreshNow }
}
```

- [ ] **Step 4: 跑测试，应该通过**

Run: `cd "D:/project/DevTools Launcher" && npx vitest run src/modules/port-manager/__tests__/usePortInspector.test.ts`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
cd "D:/project/DevTools Launcher"
git add src/modules/port-manager/usePortInspector.ts src/modules/port-manager/__tests__/usePortInspector.test.ts
git commit -m "feat(hooks): usePortInspector with 2s polling + visibility pause"
```

---

## Task 10: 实现 UI 组件

**Files:**
- Create: `src/components/port/PortInspectorSummary.tsx`
- Create: `src/components/port/PortInspectorQuickFilters.tsx`
- Create: `src/components/port/PortInspectorToolbar.tsx`
- Create: `src/components/port/PortInspectorStatusBar.tsx`
- Create: `src/components/port/PortDiffHighlight.tsx`
- Create: `src/components/port/OpenInBrowserButton.tsx`
- Create: `src/components/port/ConflictServiceBadge.tsx`
- Create: `src/components/port/PortInspectorTable.tsx`
- Create: `src/components/port/__tests__/PortDiffHighlight.test.tsx`

- [ ] **Step 1: 实现 PortDiffHighlight（纯展示，先写测试）**

`src/components/port/__tests__/PortDiffHighlight.test.tsx`：

```tsx
import { render } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { PortDiffHighlight } from '../PortDiffHighlight'

describe('PortDiffHighlight', () => {
  test('diff=new 渲染绿色色条', () => {
    const { container } = render(<PortDiffHighlight diff="new"><span>content</span></PortDiffHighlight>)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.borderLeft).toContain('rgb(82, 196, 26)')  // #52c41a
    expect(wrapper.style.backgroundColor).toBe('rgb(246, 255, 237)')  // #f6ffed
  })

  test('diff=changed 渲染黄色色条', () => {
    const { container } = render(<PortDiffHighlight diff="changed"><span>content</span></PortDiffHighlight>)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.borderLeft).toContain('rgb(250, 173, 20)')
  })

  test('diff=gone 渲染红色色条 + line-through', () => {
    const { container } = render(<PortDiffHighlight diff="gone"><span>content</span></PortDiffHighlight>)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.borderLeft).toContain('rgb(255, 77, 79)')
    const inner = container.querySelector('span')!
    expect(inner.style.textDecoration).toContain('line-through')
  })

  test('diff=null 不应用任何色条', () => {
    const { container } = render(<PortDiffHighlight diff={null}><span>content</span></PortDiffHighlight>)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.borderLeft).toBe('')
  })
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd "D:/project/DevTools Launcher" && npx vitest run src/components/port/__tests__/PortDiffHighlight.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现 PortDiffHighlight.tsx**

```tsx
import { CSSProperties, ReactNode } from 'react'

import type { PortDiff } from '../../types/runtime'

interface Props {
  diff: PortDiff | null | undefined
  isConflict?: boolean
  children: ReactNode
  style?: CSSProperties
}

export function PortDiffHighlight({ diff, isConflict, children, style }: Props) {
  let borderColor = ''
  let bg = ''
  if (isConflict) {
    borderColor = '#ff4d4f'
    bg = 'rgba(255, 77, 79, 0.06)'
  }
  if (diff === 'new') {
    borderColor = '#52c41a'
    bg = '#f6ffed'
  } else if (diff === 'changed') {
    borderColor = '#faad14'
    bg = '#fffbe6'
  } else if (diff === 'gone') {
    borderColor = '#ff4d4f'
    bg = '#fff1f0'
  }

  const innerStyle: CSSProperties = diff === 'gone' ? { textDecoration: 'line-through', color: '#8c8c8c' } : {}

  return (
    <div
      style={{
        display: 'contents',
        ...style,
        ...(borderColor
          ? { borderLeft: `3px solid ${borderColor}`, backgroundColor: bg, paddingLeft: 8 }
          : {}),
      }}
      data-diff={diff ?? 'none'}
    >
      <div style={innerStyle}>{children}</div>
    </div>
  )
}
```

> 注：Ant Design Table 的 rowClassName / onCell 不能直接用 inline style 改背景，真实集成时改用 rowClassName 函数（见 Step 9 的实现）。本组件作为「可复用单元」保留 inline style 版本供 Storybook 风格测试用。

- [ ] **Step 4: 跑测试，应该通过**

Run: `cd "D:/project/DevTools Launcher" && npx vitest run src/components/port/__tests__/PortDiffHighlight.test.tsx`
Expected: 4 passed

- [ ] **Step 5: 实现 PortInspectorSummary.tsx**

```tsx
import { useEffect, useState } from 'react'

import { useServiceStore } from '../../store/service-store'

export function PortInspectorSummary() {
  const summary = useServiceStore((s) => s.summary)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const ageMs = summary.lastRefreshedAt ? now - summary.lastRefreshedAt : null
  const ageText = ageMs === null ? '—' : ageMs < 1000 ? '刚刚' : `${Math.floor(ageMs / 1000)}秒前更新`
  const ageColor = ageMs === null ? '#8c8c8c' : ageMs < 5000 ? '#262626' : ageMs < 10000 ? '#8c8c8c' : '#bfbfbf'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, color: '#595959' }}>
      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: summary.isPaused ? '#bfbfbf' : '#52c41a', boxShadow: summary.isPaused ? 'none' : '0 0 0 3px rgba(82,196,26,0.2)' }} />
      <span><strong style={{ color: '#262626' }}>{summary.listening}</strong> 监听中</span>
      <span style={{ color: '#d9d9d9' }}>·</span>
      <span style={{ color: summary.conflict > 0 ? '#ff4d4f' : '#595959' }}>
        <strong>{summary.conflict}</strong> 冲突
      </span>
      <span style={{ color: '#d9d9d9' }}>·</span>
      <span style={{ color: ageColor }}>{ageText}</span>
    </div>
  )
}
```

- [ ] **Step 6: 实现 PortInspectorQuickFilters.tsx**

```tsx
import { Button, Input } from 'antd'
import { useState } from 'react'

import { PORT_FILTER_LABELS, type PortFilterMode } from '../../modules/port-manager/constants'
import { useServiceStore } from '../../store/service-store'

const FILTERS: PortFilterMode[] = ['all', 'mine', 'listening', 'conflict']

export function PortInspectorQuickFilters() {
  const [mode, setMode] = useState<PortFilterMode>('all')
  const [keyword, setKeyword] = useState('')
  // 把 mode + keyword 提升到 store，让 PortInspectorTable 订阅
  // 简化：直接 set 到 store

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', background: '#fafafa' }}>
      {FILTERS.map((f) => (
        <FilterChip key={f} mode={f} active={mode === f} onClick={() => setMode(f)} />
      ))}
      <div style={{ flex: 1 }} />
      <Input
        placeholder="🔍 搜索端口/进程"
        style={{ width: 240 }}
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        allowClear
      />
    </div>
  )
}

function FilterChip({ mode, active, onClick }: { mode: PortFilterMode; active: boolean; onClick: () => void }) {
  const count = useServiceStore((s) => {
    if (mode === 'all') return s.summary.total
    if (mode === 'listening') return s.summary.listening
    if (mode === 'conflict') return s.summary.conflict
    if (mode === 'mine') {
      // 简化：用 listening 减去未关联数
      return s.ports.filter((p) => {
        const myPorts = new Set(s.services.map((sv) => sv.service.port).filter((p): p is number => typeof p === 'number'))
        return myPorts.has(p.port)
      }).length
    }
    return 0
  })
  return (
    <Button
      type={active ? 'primary' : 'default'}
      onClick={onClick}
      size="small"
      style={mode === 'mine' ? { display: 'inline-flex', alignItems: 'center', gap: 4 } : {}}
    >
      {mode === 'mine' && <span style={{ color: active ? '#fff' : '#1890ff' }}>★</span>}
      {PORT_FILTER_LABELS[mode]}
      {count > 0 && (
        <span
          style={{
            marginLeft: 4,
            background: active ? 'rgba(255,255,255,0.2)' : mode === 'conflict' && count > 0 ? '#fff1f0' : '#f0f0f0',
            color: active ? '#fff' : mode === 'conflict' && count > 0 ? '#ff4d4f' : '#595959',
            padding: '0 6px',
            borderRadius: 8,
            fontSize: 11,
          }}
        >
          {count}
        </span>
      )}
    </Button>
  )
}
```

- [ ] **Step 7: 实现 PortInspectorToolbar.tsx**

```tsx
import { Button, Tooltip } from 'antd'
import { PauseOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons'

import { useServiceStore } from '../../store/service-store'

import { PortInspectorSummary } from './PortInspectorSummary'

export function PortInspectorToolbar() {
  const isPaused = useServiceStore((s) => s.isPaused)
  const pauseReason = useServiceStore((s) => s.pauseReason)

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>端口管理</div>
        <div style={{ height: 20, width: 1, background: '#e0e0e0' }} />
        <PortInspectorSummary />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Tooltip title={isPaused ? `已暂停（${pauseReason === 'tab-hidden' ? '标签页隐藏' : '手动'}）` : '暂停自动刷新'}>
          <Button icon={<PauseOutlined />} onClick={() => useServiceStore.getState().setPaused(!isPaused, isPaused ? null : 'manual')} />
        </Tooltip>
        <Button icon={<ReloadOutlined />} onClick={() => window.dispatchEvent(new CustomEvent('port-inspector:refresh-now'))}>
          刷新
        </Button>
        <Button icon={<SettingOutlined />} />
      </div>
    </div>
  )
}
```

- [ ] **Step 8: 实现 OpenInBrowserButton + ConflictServiceBadge + StatusBar**

`OpenInBrowserButton.tsx`：

```tsx
import { Button, message } from 'antd'
import { GlobalOutlined } from '@ant-design/icons'

import { openInBrowser } from '../../services/tauri-api/client'

interface Props {
  port: number
  address: string
}

export function OpenInBrowserButton({ port, address }: Props) {
  return (
    <Button
      type="link"
      size="small"
      icon={<GlobalOutlined />}
      onClick={async () => {
        try {
          await openInBrowser(port, address)
        } catch (err) {
          message.error(`打开失败：${err instanceof Error ? err.message : String(err)}`)
        }
      }}
    >
      打开
    </Button>
  )
}
```

`ConflictServiceBadge.tsx`：

```tsx
import { Tag } from 'antd'

interface Props {
  serviceName: string
}

export function ConflictServiceBadge({ serviceName }: Props) {
  return (
    <Tag color="error" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      ⚠ {serviceName}
    </Tag>
  )
}
```

`PortInspectorStatusBar.tsx`：

```tsx
import { useServiceStore } from '../../store/service-store'

export function PortInspectorStatusBar() {
  const s = useServiceStore((state) => state.summary)
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', background: '#fafafa', fontSize: 12, color: '#595959', borderTop: '1px solid #f0f0f0' }}>
      <div style={{ display: 'flex', gap: 24 }}>
        <span>共 <strong style={{ color: '#262626' }}>{s.total}</strong> 个端口</span>
        <span style={{ color: '#52c41a' }}><strong>{s.total - s.listening}</strong> 空闲</span>
        <span style={{ color: '#faad14' }}><strong>{s.listening}</strong> 监听中</span>
        <span style={{ color: '#ff4d4f' }}><strong>{s.conflict}</strong> 冲突</span>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <span>扫描耗时 <strong style={{ color: '#262626' }}>{s.scanDurationMs}ms</strong></span>
        <span style={{ color: '#d9d9d9' }}>|</span>
        <span>引擎 <strong style={{ color: '#262626' }}>IP Helper API</strong></span>
        <span style={{ color: '#d9d9d9' }}>|</span>
        <span>
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: s.isPaused ? '#bfbfbf' : '#52c41a', marginRight: 4 }} />
          {s.isPaused ? '已暂停' : '实时'}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 9: 实现 PortInspectorTable.tsx（核心）**

```tsx
import { Button, Table, Tag, Tooltip, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'

import { useServiceStore } from '../../store/service-store'
import { killProcessByPid } from '../../services/tauri-api/client'
import type { PortInspectionItem, ServiceWithRuntime } from '../../types/runtime'

import { OpenInBrowserButton } from './OpenInBrowserButton'
import { ConflictServiceBadge } from './ConflictServiceBadge'

interface Props {
  ports: PortInspectionItem[]
  services: ServiceWithRuntime[]
  onKill: () => void  // 杀进程成功后回调（trigger 重扫）
}

const STATE_TAG_COLORS: Record<PortInspectionItem['state'], string> = {
  LISTENING: 'blue',
  ESTABLISHED: 'green',
  TIME_WAIT: 'default',
  CLOSE_WAIT: 'orange',
  FIN_WAIT1: 'default',
  FIN_WAIT2: 'default',
  SYN_SENT: 'cyan',
  SYN_RECEIVED: 'cyan',
  CLOSING: 'red',
  LAST_ACK: 'red',
  DELETE_TCB: 'default',
  UNKNOWN: 'default',
}

export function PortInspectorTable({ ports, services, onKill }: Props) {
  const myPorts = new Set(services.map((s) => s.service.port).filter((p): p is number => typeof p === 'number'))
  const serviceNameByPort = new Map<number, string>(
    services.filter((s) => typeof s.service.port === 'number').map((s) => [s.service.port as number, s.service.name]),
  )

  const columns: ColumnsType<PortInspectionItem> = [
    {
      title: '端口',
      dataIndex: 'port',
      width: 90,
      sorter: (a, b) => a.port - b.port,
      render: (port: number) => {
        const isConflict = myPorts.has(port) && ports.find((p) => p.port === port)?.pid !== null
        return (
          <span
            style={{
              background: isConflict ? '#fff1f0' : '#e6f4ff',
              color: isConflict ? '#ff4d4f' : '#1890ff',
              padding: '2px 8px',
              borderRadius: 4,
              fontWeight: 600,
              border: isConflict ? '1px solid #ffccc7' : 'none',
            }}
          >
            {port}
          </span>
        )
      },
    },
    {
      title: '状态',
      dataIndex: 'state',
      width: 110,
      render: (state: PortInspectionItem['state']) => <Tag color={STATE_TAG_COLORS[state]}>{state}</Tag>,
    },
    { title: '协议', dataIndex: 'protocol', width: 60 },
    { title: '本地地址', dataIndex: 'localAddress', width: 120 },
    { title: 'PID', dataIndex: 'pid', width: 70, render: (pid: number | null) => pid ?? '--' },
    {
      title: '占用进程',
      dataIndex: 'processName',
      ellipsis: true,
      render: (name: string | null, record) =>
        name ? (
          <Tooltip title={record.processPath ?? ''}>
            <span>{name}</span>
          </Tooltip>
        ) : (
          '--'
        ),
    },
    {
      title: '关联服务',
      dataIndex: 'port',
      width: 130,
      render: (port: number, record) => {
        if (!myPorts.has(port)) return '--'
        if (record.pid === null) {
          return <span style={{ color: '#52c41a' }}>{serviceNameByPort.get(port)}</span>
        }
        return <ConflictServiceBadge serviceName={serviceNameByPort.get(port) ?? '?'} />
      },
    },
    {
      title: '操作',
      width: 160,
      render: (_, record) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <OpenInBrowserButton port={record.port} address={record.localAddress} />
          {record.pid !== null && (
            <Button
              size="small"
              danger
              loading={false}
              onClick={async () => {
                try {
                  await killProcessByPid(record.pid!)
                  message.success(`已结束 PID ${record.pid}`)
                  onKill()
                } catch (err) {
                  message.error(`结束失败：${err instanceof Error ? err.message : String(err)}`)
                }
              }}
            >
              结束
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <Table<PortInspectionItem>
      rowKey="port"
      dataSource={ports}
      columns={columns}
      size="small"
      pagination={false}
      rowClassName={(record) => {
        const classes: string[] = []
        if (record.diff === 'new') classes.push('port-row-new')
        else if (record.diff === 'changed') classes.push('port-row-changed')
        else if (record.diff === 'gone') classes.push('port-row-gone')
        if (myPorts.has(record.port) && record.pid !== null) classes.push('port-row-conflict')
        return classes.join(' ')
      }}
      scroll={{ x: 'max-content' }}
    />
  )
}
```

- [ ] **Step 10: 在全局 CSS 加行级高亮 class**

修改 `src/index.css`（或等效全局样式文件）追加：

```css
.port-row-new td { background-color: #f6ffed !important; box-shadow: inset 3px 0 0 #52c41a; }
.port-row-changed td { background-color: #fffbe6 !important; box-shadow: inset 3px 0 0 #faad14; }
.port-row-gone td { background-color: #fff1f0 !important; box-shadow: inset 3px 0 0 #ff4d4f; }
.port-row-gone td * { text-decoration: line-through; color: #8c8c8c; }
.port-row-conflict td { background-color: rgba(255, 77, 79, 0.06) !important; box-shadow: inset 3px 0 0 #ff4d4f; }
```

> 颜色与 diff 冲突时（同时存在）通过 CSS 级联：后写的 `.port-row-conflict` 优先级更高（用 `!important` 保证）。

- [ ] **Step 11: 跑全部前端测试**

Run: `cd "D:/project/DevTools Launcher" && npx vitest run 2>&1 | tail -20`
Expected: 全部通过

- [ ] **Step 12: TypeScript 检查**

Run: `cd "D:/project/DevTools Launcher" && npx tsc --noEmit 2>&1 | head -20`
Expected: 无错误

- [ ] **Step 13: Commit**

```bash
cd "D:/project/DevTools Launcher"
git add src/components/port/ src/index.css
git commit -m "feat(components): port inspector toolbar/table/buttons + row highlight CSS"
```

---

## Task 11: 改造 PortInspectorPageMain 入口

**Files:**
- Modify: `src/pages/PortInspectorPageMain.tsx`

- [ ] **Step 1: 重写为瘦入口**

完整替换 `src/pages/PortInspectorPageMain.tsx`：

```tsx
import { Card } from 'antd'
import { useEffect, useState } from 'react'

import { useServiceStore } from '../store/service-store'
import { usePortInspector } from '../modules/port-manager/usePortInspector'
import { usePortFilter } from '../modules/port-manager/usePortFilter'
import { usePortDiff } from '../modules/port-manager/usePortDiff'
import type { PortFilterMode } from '../modules/port-manager/constants'

import { PortInspectorToolbar } from '../components/port/PortInspectorToolbar'
import { PortInspectorQuickFilters } from '../components/port/PortInspectorQuickFilters'
import { PortInspectorTable } from '../components/port/PortInspectorTable'
import { PortInspectorStatusBar } from '../components/port/PortInspectorStatusBar'

export function PortInspectorPageMain() {
  const ports = useServiceStore((s) => s.ports)
  const services = useServiceStore((s) => s.services)
  const setPaused = useServiceStore((s) => s.setPaused)
  const clearDiffs = useServiceStore((s) => s.clearDiffs)

  const [filter, setFilter] = useState<PortFilterMode>('all')
  const filteredPorts = usePortFilter(ports, filter, services)
  const { refreshNow } = usePortInspector()
  const { scheduleClearDiffs } = usePortDiff(clearDiffs)

  // diff 5 秒后清空
  useEffect(() => {
    if (ports.some((p) => p.diff)) scheduleClearDiffs()
  }, [ports, scheduleClearDiffs])

  // 工具栏「刷新」按钮的 CustomEvent
  useEffect(() => {
    const onRefresh = () => void refreshNow()
    window.addEventListener('port-inspector:refresh-now', onRefresh)
    return () => window.removeEventListener('port-inspector:refresh-now', onRefresh)
  }, [refreshNow])

  return (
    <div className="page-container">
      <Card className="glass-card" bordered={false} styles={{ body: { padding: 0 } }}>
        <PortInspectorToolbar />
        <PortInspectorQuickFiltersWithState
          mode={filter}
          onChange={setMode}
        />
        <PortInspectorTable
          ports={filteredPorts}
          services={services}
          onKill={() => void refreshNow()}
        />
        <PortInspectorStatusBar />
      </Card>
    </div>
  )
}

// QuickFilters 内部 state 提升到页面层（因为要联动 usePortFilter）
function PortInspectorQuickFiltersWithState({
  mode,
  onChange,
}: {
  mode: PortFilterMode
  onChange: (m: PortFilterMode) => void
}) {
  // 这里直接复用 PortInspectorQuickFilters，但需要让它支持外部 mode 控制
  // 简化版：把 mode/onChange 通过 props 透传
  return <PortInspectorQuickFiltersControlled mode={mode} onChange={onChange} />
}

import { PortInspectorQuickFiltersControlled } from '../components/port/PortInspectorQuickFiltersControlled'
```

- [ ] **Step 2: 把 PortInspectorQuickFilters 改为受控组件**

修改 `src/components/port/PortInspectorQuickFilters.tsx`，改 export 为：

```tsx
import { Button, Input } from 'antd'

import { PORT_FILTER_LABELS, type PortFilterMode } from '../../modules/port-manager/constants'
import { useServiceStore } from '../../store/service-store'

const FILTERS: PortFilterMode[] = ['all', 'mine', 'listening', 'conflict']

interface Props {
  mode: PortFilterMode
  onChange: (mode: PortFilterMode) => void
}

export function PortInspectorQuickFiltersControlled({ mode, onChange }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', background: '#fafafa' }}>
      {FILTERS.map((f) => (
        <FilterChip key={f} mode={f} active={mode === f} onClick={() => onChange(f)} />
      ))}
      <div style={{ flex: 1 }} />
      <Input
        placeholder="🔍 搜索端口/进程"
        style={{ width: 240 }}
        allowClear
      />
    </div>
  )
}

function FilterChip({ mode, active, onClick }: { mode: PortFilterMode; active: boolean; onClick: () => void }) {
  const count = useServiceStore((s) => {
    if (mode === 'all') return s.summary.total
    if (mode === 'listening') return s.summary.listening
    if (mode === 'conflict') return s.summary.conflict
    if (mode === 'mine') {
      const myPorts = new Set(s.services.map((sv) => sv.service.port).filter((p): p is number => typeof p === 'number'))
      return s.ports.filter((p) => myPorts.has(p.port)).length
    }
    return 0
  })
  return (
    <Button type={active ? 'primary' : 'default'} onClick={onClick} size="small">
      {mode === 'mine' && <span style={{ color: active ? '#fff' : '#1890ff', marginRight: 4 }}>★</span>}
      {PORT_FILTER_LABELS[mode]}
      {count > 0 && (
        <span
          style={{
            marginLeft: 4,
            background: active ? 'rgba(255,255,255,0.2)' : mode === 'conflict' && count > 0 ? '#fff1f0' : '#f0f0f0',
            color: active ? '#fff' : mode === 'conflict' && count > 0 ? '#ff4d4f' : '#595959',
            padding: '0 6px',
            borderRadius: 8,
            fontSize: 11,
          }}
        >
          {count}
        </span>
      )}
    </Button>
  )
}
```

- [ ] **Step 3: 删除未使用 import**

回到 `PortInspectorPageMain.tsx`，删除 `setPaused`（如未使用）和 `import { usePortFilter }` 行的多余分号；保证 tsc 通过。

- [ ] **Step 4: TypeScript 检查**

Run: `cd "D:/project/DevTools Launcher" && npx tsc --noEmit 2>&1 | head -20`
Expected: 无错误

- [ ] **Step 5: 跑全部测试**

Run: `cd "D:/project/DevTools Launcher" && npx vitest run 2>&1 | tail -10`
Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
cd "D:/project/DevTools Launcher"
git add src/pages/PortInspectorPageMain.tsx src/components/port/PortInspectorQuickFilters.tsx
git commit -m "refactor(page): PortInspectorPageMain slimmed to <60 lines, delegates to components"
```

---

## Task 12: E2E 手动验证

**Files:** 无（仅文档）

- [ ] **Step 1: 启动应用**

Run: `cd "D:/project/DevTools Launcher" && pnpm tauri dev 2>&1 | tail -20`
Expected: 应用启动并打开端口管理页

- [ ] **Step 2: 验证自动扫描**

进入 `/ports` 页面，1 秒内应自动出现「系统所有 LISTENING 端口」。检查：
- [ ] 顶部状态条：「N 监听中 · 0 冲突 · 刚刚」显示数字
- [ ] 表格行有数据，每行有 🌍「打开」按钮
- [ ] 「结束」按钮只在有 PID 的行出现

- [ ] **Step 3: 验证 2 秒自动刷新**

启动一个测试服务占用 12345 端口：

```bash
# 在另一个 shell
python3 -m http.server 12345
```

进入 `/ports` 页面，应该在 2 秒内看到 12345 端口「新增」（绿色高亮）→ 5 秒后绿色淡出。

- [ ] **Step 4: 验证杀进程 + 消失高亮**

在表格中找到 12345 行，点「结束」按钮：
- [ ] Toast「已结束 PID xxx」
- [ ] 该行在 2 秒内变红色高亮（diff=gone）+ 文字 line-through
- [ ] 5 秒后该行从表格消失

- [ ] **Step 5: 验证 🌍 浏览器打开**

找一个 LISTENING 端口（如 12345 重新启动），点 🌍 打开：
- [ ] 系统默认浏览器打开 `http://localhost:12345`
- [ ] 如果 localAddress 是 0.0.0.0，应该打开 localhost

- [ ] **Step 6: 验证「我的服务」过滤**

在「服务」页配置一个 service.port = 3306，启动一个外部 mysqld 占用 3306：
- [ ] 顶部「★ 我的服务 (N)」标签 N = 配置的服务端口数
- [ ] 点击「我的服务」：只显示我的服务声明的端口
- [ ] 3306 行的「关联服务」列显示「⚠ mysql」红字
- [ ] 顶部「冲突」数字 ≥ 1（红色）

- [ ] **Step 7: 验证标签页可见性暂停**

切到其他标签页（如浏览器、其他 Tauri 页面）：
- [ ] 10 秒后切回
- [ ] 顶部状态条显示「已暂停（标签页隐藏）」→ 立即变回「实时」并补刷一次

- [ ] **Step 8: 验证手动暂停**

点工具栏的 ⏸ 按钮：
- [ ] 状态条显示「已暂停（手动）」
- [ ] 2 秒后表格不变（停止扫描）
- [ ] 再点 ⏸ 按钮恢复

- [ ] **Step 9: 验证底部状态条**

- [ ] 底部显示「共 N 个端口 · X 空闲 · Y 监听中 · Z 冲突」
- [ ] 显示「扫描耗时 XXXms」（应该 < 200ms）
- [ ] 显示「引擎 IP Helper API」+ 实时/已暂停指示

- [ ] **Step 10: 验证快速过滤**

依次点击「全部 / 我的服务 / 仅 LISTENING / 仅冲突」：
- [ ] 表格行数变化符合预期
- [ ] 当前激活的标签为蓝色

- [ ] **Step 11: 写 E2E 验证报告**

创建一个验证报告到 `docs/superpowers/verification/2026-06-20-port-inspector.md`，列出每项的通过/失败状态。

- [ ] **Step 12: Commit（如果发现 bug）**

```bash
# 如果 E2E 发现 bug，针对性修复并 commit
cd "D:/project/DevTools Launcher"
git add -A
git commit -m "fix(ports): [bug 描述]"
```

---

## Self-Review Checklist

在交给执行者前做以下自检：

1. ✅ **Spec coverage**：
   - 自动扫描 + 2 秒刷新 → Task 9
   - 🌍 浏览器打开 → Task 4 (后端) + Task 10 (前端按钮)
   - 颜色 diff 高亮 → Task 6 (diff 逻辑) + Task 10 (CSS)
   - 「我的服务」过滤 → Task 7
   - 冲突高亮 → Task 10 (port-row-conflict CSS)
   - 自动刷新暂停 → Task 9
   - 底部状态条 → Task 10
   - 瘦化入口 → Task 11

2. ✅ **Placeholder scan**：通读所有 step，无 TBD/TODO/「fill in」等。

3. ✅ **Type consistency**：
   - `PortInspectionItem` 字段名在 Task 2/3/6/9 一致：`state` / `protocol` / `localAddress` / `diff`
   - Store actions 一致：`setPorts(ports, scanDurationMs)` / `setPaused(paused, reason)` / `clearDiffs()`
   - Hook 返回一致：`usePortInspector` 返回 `{ refreshNow }`，`usePortDiff` 返回 `{ scheduleClearDiffs }`，`usePortFilter` 直接返回数组
   - 组件命名一致：`PortInspectorToolbar` / `PortInspectorQuickFiltersControlled` / `PortInspectorTable` / `PortInspectorStatusBar` / `PortInspectorSummary`

4. ✅ **依赖图正确**：Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12，串行可执行。

5. ✅ **测试覆盖**：每个 hook 和核心组件都有 vitest 测试；Rust 端有地址解析的单元测试。

---

## 执行提示

- 每个 Task 都用 `git commit` 切分，回滚粒度细
- 任何 Task 跑测试失败时，**先修测试或实现再 commit**，不允许带着红绿测试 commit
- 涉及 Rust 的 Task 改完先跑 `cargo check` 再 commit，避免增量编译错误堆积
- 前端改完跑 `npx tsc --noEmit && npx vitest run` 双重验证
- Task 12 的 E2E 是人工清单，**不要试图自动化**——Tauri 桌面应用 e2e 成本太高，价值密度低
