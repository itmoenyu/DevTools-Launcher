# 端口管理页面重构 — 设计文档

**日期**: 2026-06-20
**作者**: 协作设计（用户 + ZCode）
**状态**: 待用户审阅

---

## 1. 背景与目标

### 1.1 当前问题

`/ports` 页面（`src/pages/PortInspectorPageMain.tsx`）采用「**用户输入端口号 → 点击「检查」按钮 → 一次性查询**」的交互模式。

**核心问题**：
1. 用户必须先知道自己想查哪些端口，才能检查——对刚启动服务、想确认「我配置的 8080 是不是被占」的人不友好
2. 没有任何「系统视角」——只看得到自己输入的那几个端口
3. 检查结果是静态的——杀完进程需要手动再点检查
4. 无法直接跳到对应服务（缺「在浏览器打开」操作）

### 1.2 设计目标

将端口管理页面从「**手工输入 → 一次性查询**」重构为「**自动发现系统所有 LISTENING 端口 → 实时刷新 → 一键操作**」的主流端口监控工具体验（对标 CurrPorts / TCPView / Docker Desktop / VS Code Ports）。

### 1.3 成功标准

| 指标 | 现状 | 目标 |
|---|---|---|
| 进入页面到看到系统所有监听端口的时间 | 需手动输入+点击 | **< 500ms（自动）** |
| 检测到端口被占到能跳到浏览器 | 4 步（输入→点检查→找行→看路径） | **1 步（点 🌍 按钮）** |
| 杀进程后页面是否自动更新 | 手动 | **< 2 秒（自动）** |
| 与当前「已配置服务」的冲突可见性 | 仅在表格中文字提示 | **顶部红色冲突计数 + 整行高亮** |

---

## 2. 范围

### 2.1 In Scope

- 后端 Rust 新增 `list_listening_ports` 命令，基于 Windows IP Helper API（`Iphlpapi.dll`）
- 前端重构 `PortInspectorPageMain.tsx`
  - 顶部工具栏改为两行分层布局
  - 表格加颜色 diff 高亮（新增/变更/消失）
  - 行内加「🌍 在浏览器打开」按钮
  - 加「⏸ 暂停刷新」按钮
  - 加底部状态条（汇总 + 扫描耗时 + 引擎）
- Zustand store 扩展：`ports` 数组 + `lastRefreshedAt` + `isPaused`
- 快捷过滤标签：「全部 / 我的服务 / 仅 LISTENING / 仅冲突」
- 新增「`open_in_browser`」Tauri 命令

### 2.2 Out of Scope（本期不做）

- 跨平台（macOS / Linux）支持——项目是 Windows Tauri 桌面应用
- UDP 端口详细展示——首版只列 TCP（用户场景 99% 是 TCP 服务端口）
- 历史趋势/图表——可作下期
- 远程主机端口扫描——不做
- 端口的权限提升 / 系统服务级操作——不做

---

## 3. 架构

### 3.1 数据流

```
[用户进入 /ports 页面]
   ↓
[PortInspectorPageMain 挂载]
   ↓
[useEffect: 启动 setInterval(2000ms) 轮询]
   ↓
[invoke('list_listening_ports')] → [Rust: list_listening_ports() via IP Helper API]
   ↓                                       ↓
[返回 PortInspectionItem[]]  ←  [GetExtendedTcpTable + GetExtendedUdpTable]
   ↓
[前端 diff 与上一次结果]
   ↓
[标记新增/变更/消失] → [setPorts() 到 Zustand]
   ↓
[Table 渲染（含行背景色 + 左侧色条）]
```

### 3.2 模块切分

