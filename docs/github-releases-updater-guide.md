# GitHub Releases 更新接入说明

这份文档对应你现在的仓库：

- GitHub 仓库：`https://github.com/itmoenyu/DevTools-Launcher`
- 更新清单地址：`https://github.com/itmoenyu/DevTools-Launcher/releases/latest/download/latest.json`
- 发布方式：推送 `v*` 标签后，由 GitHub Actions 自动构建并创建 Release

## 1. 现在代码里已经改好的内容

我已经帮你接好了下面这些配置：

- `src-tauri/tauri.conf.json`
  已把 updater endpoint 改成 GitHub Releases 的 `latest.json` 下载地址。
- `package.json`
  版本号已改成 `0.1.0`，和当前 `src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 保持一致。
- `.github/workflows/release-tauri-github-updater.yml`
  已新增 GitHub Actions 工作流。以后只要推送 `v*` 标签，就会自动构建 Windows 安装包并创建 GitHub Release。

## 2. 你还需要手动做的事

### 第一步：把项目推到 GitHub 空仓库

你这个远程仓库现在还是空的，所以要先把本地代码推上去。

你可以在项目根目录终端里按顺序执行：

```powershell
git remote add origin 'https://github.com/itmoenyu/DevTools-Launcher.git'
git branch -M main
git add .
git commit -m 'feat: add tauri updater with github releases'
git push -u origin main
```

如果你本地已经有提交记录，只需要补 `git remote add origin ...` 和 `git push -u origin main` 即可。

### 第二步：在 GitHub 仓库里配置 2 个 Secrets

进入你的 GitHub 仓库页面：

- `Settings`
- `Secrets and variables`
- `Actions`

新增下面两个 Secret：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

它们分别填写：

- `TAURI_SIGNING_PRIVATE_KEY`
  你本地生成的 Tauri updater 私钥全文内容
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
  你生成这把私钥时输入的密码

注意：

- 私钥内容要完整复制，包括多行文本
- 不要把私钥提交进仓库

### 第三步：确认公钥已经写进 `tauri.conf.json`

你当前 `src-tauri/tauri.conf.json` 里的 `pubkey` 已经不是占位字符串了，这一步目前看是好的。

后面如果你换过新的签名密钥，记得同步把新的公钥写回 `tauri.conf.json`，不然老客户端会校验失败。

## 3. 以后怎么发一个新版本

每次发版都按这个顺序来：

### 3.1 先改版本号

把这 3 个地方改成同一个版本，例如 `0.2.0`：

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

### 3.2 提交代码并推到主分支

```powershell
git add .
git commit -m 'release: v0.2.0'
git push
```

### 3.3 打标签并推标签

```powershell
git tag v0.2.0
git push origin v0.2.0
```

这一步推送后，GitHub Actions 就会自动触发：

- 安装依赖
- 构建 Tauri Windows 安装包
- 生成 updater 产物
- 创建 GitHub Release
- 上传安装包和 `latest.json`

## 4. 发版后如何验证更新

### 场景一：当前安装的是旧版本

例如你本地先安装 `v0.1.0`，然后发布了 `v0.2.0`。

这时在旧版本应用里进入设置页，点击“检查更新”，理论上会出现：

- 发现新版本 `v0.2.0`
- 展示 Release Notes
- 可以一键下载安装并重启

### 场景二：当前已经是最新版

如果你已经安装的是最新版本，再点“检查更新”，页面会提示：

- 当前已是最新版

## 5. 最容易踩坑的地方

### 坑 1：只改了一个版本号

如果只改了一个文件的版本号，标签、Release 和应用内显示的版本可能会对不上。

### 坑 2：只创建 Release，但没推标签

你现在的工作流是“推送 `v*` 标签触发”，不是手动监听普通提交，所以一定要推标签。

### 坑 3：没有配 GitHub Actions Secrets

没配：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

工作流会构建失败，或者无法生成可用于更新校验的签名产物。

### 坑 4：仓库还是空的

如果 GitHub 上还没有主分支代码，Actions 工作流不会正常工作。

## 6. 这次工作流做了什么保护

我在工作流里加了两个发布前检查：

- 检查 updater endpoint 是否还是你这个仓库的 GitHub Releases 地址
- 检查 `pubkey` 是否还是占位字符串

这样能避免你以后误把占位配置带进正式版。

## 7. 你现在最先要做的两步

你现在最先做这两件事就行：

1. 把本地项目推到 `https://github.com/itmoenyu/DevTools-Launcher.git`
2. 在 GitHub 仓库里把 `TAURI_SIGNING_PRIVATE_KEY` 和 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 配好

等这两步完成后，你的第一次正式发版流程就是：

1. 改版本号到 `0.2.0`
2. 提交并推送
3. 推送标签 `v0.2.0`
4. 等 GitHub Actions 自动生成 Release
