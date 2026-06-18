# DevTools Launcher

> 本地开发服务管理面板 — 托管、启动、停止、监控你的日常开发服务

一款使用 **Tauri 2 + React 19 + Ant Design 6 + Rust** 构建的 Windows 桌面端应用，以毛玻璃质感的图形界面替代命令行或系统托盘来管理 Redis、MySQL 等本地开发服务。

![Tech Stack](https://img.shields.io/badge/React-19-61DAFB?logo=react) ![Tauri](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri) ![Rust](https://img.shields.io/badge/Rust-2021-000000?logo=rust) ![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ 功能特性

### 📦 服务管理
- **内置服务模板**：预置 Redis（端口 6379）和 MySQL（端口 3306）模板
- **自定义服务**：添加任意本地可执行文件作为托管服务
- **服务 CRUD**：创建、编辑、删除服务配置
- **丰富配置项**：可执行文件路径、工作目录、启动参数、环境变量、端口
- **停止策略**：普通停止（`taskkill`）或强制停止（`taskkill /F`）
- **健康检查**：支持「进程+端口」或「仅进程」两种策略

### 🔄 服务生命周期
- **启动**：`CREATE_NO_WINDOW` 静默拉起，自动采集 stdout/stderr
- **停止**：Redis 发送 `SHUTDOWN` 协议优雅停止，其余进程 `taskkill`
- **重启**：先停后启
- **启动恢复**：应用重启后自动检测并重新接管仍存活的上次托管实例

### 🔌 端口管理
- **端口扫描**：基于 `netstat -ano -p tcp` 检测端口占用
- **进程查找**：通过 `tasklist` + PowerShell `Get-CimInstance` 获取进程信息
- **进程终止**：`taskkill /PID /T /F` 强制结束
- **冲突识别**：自动区分「当前托管实例」「旧托管实例」「外部实例」

### 🚀 启动组编排
- 多服务顺序启动编排
- 依赖关系支持（后一个依赖前一个）
- 一键执行，启动失败自动回滚

### 📋 日志系统
- 通过 stdio 管道实时流式读取进程输出
- 日志持久化到 SQLite
- 按服务筛选、关键字搜索、按服务清空
- 前端内存保留最多 500 条/服务

### 📊 仪表盘
- 服务总数、运行中、端口占用、异常概览
- 最近活动时间线
- 批量启动/停止全部服务
- 常用端口快速扫描

### 📜 操作历史
- 记录每次启动/停止/重启/配置保存的结果
- 展示操作类型、结果（成功/失败）、消息和时间

### 🖥️ 桌面端特性
- **单实例**：确保只运行一个实例（`tauri-plugin-single-instance`）
- **系统托盘**：最小化到系统托盘，含「显示主窗口」和「退出」菜单
- **关闭到托盘**：关闭按钮仅隐藏到托盘，不退出进程
- **开机自启**：可选配置
- **启动最小化**：可选启动后隐藏主窗口

### 🎨 界面设计
- **玻璃态（Glassmorphism）设计**：毛玻璃质感、模糊背景、柔和阴影
- **Ant Design 深度定制**：全局 CSS 变量，全组件毛玻璃风格
- **深色/浅色自适应**：跟随系统 `prefers-color-scheme`

### 🔄 自动更新
- 基于 Tauri Updater 插件
- 支持 GitHub Releases 发布更新
- 检查 → 下载（进度条）→ 安装 → 自动重启

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| **前端框架** | React 19 + TypeScript 6 |
| **UI 组件** | Ant Design 6 + antd-style |
| **状态管理** | Zustand 5 |
| **路由** | react-router-dom 7 |
| **构建工具** | Vite 8 |
| **桌面框架** | Tauri 2 (Rust) |
| **后端语言** | Rust (edition 2021) |
| **数据库** | SQLite (rusqlite) |
| **日志** | tracing / tracing-subscriber |
| **检验** | Zod 4 |

### 目录结构

```
├── src/                          # 前端 (React + TypeScript)
│   ├── app/                      # 应用入口、路由、Provider
│   ├── pages/                    # 10 个功能页面
│   ├── components/               # 布局、通用组件
│   ├── hooks/                    # 数据引导、更新控制器
│   ├── store/                    # Zustand 状态管理
│   ├── types/                    # TypeScript 类型定义
│   ├── utils/                    # 格式化、状态呈现
│   ├── services/tauri-api/       # Tauri IPC 封装
│   └── styles/                   # 全局样式、CSS 变量、玻璃态主题
├── src-tauri/                    # 后端 (Rust)
│   ├── src/
│   │   ├── commands/             # 6 个 Tauri 命令模块
│   │   ├── service/              # 服务生命周期核心 (810 行)
│   │   ├── port/                 # 端口检测与进程查找
│   │   ├── logs/                 # 日志持久化与流式读取
│   │   ├── lifecycle/            # 应用生命周期
│   │   ├── startup/              # 启动初始化
│   │   ├── tray/                 # 系统托盘
│   │   └── db/                   # SQLite 数据库层
│   └── migrations/               # 数据库迁移 SQL
├── docs/                         # 更新发布指南
└── test/                         # 测试辅助脚本
```

---

## 🚀 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://www.rust-lang.org/) ≥ 1.77.2
- [Tauri CLI](https://v2.tauri.app/start/cli/)

### 安装与运行

```bash
# 安装前端依赖
npm install

# 启动开发模式（含 Tauri 窗口）
npm run tauri dev
```

### 构建

```bash
npm run tauri build
```

---

## 🗄️ 数据库

SQLite 数据库存储在 `%LOCALAPPDATA%\DevToolsLauncher\launcher.db`，包含 6 张表：

| 表名 | 说明 |
|------|------|
| `services` | 服务定义 |
| `service_runtime` | 运行时状态（PID/状态/心跳） |
| `logs` | 日志记录 |
| `operation_history` | 操作历史 |
| `launch_groups` / `launch_group_items` | 启动组及其项 |

---

## 🤝 贡献

欢迎提交 Issue 或 Pull Request。

---

## 📄 License

MIT