```
src/
├── pages/
│   └── PortInspectorPageMain.tsx          # 页面入口（瘦化，只做 layout + 订阅 store）
├── modules/
│   └── port-manager/                       # 已有空目录，现填充
│       ├── usePortInspector.ts             # 轮询 hook（暂停/恢复/可见性感知）
│       ├── usePortFilter.ts                # 过滤逻辑（全部/我的服务/LISTENING/冲突）
│       ├── usePortDiff.ts                  # 计算新增/变更/消失
│       └── constants.ts                    # 刷新间隔、淡出时间等
├── components/
│   └── port/                                # 已有空目录，现填充
│       ├── PortInspectorToolbar.tsx        # 顶部两行工具栏
│       ├── PortInspectorQuickFilters.tsx   # 快捷过滤标签
│       ├── PortInspectorSummary.tsx        # 状态条（47 监听 / 3 冲突 / 2秒前）
│       ├── PortInspectorStatusBar.tsx      # 底部状态条
│       ├── PortInspectorTable.tsx          # 表格（含颜色 diff 行 + 操作列）
│       ├── PortDiffHighlight.tsx           # 单元：新增/变更/消失标记
│       └── OpenInBrowserButton.tsx         # 🌍 按钮（包装 invoke('open_in_browser')）
├── store/
│   └── service-store.ts                     # 扩展：lastRefreshedAt, isPaused, portsWithDiff
├── services/
│   └── tauri-api/
│       └── client.ts                        # 新增 listListeningPorts(), openInBrowser()
└── types/
    └── runtime.ts                           # 扩展：PortInspectionItem 加 state/localAddress

src-tauri/src/
├── port/
│   ├── ip_helper.rs                         # 新增：Windows IP Helper API 封装
│   ├── process_lookup.rs                    # 已有：保留，给 ip_helper 调用
│   └── port_detector.rs                     # 改：list_listening_ports 入口
├── commands/
│   └── mod.rs                                # 注册 list_listening_ports + open_in_browser
└── lib.rs                                    # 注册新命令
```

### 3.3 类型契约

```rust
// src-tauri/src/port/ip_helper.rs
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortInspectionItem {
    pub port: u16,
    pub state: TcpState,             // NEW: LISTENING / ESTABLISHED / TIME_WAIT / CLOSE_WAIT
    pub protocol: Protocol,          // NEW: Tcp / Udp（首版只返回 Tcp）
    pub local_address: String,      // NEW: "127.0.0.1" | "0.0.0.0" | "192.168.x.x" | "[::]"
    pub pid: Option<u32>,
    pub process_name: Option<String>,
    pub process_path: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize)]
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

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Protocol { Tcp, Udp }
```

```ts
// src/types/runtime.ts
export interface PortInspectionItem {
  port: number
  state: TcpState
  protocol: 'TCP' | 'UDP'
  localAddress: string
  occupied: boolean  // 兼容旧字段：当 state === LISTENING 时为 true
  pid: number | null
  processName: string | null
  processPath: string | null
  // —— 前端 diff 计算结果，不来自后端 ——
  diff?: 'new' | 'changed' | 'gone' | null  // 5 秒后自动清空
}

export type TcpState =
  | 'LISTENING' | 'ESTABLISHED' | 'TIME_WAIT' | 'CLOSE_WAIT'
  | 'FIN_WAIT1' | 'FIN_WAIT2' | 'SYN_SENT' | 'SYN_RECEIVED'
  | 'CLOSING' | 'LAST_ACK' | 'DELETE_TCB' | 'UNKNOWN'

export interface PortInspectorSummary {
  total: number
  listening: number
  established: number
  conflict: number  // 与已配置服务冲突的端口数
  lastRefreshedAt: number | null
  scanDurationMs: number
  isPaused: boolean
  pauseReason: 'manual' | 'tab-hidden' | null
}
```

### 3.4 Zustand Store 扩展

```ts
// src/store/service-store.ts —— 在现有 ports 之上扩展
interface ServiceStore {
  ports: PortInspectionItem[]           // 已有，类型扩展
  portsLastSnapshot: PortInspectionItem[] // 上一轮快照（用于 diff）
  summary: PortInspectorSummary         // 新增
  isPaused: boolean                     // 新增
  pauseReason: 'manual' | 'tab-hidden' | null  // 新增

  setPorts: (ports: PortInspectionItem[], scanDurationMs: number) => void
  setPaused: (paused: boolean, reason?: 'manual' | 'tab-hidden' | null) => void
}
```

`setPorts` action 内部完成 diff 计算，写入 `diff` 字段；5 秒后调用 `clearDiffs()` action 清空（用 `setTimeout`）。

---

## 4. 关键交互细节

### 4.1 顶部工具栏（两行分层）

```
┌─────────────────────────────────────────────────────────────────────┐
│ 端口管理  │ ● 47 监听中 · 3 冲突 · 2秒前更新          [⏸] [🔄]  [⚙] │  ← 第一行
├─────────────────────────────────────────────────────────────────────┤
│ [全部 47] [★ 我的服务 12] [仅 LISTENING] [仅冲突 3]      [🔍 搜索…] │  ← 第二行
└─────────────────────────────────────────────────────────────────────┘
```

