# 随机浏览器指纹功能设计

## 1. 背景

当前项目已经具备以下基础能力：

- `sidepanel -> SAVE_SETTING -> background/message-router -> chrome.storage.local` 的持久化配置链路
- `background/runtime-state.js` 的运行时会话状态分层
- `background/tab-runtime.js` 的 tab 管理与脚本注入能力
- `chrome.debugger`、`chrome.scripting`、`chrome.storage` 等扩展权限
- 基于 `background/steps/*` 的多步骤流程执行体系

现阶段需要为项目增加一个“随机浏览器指纹”能力，要求：

1. 能在每次启动一轮流程时生成一份新的浏览器指纹
2. 同一轮流程内所有步骤共享同一份指纹
3. 任意步骤都能方便地读取或应用该指纹
4. 配置入口与现有设置系统兼容
5. 第一版先覆盖中量级指纹项，不直接进入 Canvas/WebGL/AudioContext 噪声注入

## 2. 目标

本功能的目标不是实现一个无限扩展的全量反指纹引擎，而是在现有扩展架构内提供一套稳定、可复用、可渐进增强的“会话级随机指纹”能力。

第一版的具体目标：

1. 新增一组持久化的“指纹策略设置”
2. 在每轮流程启动时生成一份 `sessionFingerprint`
3. 提供 background 公共能力供任意步骤调用
4. 将指纹应用到目标 tab
5. 保证同一轮流程中指纹一致、下一轮流程可重新随机

## 3. 非目标

第一版明确不做以下内容：

1. 不做 Canvas 指纹噪声注入
2. 不做 WebGL 图像或渲染级伪装
3. 不做 AudioContext 指纹扰动
4. 不做 ClientRects 指纹扰动
5. 不追求对所有站点实现完全一致的深度反检测
6. 不支持“每个步骤单独重生指纹”
7. 不持久化保存每次运行生成出的完整指纹值

## 4. 推荐方案

采用“统一指纹对象 + 双通道应用”的方案。

### 4.1 核心思想

在 background 层统一生成一份结构化的指纹对象，再根据字段类型分别通过两类机制应用：

- `chrome.debugger / CDP`：负责更接近浏览器级的覆盖项
- `chrome.scripting.executeScript`：负责页面级对象与方法覆盖

该方案兼顾：

- 与现有架构的兼容性
- 任意步骤可复用
- 后续继续扩展高阶指纹项的空间

### 4.2 对比过的替代方案

#### 方案 A：仅内容脚本覆盖

优点：

- 实现快
- 改动面小

缺点：

- 对 `UA / timezone / locale / WebRTC` 的覆盖能力有限
- 后续容易变成补丁式堆叠

#### 方案 B：统一指纹对象 + 双通道应用

优点：

- 结构清晰
- 适配当前架构
- 易于扩展

缺点：

- 比纯脚本注入多一层调度和状态管理

#### 方案 C：全量 CDP 指纹引擎

优点：

- 控制力强

缺点：

- 实现与调试成本过高
- 第一版复杂度明显超出当前目标

结论：第一版采用方案 B。

## 5. 生命周期设计

### 5.1 生效粒度

本功能采用“每次运行固定”的生命周期策略：

1. 每次启动一轮流程时生成一份新的指纹
2. 本轮流程中的所有步骤共享这份指纹
3. 当前运行结束、重置、或开始新 `runId` 时，下一轮重新生成

### 5.2 为什么不采用其他粒度

- 不采用“全局固定”是因为它不符合随机指纹的会话语义
- 不采用“按步骤重生”是因为它容易造成同一流程内前后环境不一致，增加流程不稳定性

## 6. 数据模型

### 6.1 持久化设置

持久化配置只存“策略”，不存“本轮生成值”。

建议新增如下 persisted setting：

