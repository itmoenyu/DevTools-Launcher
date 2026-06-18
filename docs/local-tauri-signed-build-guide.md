# 本地构建签名版 Tauri 安装包说明

这份文档专门解决你刚才遇到的这个报错：

```text
A public key has been found, but no private key. Make sure to set `TAURI_SIGNING_PRIVATE_KEY` environment variable.
```

## 1. 为什么会报这个错

你现在在 `src-tauri/tauri.conf.json` 里已经配置了 updater 公钥，并且打开了：

```json
"createUpdaterArtifacts": true
```

这意味着：

- Tauri 在本地打包时，不只要生成安装包
- 还要顺手生成 updater 用的签名产物

而生成这些更新签名产物时，必须提供两样东西：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

所以当前报错的本质不是“构建失败了”，而是：

- 你已经给了公钥
- 但本地构建时没有把“对应的私钥”传给 Tauri CLI

## 2. 我已经帮你做了什么

我已经在项目里新增了一个本地构建脚本：

- [build-tauri-signed-local.ps1](file:///d:/project/DevTools%20Launcher/scripts/build-tauri-signed-local.ps1)

并且在 `package.json` 里新增了对应命令：

```json
"tauri:build:signed": "powershell -ExecutionPolicy Bypass -File ./scripts/build-tauri-signed-local.ps1"
```

这个脚本会帮你做几件事：

- 检查私钥文件是否存在
- 检查私钥密码是否存在
- 自动把 `TAURI_SIGNING_PRIVATE_KEY` 写入当前终端环境
- 自动把 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 写入当前终端环境
- 再执行 `npm run tauri build`

这样你以后就不需要每次手动敲一长串环境变量了。

## 3. 你第一次本地构建前要准备什么

### 3.1 找到你的 updater 私钥文件

你之前既然已经把公钥写进 `tauri.conf.json` 了，说明你应该已经生成过 updater 密钥。

脚本默认会去找这个位置：

```text
$HOME\.tauri\devtools-launcher.key
```

如果你的私钥文件就是放在这里，那你不用改脚本。

如果不是这个路径，也没关系，运行脚本时手动传参就行。

### 3.2 记住你的私钥密码

这个密码就是你生成 updater 私钥时设置的那个密码。

脚本支持两种方式拿密码：

- 你运行脚本时手动输入
- 你先在当前 PowerShell 终端里设置环境变量

## 4. 最简单的本地构建方式

### 方式 A：让脚本运行时询问密码

在项目根目录终端里执行：

```powershell
npm run tauri:build:signed
```

执行后：

- 如果脚本找到了默认私钥路径
- 且当前终端没有设置 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

它就会提示你手动输入密码。

### 方式 B：命令里直接指定私钥路径

如果你的私钥不在默认位置，用这个命令：

```powershell
powershell -ExecutionPolicy Bypass -File ./scripts/build-tauri-signed-local.ps1 -PrivateKeyPath 'D:\keys\devtools-launcher.key'
```

### 方式 C：先在当前终端设置密码，再执行脚本

如果你不想每次输入密码，可以先在当前 PowerShell 会话里设置：

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD='这里改成你的私钥密码'
npm run tauri:build:signed
```

注意：

- 这种方式只对“当前终端会话”生效
- 关闭终端后，这个环境变量就没了
- 这比把密码硬编码进项目文件更安全

## 5. 如果你想直接手工构建，也可以

如果你想完全手工控制，也可以在 PowerShell 里这样做：

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY='C:\Users\Lenovo\.tauri\devtools-launcher.key'
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD='这里改成你的私钥密码'
npm run tauri build
```

根据 Tauri 官方文档，`TAURI_SIGNING_PRIVATE_KEY` 可以传：

- 私钥内容
- 或者私钥文件路径

这里建议你传“文件路径”，因为更安全，也更不容易复制出错。

## 6. 构建成功后你应该看到什么

如果环境变量配置正确，构建成功后通常会在下面目录看到安装包和 updater 产物：

- `src-tauri/target/release/bundle/msi`
- `src-tauri/target/release/bundle/nsis`

同时还会生成 updater 需要的签名相关文件。

## 7. 你这次准备推 `v0.4.2`，我顺手已经帮你改好的地方

我已经把下面 3 处版本统一改成了 `0.4.2`：

- [package.json](file:///d:/project/DevTools%20Launcher/package.json)
- [Cargo.toml](file:///d:/project/DevTools%20Launcher/src-tauri/Cargo.toml)
- [tauri.conf.json](file:///d:/project/DevTools%20Launcher/src-tauri/tauri.conf.json)

这样你后面推标签时，就不会出现版本不一致的问题。

## 8. 你现在最推荐的执行顺序

你现在直接按这个顺序做就行：

1. 确认私钥文件真实存在
2. 在项目根目录终端执行 `npm run tauri:build:signed`
3. 按提示输入私钥密码
4. 等本地构建成功
5. `git add .`
6. `git commit -m 'release: v0.4.2'`
7. `git push`
8. `git tag v0.4.2`
9. `git push origin v0.4.2`

## 9. 如果还报错，最常见就是这几种

### 私钥路径错了

脚本会直接提示找不到文件。

### 私钥密码错了

构建时会继续失败，通常会提示私钥解密或签名失败。

### 公钥和私钥不是一对

就算构建过了，后面客户端检查更新时也会验签失败。

### GitHub Secrets 没配

这不会影响你本地构建，但会影响 GitHub Actions 自动发版。
