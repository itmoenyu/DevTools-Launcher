# 桌面端更新发布说明

这份文档专门对应设置页里的“检查更新”功能。

现在代码里已经把更新按钮、版本检查、下载、安装、重启链路接好了，但真正能给用户发更新，还需要你手动完成下面这些配置。因为这些内容涉及你自己的发布服务器、签名密钥和发布流程，所以不能直接写死在仓库里。

## 1. 先确认 3 处版本号保持一致

每次准备发新版本前，都要同时检查下面 3 个文件里的版本号：

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

如果这 3 个地方版本号不一致，后续排查更新问题会非常麻烦。

## 2. 生成 Tauri 更新签名密钥

在项目根目录打开终端后，执行下面这条命令生成签名密钥：

```powershell
npm run tauri signer generate -- -w $HOME/.tauri/devtools-launcher.key
```

这一步会得到两样东西：

- 私钥文件：默认会保存在你上面指定的位置，比如 `$HOME/.tauri/devtools-launcher.key`
- 公钥内容：终端里会打印出来一段很长的字符串

注意：

- 私钥只能你自己保存，绝对不要提交到 Git 仓库。
- 公钥可以放进项目配置里，它是给客户端校验更新包真伪用的。

## 3. 把公钥写进 `tauri.conf.json`

打开 `src-tauri/tauri.conf.json`，找到下面这个位置：

```json
"plugins": {
  "updater": {
    "pubkey": "PLEASE_REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY",
    "endpoints": [
      "https://your-update-server.example.com/latest.json"
    ],
    "windows": {
      "installMode": "passive"
    }
  }
}
```

你需要手动替换两处内容：

- `pubkey`
  把占位字符串替换成第 2 步生成出来的真实公钥内容。
- `endpoints`
  把示例地址替换成你自己的更新清单地址。

## 4. 准备更新服务器返回的 `latest.json`

最简单的方式，是让更新服务器提供一个静态 `latest.json` 文件。

Windows x64 至少要返回下面这种结构：

```json
{
  "version": "0.2.0",
  "notes": "1. 新增设置页检查更新入口\n2. 支持一键下载安装重启\n3. 优化失败提示",
  "pub_date": "2026-06-18T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "这里填写 .sig 文件里的完整签名内容",
      "url": "https://your-update-server.example.com/downloads/devtools-launcher-0.2.0-x64-setup.exe"
    }
  }
}
```

每个字段的作用：

- `version`
  新版本号。必须比当前客户端版本高，客户端才会认为有更新。
- `notes`
  更新说明。设置页会把这段内容展示给用户。
- `pub_date`
  发布时间，建议用 ISO 时间格式。
- `platforms.windows-x86_64.url`
  对应平台的安装包下载地址。
- `platforms.windows-x86_64.signature`
  对应安装包的签名内容。这里要填 `.sig` 文件的文本内容，不是文件路径。

## 5. 构建带更新能力的安装包

项目已经在 `src-tauri/tauri.conf.json` 里打开了：

```json
"createUpdaterArtifacts": true
```

这表示执行 Tauri 构建时，会额外生成更新所需的签名产物。

你发布一个新版本时，通常会得到：

- 安装包，例如 `.exe` 或 `.msi`
- 对应的签名文件，例如 `.sig`

你需要把：

- 安装包上传到下载服务器
- 签名内容写进 `latest.json`

## 6. 如果你使用 CI/CD 自动发布

如果你后面打算用 GitHub Actions 之类的流水线自动发版，一般还需要配置这两个敏感信息：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

含义分别是：

- `TAURI_SIGNING_PRIVATE_KEY`
  第 2 步生成的私钥文件内容
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
  生成私钥时使用的密码

注意：

- 这两个值应该放在 CI 平台的 Secrets 里
- 不要写进仓库里的配置文件

## 7. 本地验证时你会看到什么

设置页点击“检查更新”后，可能出现这几类结果：

- 已是最新版
  说明请求成功了，但服务器返回的版本没有比当前版本新。
- 发现新版本
  页面会展示新版本号和更新说明，并允许一键下载安装重启。
- 检查失败
  页面会尽量把错误原因翻译成可读中文，例如：
  - 更新地址没配
  - 公钥没配
  - 服务器 404
  - 网络超时
  - `latest.json` 结构错误

## 8. 最容易踩坑的地方

- `pubkey` 里必须填公钥内容，不能填文件路径。
- `signature` 里必须填 `.sig` 文件内容，不能填文件路径。
- `endpoints` 在生产环境里必须是 HTTPS 地址。
- `latest.json` 里平台键名要和当前安装包平台匹配，Windows x64 一般用 `windows-x86_64`。
- 只有“下一次”发布的新版本，才能被“上一版”客户端检测到更新。

## 9. 当前项目里已经改好的部分

下面这些内容已经接入完成，不需要你再手写业务逻辑：

- 设置页里的“检查更新”入口
- 新版本号展示
- 更新说明展示
- 一键下载安装
- 安装完成后自动重启
- 常见失败原因的中文提示