```js
{
  browserFingerprintEnabled: boolean,
  browserFingerprintMode: "per_run",
  browserFingerprintLocaleMode: "random" | "ip_based",
  browserFingerprintTimezoneMode: "random" | "ip_based",
  browserFingerprintWebRtcMode: "real" | "disabled" | "masked",
  browserFingerprintFontsMode: "real" | "random_profile",
  browserFingerprintMediaDevicesMode: "real" | "random_profile",
  browserFingerprintSpeechVoicesMode: "real" | "random_profile",
  browserFingerprintDoNotTrackEnabled: boolean,
  browserFingerprintColorSchemeMode: "light" | "dark" | "random",
}
```

第一版约束：

- `browserFingerprintMode` 第一版固定只支持 `per_run`
- UI 上可以展示模式，但不开放多种生命周期切换

### 6.2 运行时会话对象

运行时会话对象存放在 `runtimeState.flowState.openai` 这一侧，建议结构如下：

```js
{
  browserFingerprintSessionId: string,
  browserFingerprintGeneratedAt: number,
  browserFingerprintAppliedTabs: {
    [tabId: string]: {
      fingerprintSessionId: string,
      appliedAt: number,
      source: string
    }
  },
  sessionFingerprint: {
    identity: {
      userAgent: string,
      platform: string,
      language: string,
      languages: string[],
      timezone: string,
      colorScheme: "light" | "dark",
    },
    device: {
      screen: {
        width: number,
        height: number,
        availWidth: number,
        availHeight: number,
        colorDepth: number,
        pixelDepth: number,
      },
      devicePixelRatio: number,
      hardwareConcurrency: number,
      deviceMemory: number,
      maxTouchPoints: number,
    },
    privacy: {
      doNotTrack: "1" | "0" | null,
      webrtcMode: "real" | "disabled" | "masked",
    },
    profiles: {
      fontProfile: string,
      mediaDevicesProfile: string,
      speechVoicesProfile: string,
    },
    meta: {
      osFamily: "windows",
      browserFamily: "chrome",
      region: string,
      seed: string,
    }
  }
}
```

## 7. 生成规则

### 7.1 总体规则

第一版采用“预设池 + 少量扰动”的方式生成，避免字段之间出现不合理组合。

生成流程：

1. 先选择一个设备档案
2. 再从该档案派生 identity/device/privacy/profile 各字段
3. 对可轻微变化的值做有限扰动

### 7.2 档案策略

第一版固定以 `Windows + Chrome` 为主线。

原因：

1. 当前项目运行环境就是 Chromium 扩展
2. 与现有目标站点兼容性最好
3. 可以避免跨 OS 指纹组合导致的不一致

### 7.3 字段一致性规则

生成器必须保证以下一致性：

1. `userAgent` 与 `platform` 必须匹配 `Windows + Chrome`
2. `screen`、`devicePixelRatio`、`maxTouchPoints` 必须与桌面设备语义一致
3. `language/languages/timezone/region` 必须来自同一地区策略
4. `hardwareConcurrency/deviceMemory` 必须落在常见桌面范围内
5. `fontProfile/mediaDevicesProfile/speechVoicesProfile` 必须与语言区域协调

### 7.4 与代理/IP 的关系

如果流程运行前已经具备可靠的代理出口地区信息，则：

- `language` 可优先跟随出口地区
- `timezone` 可优先跟随出口地区

如果没有可靠地区信息，则：

- 从预设地区池随机选择

## 8. 应用机制

### 8.1 双通道应用

#### A. CDP / debugger 应用

适合通过 CDP 应用的字段：

1. `userAgent`
2. `timezone`
3. `locale`

要求：

- 尽量在页面主要逻辑执行前完成
- 对同一 tab 重复调用时要避免无意义重复附加/覆盖

#### B. scripting.executeScript 注入

适合通过注入覆盖的字段：

