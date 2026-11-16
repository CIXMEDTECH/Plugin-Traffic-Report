# 流量报告 / Traffic reports

[Vespera](https://github.com/CIXMEDTECH/Vespera) 探针面板的插件，插件 id 为 `traffic-report`。

按日、周、月把各节点的流量汇总发到通知渠道。每份报告有自己的周期、节点和渠道；面板停机错过的报告会在启动后补发，已发送的不会重发。

从 Vespera beta.7.1 升级时，原“通知 → 流量报告”里的规则会被面板自动迁移成这个插件的报告配置，安装插件后即可使用。webhook 收到的 `event` 仍是 `traffic_report`。

## 安装

- **插件市场**：在面板后台 **插件 → 插件市场** 里找到“流量报告”，点击安装，审核权限后启用。
- **手动上传**：从 [Releases](https://github.com/CIXMEDTECH/Plugin-Traffic-Report/releases) 下载 `traffic-report-<版本>.zip`，在 **插件 → 已安装 → 上传插件** 里上传。

申请的权限：`nodes`（读取节点和流量统计）、`notify`（发送通知）、`routes`（后台页面）。

## 开发

不需要安装依赖，只需要 Node.js 22 或更新版本。

```bash
node --test 'test/*.test.mjs'          # 测试：在 Node 里加载 main.js，用替身代替面板的 vespera 接口
node scripts/pack.mjs      # 打包到 dist/traffic-report-<版本>.zip，并输出 SHA-256
```

打包结果是可复现的：同样的源码总是得到同样的 zip 和 SHA-256，插件市场用它校验安装包。

接口说明见面板仓库的 [插件开发文档](https://github.com/CIXMEDTECH/Vespera/blob/main/docs/PLUGIN.md)。

## 发布

1. 修改 `vespera-plugin.json` 里的 `version`。
2. 推送同名标签：`git tag v<版本> && git push origin v<版本>`。
3. GitHub Actions 运行测试、打包，并把 zip 和 `.sha256` 附到 Release 上。带后缀（如 `-beta.1`）的版本发布为预发布。
4. [插件市场](https://github.com/CIXMEDTECH/Vespera-Plugin-Market) 每 6 小时检查一次 Release，校验通过后自动发起更新目录的 PR。