- **状态摘要行**：标题与「47 监听中 · 3 冲突 · 2秒前更新」之间用竖线分隔
- 「3 冲突」标红色，符合告警语义
- 「2秒前更新」颜色随时间衰减：< 5s 深灰，5–10s 中灰，> 10s 浅灰
- **过滤标签行**：左侧 4 个 chip，右侧搜索框；「我的服务」带 ★ 图标

### 4.2 表格列定义

| 列 | 宽度 | 内容 | 排序 | 备注 |
|---|---|---|---|---|
| 端口 | 80px | 蓝色 chip（占用中红，冲突深红） | ✓ | |
| 状态 | 100px | Tag（LISTENING=蓝、ESTABLISHED=绿、TIME_WAIT=灰） | ✓ | |
| 协议 | 60px | TCP/UDP 小字 | | |
| 本地地址 | 120px | 127.0.0.1 / 0.0.0.0 / 具体 IP | | 关系「是否对外可访问」 |
| PID | 70px | 数字 | ✓ | |
| 占用进程 | flex | 进程名 + 路径 tooltip | | |
| 关联服务 | 120px | 「⚠ 服务名」红字（冲突时） | | |
| 操作 | 120px | [🌍 打开] [结束]（占用才有） | | |

### 4.3 颜色 diff 高亮（行级）

| 变化类型 | 触发条件 | 视觉表现 | 持续时间 |
|---|---|---|---|
| **新增** | 上一轮无、本轮有 | 整行 `#f6ffed`（淡绿）+ 左侧 3px `#52c41a` 色条 | 5 秒后淡出 |
| **变更** | 端口有但 PID/进程/地址变了 | 整行 `#fffbe6`（淡黄）+ 左侧 3px `#faad14` 色条 | 5 秒后淡出 |
| **消失** | 上一轮有、本轮无 | 整行 `#fff1f0`（淡红）+ 左侧 3px `#ff4d4f` 色条 + 文字 line-through | 5 秒后整行移除 |

**冲突行**（被「我的服务」占用的端口）：左侧 3px 红色色条 + 行背景 `rgba(255,77,79,0.06)`，与 diff 红色不冲突，**与 diff 同时存在时取更严重者**（冲突 > 消失 > 变更 > 新增）。

### 4.4 自动刷新行为

| 触发 | 行为 |
|---|---|
| 页面挂载 | 立即执行 1 次扫描 + 启动 setInterval(2000) |
| 用户点击 🔄 按钮 | 立即扫描，不重置 interval |
| 用户点击 ⏸ 按钮 | 清除 interval，summary.isPaused = true, pauseReason = 'manual' |
| 标签页 visibilitychange→hidden | 清除 interval，pauseReason = 'tab-hidden' |
| 标签页 visibilitychange→visible | 立即扫描 + 启动 interval |
| 杀进程成功 | 立即扫描（不等 2 秒） |
| 用户在「服务」页启动服务 | 主动调用扫描（避免等 2 秒） |

### 4.5 操作列行为

```
[🌍 打开]  [结束]
  ↑           ↑
  主按钮     次按钮（危险）
  (Primary)  (Danger, 仅占用行)
```

- **🌍 打开**：调用 `invoke('open_in_browser', { port, address })`，后端用 `webbrowser::open()` 或 Windows `ShellExecute`
  - 当 `localAddress` 是 `0.0.0.0` 或 `127.0.0.1` 时，打开 `http://localhost:<port>`
  - 当 `localAddress` 是具体 IP 时，打开 `http://<localAddress>:<port>`
- **结束**：复用现有 `killProcessByPid` 逻辑；成功后自动触发扫描

### 4.6 「我的服务」过滤逻辑

```ts
const myServicePorts = useMemo(() =>
  services.flatMap(s => s.port ? [s.port] : []), [services])

const filteredPorts = useMemo(() => {
  if (filter === 'mine') return ports.filter(p => myServicePorts.includes(p.port))
  if (filter === 'listening') return ports.filter(p => p.state === 'LISTENING')
  if (filter === 'conflict') return ports.filter(p => myServicePorts.includes(p.port) && p.pid !== null)
  return ports
}, [filter, ports, myServicePorts])
```

**冲突定义**：端口被「我的服务」声明，但 `pid` 不在当前 DevTools Launcher 管理的进程范围内（即「外部进程抢占」）。

---

## 5. 后端实现要点

