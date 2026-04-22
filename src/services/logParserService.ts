import type {BuildLogEvent} from '../types/domain'

export interface ParsedBuildLog {
  firstCriticalLine?: string
  moduleName?: string
  keywordLines: string[]
}

const criticalPatterns = [
  /\[ERROR\]/i,
  /BUILD FAILURE/i,
  /COMPILATION ERROR/i,
  /Could not resolve/i,
  /Non-resolvable parent POM/i,
  /JAVA_HOME/i,
  /The JAVA_HOME environment variable is not defined correctly/i,
  /No such file or directory/i,
  /Unknown lifecycle phase/i,
  /The requested profile .* could not be activated/i,
  /There are test failures/i,
  /Failed tests:/i,
]

export function parseBuildLogs(logs: BuildLogEvent[]): ParsedBuildLog {
  const lines = logs.map((event) => event.line).filter(Boolean)
  const keywordLines = lines
    .filter((line) => criticalPatterns.some((pattern) => pattern.test(line)))
    .slice(0, 12)
  const firstCriticalLine = keywordLines.find((line) => !/^\[ERROR\]\s*$/.test(line))
    ?? keywordLines[0]
  const moduleName = extractModuleName(lines)

  return {
    firstCriticalLine,
    moduleName,
    keywordLines,
  }
}

function extractModuleName(lines: string[]) {
  const failedModule = lines
    .map((line) => line.match(/Failed to execute goal .* on project ([^:\s]+)/i)?.[1])
    .find(Boolean)
  if (failedModule) {
    return failedModule
  }

  return lines
    .map((line) => line.match(/Building ([^[]+?)\s+\[/i)?.[1]?.trim())
    .filter(Boolean)
    .at(-1)
}
