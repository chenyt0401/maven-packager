export type BuildStatus = 'IDLE' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED'

export type PersistedBuildStatus = 'SUCCESS' | 'FAILED' | 'CANCELLED'

export interface MavenProject {
  rootPath: string
  rootPomPath: string
  groupId?: string
  artifactId: string
  version?: string
  packaging?: string
  modules: MavenModule[]
}

export interface MavenModule {
  id: string
  name?: string
  artifactId: string
  groupId?: string
  version?: string
  packaging?: string
  relativePath: string
  pomPath: string
  children?: MavenModule[]
  errorMessage?: string
}

export interface GitBranch {
  name: string
  isCurrent: boolean
}

export interface GitRepositoryStatus {
  isGitRepo: boolean
  branch?: string
  branches: GitBranch[]
  upstream?: string
  aheadCount: number
  behindCount: number
  hasRemoteUpdates: boolean
  hasLocalChanges: boolean
  message?: string
}

export interface GitCommit {
  hash: string
  shortHash: string
  author: string
  date: string
  subject: string
}

export interface GitPullResult {
  success: boolean
  output: string
  status: GitRepositoryStatus
}

export interface GitSwitchBranchResult {
  success: boolean
  output: string
  status: GitRepositoryStatus
}

export interface BuildEnvironment {
  javaHome?: string
  javaVersion?: string
  javaPath?: string
  javaSource: EnvironmentSource
  mavenHome?: string
  mavenVersion?: string
  mavenPath?: string
  mavenSource: EnvironmentSource
  settingsXmlPath?: string
  settingsXmlSource: EnvironmentSource
  localRepoPath?: string
  localRepoSource: EnvironmentSource
  hasMavenWrapper: boolean
  mavenWrapperPath?: string
  useMavenWrapper: boolean
  wrapperSource: EnvironmentSource
  gitPath?: string
  gitVersion?: string
  gitSource: EnvironmentSource
  status: EnvironmentStatus
  errors: string[]
}

export type EnvironmentStatus = 'ok' | 'warning' | 'error'

export type EnvironmentSource = 'auto' | 'manual' | 'wrapper' | 'missing'

export type BuildDiagnosisCategory =
  | 'jdk_mismatch'
  | 'maven_missing'
  | 'wrapper_issue'
  | 'settings_missing'
  | 'dependency_download_failed'
  | 'repo_unreachable'
  | 'profile_invalid'
  | 'module_invalid'
  | 'test_failed'
  | 'unknown'

export interface BuildDiagnosis {
  id: string
  taskId: string
  summary: string
  category: BuildDiagnosisCategory
  possibleCauses: string[]
  suggestedActions: string[]
  keywordLines: string[]
}

export interface BuildOptions {
  projectRoot: string
  selectedModulePath: string
  goals: string[]
  profiles: string[]
  properties: Record<string, string | boolean>
  alsoMake: boolean
  skipTests: boolean
  customArgs: string[]
  editableCommand: string
}

export interface BuildArtifact {
  path: string
  fileName: string
  extension: string
  sizeBytes: number
  modifiedAt?: string
  modulePath: string
}

export interface BuildCommandPayload {
  options: BuildOptions
  environment: BuildEnvironment
}

export interface StartBuildPayload {
  projectRoot: string
  command: string
  modulePath: string
  moduleArtifactId?: string
  javaHome?: string
  mavenHome?: string
  useMavenWrapper: boolean
}

export interface BuildLogEvent {
  buildId: string
  stream: 'stdout' | 'stderr' | 'system'
  line: string
}

export interface BuildFinishedEvent {
  buildId: string
  status: PersistedBuildStatus
  durationMs: number
}

export interface BuildHistoryRecord {
  id: string
  createdAt: string
  projectRoot: string
  modulePath: string
  moduleArtifactId?: string
  command: string
  status: PersistedBuildStatus
  durationMs: number
  javaHome?: string
  mavenHome?: string
  useMavenWrapper: boolean
  buildOptions?: BuildOptions
  artifacts?: BuildArtifact[]
}

export interface BuildTemplate {
  id: string
  name: string
  projectRoot: string
  modulePath: string
  goals: string[]
  profiles: string[]
  properties: Record<string, string | boolean>
  alsoMake: boolean
  skipTests: boolean
  customArgs: string[]
  useMavenWrapper: boolean
  javaHome?: string
  mavenHome?: string
  createdAt?: string
  updatedAt?: string
  pinned?: boolean
}

export interface EnvironmentSettings {
  activeProfileId?: string
  profiles: EnvironmentProfile[]
  lastProjectPath?: string
  projectPaths?: string[]
}

export interface EnvironmentProfile {
  id: string
  name: string
  javaHome?: string
  mavenHome?: string
  settingsXmlPath?: string
  localRepoPath?: string
  useMavenWrapper: boolean
  updatedAt?: string
}
