import type {BuildDiagnosis, BuildDiagnosisCategory, BuildEnvironment, BuildLogEvent,} from '../types/domain'
import {parseBuildLogs} from './logParserService'

interface DiagnosisRule {
  category: BuildDiagnosisCategory
  matches: (text: string, environment?: BuildEnvironment) => boolean
  summary: string
  causes: string[]
  actions: string[]
}

const rules: DiagnosisRule[] = [
  {
    category: 'jdk_mismatch',
    matches: (text, environment) =>
      /invalid target release|release version .* not supported|UnsupportedClassVersionError|source release .* requires target release/i.test(text)
      || Boolean(environment?.javaVersion && /1\.8|8/.test(environment.javaVersion) && /release version 1[17]|--release 1[17]/i.test(text)),
    summary: 'JDK 版本与项目编译要求不匹配。',
    causes: ['当前 JAVA_HOME 指向的 JDK 版本过低或过高。', '项目 pom.xml 的 maven-compiler-plugin 配置与本机 JDK 不一致。'],
    actions: ['检查 JAVA_HOME。', '在环境中心手动切换 JDK。', '核对 pom.xml 中的 source/target/release 配置。'],
  },
  {
    category: 'maven_missing',
    matches: (text, environment) =>
      /'mvn' is not recognized|mvn.cmd.*not recognized|系统找不到指定的文件|The system cannot find the file specified/i.test(text)
      || Boolean(environment?.mavenSource === 'missing' && !environment.useMavenWrapper),
    summary: '未找到可用的 Maven 执行器。',
    causes: ['Maven 未安装或未加入 PATH。', '手动指定的 Maven 路径不可执行。'],
    actions: ['检查 Maven 路径。', '在环境中心手动选择 mvn.cmd 或 Maven 目录。', '如果项目有 mvnw.cmd，可切换到 Maven Wrapper。'],
  },
  {
    category: 'wrapper_issue',
    matches: (text, environment) =>
      /mvnw.*not recognized|maven-wrapper\.jar|wrapperUrl|Could not find or load main class org\.apache\.maven\.wrapper/i.test(text)
      || Boolean(environment?.useMavenWrapper && !environment.hasMavenWrapper),
    summary: 'Maven Wrapper 不可用或文件缺失。',
    causes: ['项目缺少 mvnw.cmd 或 .mvn/wrapper 文件。', 'Wrapper 下载地址不可达。'],
    actions: ['检查项目根目录的 mvnw.cmd。', '修复 .mvn/wrapper/maven-wrapper.properties。', '临时切换为本机 Maven。'],
  },
  {
    category: 'settings_missing',
    matches: (text, environment) =>
      /settings\.xml.*not found|The specified user settings file does not exist/i.test(text)
      || Boolean(environment?.settingsXmlSource === 'missing' && /settings/i.test(text)),
    summary: 'settings.xml 缺失或路径无效。',
    causes: ['手动指定的 settings.xml 不存在。', '私服配置不在默认 Maven 配置路径中。'],
    actions: ['检查 settings.xml 路径。', '在环境中心重新选择 settings.xml。', '确认文件中 server、mirror、profile 配置完整。'],
  },
  {
    category: 'dependency_download_failed',
    matches: (text) =>
      /Could not resolve dependencies|Could not find artifact|Failed to collect dependencies|Non-resolvable parent POM/i.test(text),
    summary: '依赖解析或下载失败。',
    causes: ['依赖坐标不存在或版本写错。', '本地仓库缓存损坏。', '私服没有同步目标依赖。'],
    actions: ['检查依赖坐标和版本。', '清理相关本地仓库缓存后重试。', '检查 settings.xml 中的 mirror/repository 配置。'],
  },
  {
    category: 'repo_unreachable',
    matches: (text) =>
      /Connection timed out|Connection refused|Unknown host|PKIX path building failed|Received fatal alert|transfer failed|status code: 40[13]|status code: 50[023]/i.test(text),
    summary: '远程仓库或私服不可达。',
    causes: ['网络、代理或 VPN 不可用。', '私服地址、证书或账号权限异常。'],
    actions: ['检查网络或仓库地址。', '确认 settings.xml 中的私服账号与 mirror。', '如为 HTTPS 证书错误，检查 JDK 信任证书。'],
  },
  {
    category: 'profile_invalid',
    matches: (text) =>
      /The requested profile .* could not be activated|Profile .* does not exist|Unknown profile/i.test(text),
    summary: '指定的 Maven profile 不存在。',
    causes: ['命令中的 -P 名称拼写错误。', '目标 profile 只存在于特定 settings.xml 或父 pom 中。'],
    actions: ['检查 profile 名称是否存在。', '确认当前 settings.xml 与父 pom 已生效。'],
  },
  {
    category: 'module_invalid',
    matches: (text) =>
      /Could not find the selected project in the reactor|Child module .* does not exist|Non-readable POM|POM file .* does not exist/i.test(text),
    summary: '模块路径或 pom.xml 无效。',
    causes: ['-pl 参数中的模块路径不存在。', 'pom.xml modules 配置指向了错误目录。'],
    actions: ['重新选择模块后重试。', '检查父 pom.xml 的 modules 配置。'],
  },
  {
    category: 'test_failed',
    matches: (text) =>
      /There are test failures|Failed tests:|Tests run: .* Failures: [1-9]|maven-surefire-plugin/i.test(text),
    summary: '单元测试失败导致构建中断。',
    causes: ['测试用例断言失败。', '测试环境依赖缺失。'],
    actions: ['查看 surefire-reports 中的失败详情。', '修复测试或临时启用跳过测试后重试。'],
  },
]

export function diagnoseBuildFailure(
  taskId: string,
  logs: BuildLogEvent[],
  environment?: BuildEnvironment,
): BuildDiagnosis {
  const parsed = parseBuildLogs(logs)
  const text = logs.map((event) => event.line).join('\n')
  const rule = rules.find((item) => item.matches(text, environment))
  const category = rule?.category ?? 'unknown'
  const moduleSuffix = parsed.moduleName ? `（模块：${parsed.moduleName}）` : ''

  return {
    id: crypto.randomUUID(),
    taskId,
    category,
    summary: rule?.summary ?? `构建失败，首个关键错误：${parsed.firstCriticalLine ?? '未提取到明确错误行。'}${moduleSuffix}`,
    possibleCauses: rule?.causes ?? ['日志中没有匹配到已知规则。', '可能是插件、脚本或外部命令返回了非零退出码。'],
    suggestedActions: rule?.actions ?? ['查看首个 [ERROR] 附近的上下文。', '复制诊断结果并结合完整日志进一步排查。'],
    keywordLines: parsed.keywordLines.length > 0
      ? parsed.keywordLines
      : logs.slice(-8).map((event) => event.line),
  }
}