1. `navigator.platform`
2. `navigator.language`
3. `navigator.languages`
4. `navigator.hardwareConcurrency`
5. `navigator.deviceMemory`
6. `navigator.maxTouchPoints`
7. `navigator.doNotTrack`
8. `screen.*`
9. `mediaDevices.enumerateDevices`
10. `speechSynthesis.getVoices`

第一版要求：

- 覆盖逻辑集中在一份统一注入函数中
- 不在各步骤文件内复制或拼装覆盖脚本

### 8.2 WebRTC 处理

第一版的 WebRTC 只做策略层支持，不做重量级全链路伪装。

支持模式：

1. `real`
2. `disabled`
3. `masked`

第一版最稳妥的行为定义：

- `real`：不做额外覆盖
- `disabled`：将关键入口置为不可用或返回受限结果
- `masked`：做最小暴露控制，但不承诺完整 SDP/ICE 仿真

## 9. 模块划分

### 9.1 新增模块

新增 `background/browser-fingerprint.js`，负责：

1. 生成指纹对象
2. 维护运行时序列化/反序列化
3. 应用指纹到 tab
4. 查询某个 tab 是否已应用当前会话指纹

建议导出接口：

```js
createBrowserFingerprintModule(deps)
getOrCreateSessionFingerprint(state, options)
clearSessionFingerprint(options)
applyFingerprintToTab(tabId, fingerprint, options)
ensureFingerprintAppliedForTab(tabId, options)
buildFingerprintSettingsPatch(input)
```

### 9.2 需要接入的现有文件

#### `background.js`

需要补充：

1. persisted setting defaults
2. persisted setting keys
3. setting normalization
4. export/import settings 支持

#### `background/runtime-state.js`

需要补充：

1. `flowState.openai` 下的 fingerprint 字段
2. flatten/build 逻辑

#### `background/message-router.js`

需要补充：

1. 保存指纹相关设置
2. 在启动流程时确保具备会话指纹
3. 在需要时提供主动随机/重置入口

#### `background/tab-runtime.js`

需要补充：

1. 统一的“tab 应用指纹”接入点
2. 与 source/tab 映射配合的指纹应用辅助逻辑

#### `sidepanel/sidepanel.html`

新增“浏览器指纹”设置区。

#### `sidepanel/sidepanel.js`

需要补充：

1. 读取/展示指纹设置
2. 保存设置
3. 提供手动“本轮重新随机”或“显示当前策略”的入口

#### `sidepanel/sidepanel.css`

补充对应的样式。

## 10. 步骤调用方式

### 10.1 统一调用原则

步骤本身不关心如何生成，只关心“当前 tab 是否已经应用当前会话指纹”。

推荐调用链：

1. 步骤进入目标页面前
2. 调用 `ensureFingerprintAppliedForTab(tabId, options)`
3. 该函数内部：
   - 获取当前 `sessionFingerprint`
   - 判断当前 tab 是否已应用同一 `browserFingerprintSessionId`
   - 如未应用则执行双通道应用
   - 更新 `browserFingerprintAppliedTabs`

当前实现已经在 `background/tab-runtime.js` 中沉淀出三种推荐入口，后续新增流程步骤或后台辅助链路时应优先复用：

1. `ensureFingerprintAppliedForTab(tabId, { source })`
   - 适用于：tab 已经存在，只需要确保当前会话指纹已落到该 tab。
2. `navigateTabWithFingerprint(source, tabId, url, options)`
   - 适用于：复用已有 tab，并把它导航到新的 URL。
3. `createTabWithFingerprint(source, createProperties, options)`
   - 适用于：需要新开一个 automation tab，并在创建后立即应用当前会话指纹。

如果某段逻辑只是“切到前台”而不改 URL，可以继续直接使用 `chrome.tabs.update(tabId, { active: true })`；只有“新开到某个 URL”或“把现有 tab 导航到某个 URL”这两类入口，才应优先走上述统一 helper。

### 10.2 运行时懒生成

如果用户不是从完整自动流程启动，而是手动从中间步骤开始：

