import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
} from "cursor/canvas";

export default function AdaArchitectureBlueprint() {
  return (
    <Stack gap={18}>
      <H1>ADA 当前项目设计架构与代码架构</H1>
      <Text tone="secondary">
        基于当前 monorepo 实际代码组织（apps / packages / plugins）整理，聚焦运行链路、模块职责、依赖关系与扩展边界。
      </Text>

      <Grid columns={4} gap={12}>
        <Stat label="入口应用" value="4" />
        <Stat label="核心包" value="10+" />
        <Stat label="驱动插件" value="4" />
        <Stat label="主协议" value="MCP + CLI" />
      </Grid>

      <H2>一、设计架构（业务与运行视角）</H2>
      <Table
        headers={["层级", "当前实现", "核心职责", "代表目录"]}
        rows={[
          ["入口层", "CLI / MCP / Launcher / GUI", "接收用户请求并接入运行时", "apps/ada-agent, apps/ada-mcp-server, apps/ada-mcp-launcher, apps/ada-gui"],
          ["编排层", "@ada/agent + @ada/agent-core", "任务编排、运行控制、能力导出", "apps/ada-agent, packages/agent-core"],
          ["依赖安装", "@ada/install-deps + @ada/runtime-probe", "npm/浏览器/hdc 安装、移动运行时探针", "packages/install-deps, packages/runtime-probe"],
          ["插件主机层", "@ada/plugin-host + @ada/plugin-sdk", "驱动插件生命周期、接口契约、能力注册", "packages/plugin-host, packages/plugin-sdk"],
          ["驱动执行层", "playwright / android / ios / harmony", "各平台直连执行与结果回传", "plugins/driver-playwright, driver-android, driver-ios, driver-harmony"],
          ["协议与传输层", "contracts + transport-http/stream + driver-rpc", "请求响应模型、跨进程通信、流式输出", "packages/contracts, packages/transport-*, packages/driver-rpc"],
          ["基础能力层", "runtime / download-probe / graphics", "环境探测、镜像测速、视觉回退、工具目录", "packages/core-runtime, packages/download-probe, packages/install-deps"],
        ]}
      />

      <Grid columns={2} gap={14}>
        <Card>
          <CardHeader title="主链路 A：CLI 运行链路" />
          <CardBody>
            <Stack gap={6}>
              <Text>1. `@ada/agent` 接收任务（run/start/install-deps）。</Text>
              <Text>2. `@ada/install-deps` 安装 Playwright 浏览器、hypium-driver、hdc 与移动环境检查。</Text>
              <Text>3. `@ada/install-deps` 内 `tools-paths` 注入 `ADA_TOOLS_DIR` / `HDC_HOME` / PATH。</Text>
              <Text>4. `plugin-host` 装载驱动插件并路由平台调用。</Text>
              <Text>5. 通过 contracts 统一返回执行结果与诊断信息。</Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="主链路 B：MCP 运行链路" />
          <CardBody>
            <Stack gap={6}>
              <Text>1. `@ada-mcp/launcher` 负责源探测与拉起 mcp-server。</Text>
              <Text>2. `@ada-mcp/mcp-server` 暴露 20+ MCP 工具接口。</Text>
              <Text>3. 工具调用进入 `@ada/agent` 能力并复用同一插件体系。</Text>
              <Text>4. 结果通过 stdio/HTTP 返还给 Cursor/Host 侧。</Text>
              <Text>5. 同号发布策略保证 launcher 与 server 兼容。</Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Callout tone="info" title="当前设计重点">
        统一核心能力沉淀在 `@ada/agent` 与 packages 层；入口只做协议适配。这样能避免 CLI/MCP/GUI 出现逻辑分叉，版本升级成本更低。
      </Callout>

      <Divider />

      <H2>二、代码架构（仓库结构与职责映射）</H2>
      <Grid columns={3} gap={12}>
        <Card>
          <CardHeader title="apps 层（入口）" />
          <CardBody>
            <Stack gap={6}>
              <Row gap={6}><Pill>@ada/agent</Pill></Row>
              <Text>CLI 主入口；含依赖安装、诊断、任务执行。</Text>
              <Row gap={6}><Pill>@ada-mcp/mcp-server</Pill></Row>
              <Text>MCP 服务端；将能力封装为 MCP tools。</Text>
              <Row gap={6}><Pill>@ada-mcp/launcher</Pill></Row>
              <Text>拉起器；版本兜底、镜像探测、安装策略分发。</Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="packages 层（复用能力）" />
          <CardBody>
            <Stack gap={6}>
              <Text>`contracts`: 统一输入输出协议模型。</Text>
              <Text>`core-runtime`: 工作区/运行时定位与基础工具。</Text>
              <Text>`plugin-host` + `plugin-sdk`: 插件框架核心。</Text>
              <Text>`transport-http/stream`: 协议传输实现。</Text>
              <Text>`download-probe`: npm / Playwright CDN 镜像测速与择优。</Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="plugins 层（平台执行）" />
          <CardBody>
            <Stack gap={6}>
              <Text>`driver-playwright`: Web（Playwright 长连接）。</Text>
              <Text>`driver-android`: Android（adb + UIA2 直连）。</Text>
              <Text>`driver-ios`: iOS（WDA HTTP 直连）。</Text>
              <Text>`driver-harmony`: HarmonyOS NEXT（hdc + hypium-driver）。</Text>
              <Text tone="secondary">各平台独立插件，经 plugin-host 统一契约接入。</Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <H3>关键代码边界（当前版本）</H3>
      <Table
        headers={["边界主题", "建议放置位置", "不建议放置位置", "原因"]}
        rows={[
          ["协议 Schema", "packages/contracts", "apps/* 各自定义", "避免入口间字段漂移"],
          ["依赖安装策略", "packages/install-deps", "plugins/driver-*", "安装是运行前置，不应耦合执行插件"],
          ["工具路径与环境变量", "packages/install-deps/src/tools-paths.ts", "launcher.mjs 内重复实现", "保证 CLI/MCP 行为一致"],
          ["平台动作语义", "plugins/driver-playwright 等", "agent-core", "保持编排与执行解耦"],
          ["镜像探测与下载测速", "packages/download-probe", "各入口内联复制", "统一策略便于灰度与排障"],
        ]}
      />
    </Stack>
  );
}