### 5.1 Cargo.toml 新增依赖

```toml
[target.'cfg(windows)'.dependencies]
windows = { version = "0.58", features = [
  "Win32_Networking_WinSock",
  "Win32_Foundation",
  "Win32_System_Threading",
] }
```

（`windows-sys` 也可，体积小但 API 较繁琐；`windows` 写起来更舒服，约 200KB 编译产物。）

### 5.2 ip_helper.rs 核心

```rust
// 伪代码示意
pub fn list_listening_ports() -> Result<Vec<PortInspectionItem>> {
    let mut items = Vec::new();

    // 1. TCP LISTENING
    let mut tcp_table: Vec<MIB_TCPROW_OWNER_PID> = Vec::new();
    let mut size = 0u32;
    GetExtendedTcpTable(
        None, &mut size, false, AF_INET.0,
        TCP_TABLE_OWNER_PID_LISTENER, // 关键：只拿 LISTENING
    ).ok(); // 第一次必失败，拿到所需 size
    let mut buf = vec![0u8; size as usize];
    GetExtendedTcpTable(
        Some(&mut buf), &mut size, false, AF_INET.0,
        TCP_TABLE_OWNER_PID_LISTENER,
    )?;
    // parse buf → rows
    for row in rows {
        items.push(PortInspectionItem {
            port: u16::from_be(row.dwLocalPort as u16).to_be(),
            // ... 解析地址，处理网络字节序
            state: TcpState::Listening,
            pid: Some(row.dwOwningPid),
            // process_name/process_path 后续批量查
        });
    }

    // 2. 去重 PID → 批量查 process_name / process_path
    let unique_pids: HashSet<u32> = items.iter().filter_map(|i| i.pid).collect();
    let mut info_cache: HashMap<u32, (String, String)> = HashMap::new();
    for pid in unique_pids {
        info_cache.insert(pid, lookup_process_info(pid)?);
    }

    // 3. 回填
    for item in &mut items {
        if let Some(pid) = item.pid {
            if let Some((name, path)) = info_cache.get(&pid) {
                item.process_name = Some(name.clone());
                item.process_path = Some(path.clone());
            }
        }
    }

    Ok(items)
}
```

**首版只做 TCP_LISTENING**（不返回 ESTABLISHED 等其他状态、不做 UDP）—— 用户的核心场景是「我的服务能不能启动」，只需确认目标端口是否被占。后续可扩展。

### 5.3 命令注册

```rust
// src-tauri/src/commands/port.rs
#[tauri::command]
pub async fn list_listening_ports() -> Result<Vec<PortInspectionItem>, String> {
    ip_helper::list_listening_ports().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_in_browser(port: u16, address: String) -> Result<(), String> {
    let url = if address == "0.0.0.0" || address == "127.0.0.1" || address == "[::]" {
        format!("http://localhost:{}", port)
    } else {
        format!("http://{}:{}", address, port)
    };
    open::that(&url).map_err(|e| e.to_string())
}
```

`open` crate 已存在（项目里用到了，依赖列表里有 `open = "5"`），无需新增。

---

## 6. 错误处理

| 场景 | 用户体验 |
|---|---|
| 后端 IP Helper 调用失败 | 顶部红色 Alert「无法读取系统端口表，正在重试…」+ 状态条 ●→● 红色；setInterval 继续跑，下一轮可能恢复 |
| 进程在扫描期间消失（pid 不存在） | 该行 processName 显 `--`；不报错；下轮自动消失，触发 diff 红色 |
| 用户权限不足无法查某些进程路径 | processPath 显 `--`，processName 仍可读（tasklist 不需要管理员） |
| 后端扫描超过 5 秒 | 标记 `scanDurationMs = -1`，状态条显「扫描超时」红色；下一轮继续 |
| 页面卸载时 | 清除 interval，清除所有 pending setTimeout（diff 淡出 timer） |

---

## 7. 性能预算

| 操作 | 预算 | 实测（待验证） |
|---|---|---|
| `list_listening_ports` 单次全流程 | < 200ms | 待测（IP Helper ~20ms + tasklist ~100ms × N 进程） |
| 前端 diff 计算（100 端口） | < 5ms | 纯 JS HashMap 查找，足够 |
| 表格重渲染（100 行） | < 16ms（60fps） | Ant Design Table 性能足够；考虑加 `shouldComponentUpdate` 优化 |
| 2 秒一次轮询总 CPU 占用 | < 1% | 待测 |
| 内存占用 | < 5MB | 只存当前 + 上一轮快照 |