- 当步骤首次请求当前 run 的 fingerprint 时，允许懒生成一次

这样可以避免把功能绑定死在某个固定启动步骤。

## 11. UI 设计

第一版 UI 只做必要入口，不做重型面板。

建议在 sidepanel 增加一块“浏览器指纹”设置区，内容包括：

1. 总开关：启用随机浏览器指纹
2. 生命周期说明：每轮流程自动生成一份
3. 语言：随机 / 跟随 IP
4. 时区：随机 / 跟随 IP
5. WebRTC：真实 / 禁用 / 受限
6. 字体：真实 / 随机档案
7. 媒体设备：真实 / 随机档案
8. 语音：真实 / 随机档案
9. DNT：开启 / 关闭
10. 可选操作：重新随机当前运行指纹

UI 不直接展示所有具体字段值，避免设置面板过重。若后续需要调试，可再单独加“开发者诊断视图”。

## 12. 错误处理

### 12.1 原则

指纹应用失败时，不应让状态悄悄漂移。

### 12.2 失败分类

1. 生成失败：直接中断当前流程启动或当前步骤继续执行
2. CDP 应用失败：记录日志，按配置决定是否继续尝试注入层
3. 注入失败：记录日志，并标记该 tab 未成功应用当前会话指纹
4. tab 已失效：跳过应用，等待后续 tab 恢复或重建

### 12.3 运行日志

建议增加结构化日志，例如：

```txt
[fingerprint] generated session fingerprint for run <runId>
[fingerprint] applied debugger overrides to tab <tabId>
[fingerprint] injected page fingerprint overrides to tab <tabId>
[fingerprint] fingerprint apply failed on tab <tabId>: <reason>
```

## 13. 测试策略

### 13.1 单元测试

针对生成器做测试：

1. 固定 seed 时输出稳定
2. `Windows + Chrome` 组合一致
3. 语言/时区/地区组合一致
4. 设备字段落在合理范围内

### 13.2 应用层测试

针对应用函数做测试：

1. CDP 字段映射正确
2. 注入脚本 payload 完整
3. 重复对同一 tab 应用同一会话指纹时具备幂等性

### 13.3 流程回归测试

挑选关键流程验证：

1. 启动流程时可生成会话指纹
2. 中间步骤可读取当前会话指纹
3. 不会破坏现有 tab/runtime/step 执行流程

## 14. 验收标准

实现完成后，必须满足以下验收条件：

1. 用户可以在 sidepanel 中开启随机浏览器指纹策略
2. 每次启动一轮流程时都会生成一份新的会话级指纹
3. 同一轮流程中所有步骤共用同一份指纹
4. 任意步骤可以通过公共接口应用指纹到当前 tab
5. 目标 tab 中能观察到语言、时区、屏幕、硬件参数等已变化
6. 新一轮流程启动后可重新随机
7. 设置导出/导入支持指纹策略配置
8. 当前项目已有主要流程不因该功能而失稳

## 15. 实施顺序

建议按以下顺序实现：

1. 扩展 persisted settings schema
2. 扩展 runtime-state 的 fingerprint 字段
3. 新增 `background/browser-fingerprint.js`
4. 接入 `message-router` 与流程启动点
5. 接入 `tab-runtime` 的统一应用入口
6. 增加 sidepanel 设置区
7. 编写单元测试与应用层测试
8. 跑关键流程回归验证

## 16. 结论

第一版随机浏览器指纹功能应当作为一个“会话级、可复用、可渐进增强”的公共能力落地，而不是某个步骤内的局部脚本技巧。

最合适的落地方式是：

1. 持久化层只保存策略
2. 运行时层为每轮流程生成一份 `sessionFingerprint`
3. 所有步骤通过统一 background 接口读取和应用
4. 应用上采用 `debugger + scripting` 双通道组合

该设计既符合当前项目架构，也为后续增加更重的指纹项预留了清晰扩展路径。