**性能兜底**：扫描时长持续 > 2 秒时，自动延长 interval 到 5 秒（自适应），并在状态条显示「已降频」。

---

## 8. 测试策略

### 8.1 后端单元测试

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn parse_local_address_handles_loopback() { ... }

    #[test]
    fn parse_local_address_handles_ipv4_specific() { ... }

    #[test]
    fn parse_local_address_handles_ipv6() { ... }

    #[test]
    fn port_byte_order_is_little_endian_on_windows() { ... }
    // 复刻 process_lookup.rs:175-245 的端口解析回归测试
}
```

### 8.2 集成测试（Tauri Mock）

不写（项目当前无 e2e 框架）。手动测试清单：
- [ ] 启动多个测试服务（占用不同端口），验证表格实时显示
- [ ] kill 一个测试服务，验证「消失」红色高亮 + 5 秒淡出
- [ ] 重启一个测试服务（PID 变），验证「变更」黄色高亮
- [ ] 配置一个服务端口=8080，启动该服务，验证「冲突」红色色条
- [ ] 点击 🌍 按钮，验证浏览器打开
- [ ] 切到其他标签页 10 秒，切回，验证「已暂停（标签页隐藏）」+ 立即补刷
- [ ] 关闭所有测试服务后，验证「3 冲突」变 0，状态条更新

### 8.3 前端测试

- `usePortFilter.ts`：4 个 filter 模式的单元测试
- `usePortDiff.ts`：新增/变更/消失的判定逻辑测试
- 不测 Ant Design Table 渲染（依赖过重）

---

## 9. 迁移与兼容

### 9.1 保留旧命令

`inspect_ports(ports: number[])` **保留**，不删除——可能外部脚本/调试在用。`kill_process_by_pid` 保留并被新版表格复用。

### 9.2 Store 兼容

`useServiceStore.ports` 字段类型从 `PortInspectionItem` 扩展（新加 `state`/`protocol`/`localAddress` 字段，所有 `occupied: boolean` 派生自 `state === 'LISTENING'`）。现有读 `ports` 的代码加 `?? false` 兜底即可。

### 9.3 文件路径

- `src/pages/PortInspectorPageMain.tsx`：改为「瘦入口」，只 import 新模块，自身 < 50 行
- 新增 `src/modules/port-manager/` 和 `src/components/port/` 已有空目录，现填充

---

## 10. 风险与权衡

| 风险 | 影响 | 缓解 |
|---|---|---|
| `windows` crate 编译时间增加 | 首次 cargo build 慢 30s | 仅 release 编译，dev 不阻塞 |
| IPv6 地址解析 edge case | 某些端口可能漏报 | 单元测试覆盖，参考 `process_lookup.rs:89` |
| 系统上 LISTENING 端口很多（>200） | 表格性能 / 视觉密度 | 加虚拟滚动（rc-virtual-list）+ 默认按端口号排序 + 折叠次要协议 |
| 频繁扫描被杀毒软件报警 | 误报为可疑行为 | tasklist 加 `--no-display`，netstat 完全替换为 IP Helper API |
| 标签页 visibilitychange 触发频繁 | 抖动 | 用 debounce 300ms |

---

## 11. 实施分阶段

按 spec 性质属「单一聚焦功能」，可一气呵成；如需分阶段可拆为：

**Phase 1（核心）**：后端 `list_listening_ports` + 前端表格 + 2 秒轮询
**Phase 2（增强）**：颜色 diff + 暂停 + 状态条 + 🌍 按钮
**Phase 3（服务关联）**：「我的服务」过滤 + 冲突高亮

但建议**一次性交付**，避免 1/3 用户用着「半成品」。

---

## 12. 参考资料

- TCPView source: <https://learn.microsoft.com/en-us/sysinternals/downloads/tcpview>
- `GetExtendedTcpTable` API: <https://learn.microsoft.com/en-us/windows/win32/api/iphlpapi/nf-iphlpapi-getextendedtcptable>
- Ant Design Table: <https://ant.design/components/table-cn>
- Tauri command: <https://tauri.app/v1/guides/features/command/>

---

**设计已完成。请审阅后告诉我：**
1. 是否要调整任何部分？
2. 是否同意按 Phase 1 一次性交付？
3. 审阅通过后我会进入「写实施计划」阶段（调用 writing-plans skill）
