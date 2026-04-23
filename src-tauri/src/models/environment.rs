use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentSettings {
    pub active_profile_id: Option<String>,
    #[serde(default)]
    pub profiles: Vec<EnvironmentProfile>,
    pub last_project_path: Option<String>,
    #[serde(default)]
    pub project_paths: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentProfile {
    pub id: String,
    pub name: String,
    pub java_home: Option<String>,
    pub maven_home: Option<String>,
    pub settings_xml_path: Option<String>,
    pub local_repo_path: Option<String>,
    pub use_maven_wrapper: bool,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EnvironmentStatus {
    Ok,
    Warning,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EnvironmentSource {
    Auto,
    Manual,
    Wrapper,
    Missing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildEnvironment {
    pub java_home: Option<String>,
    pub java_version: Option<String>,
    pub java_path: Option<String>,
    pub java_source: EnvironmentSource,
    pub maven_home: Option<String>,
    pub maven_version: Option<String>,
    pub maven_path: Option<String>,
    pub maven_source: EnvironmentSource,
    pub settings_xml_path: Option<String>,
    pub settings_xml_source: EnvironmentSource,
    pub local_repo_path: Option<String>,
    pub local_repo_source: EnvironmentSource,
    pub has_maven_wrapper: bool,
    pub maven_wrapper_path: Option<String>,
    pub use_maven_wrapper: bool,
    pub wrapper_source: EnvironmentSource,
    pub git_path: Option<String>,
    pub git_version: Option<String>,
    pub git_source: EnvironmentSource,
    pub status: EnvironmentStatus,
    pub errors: Vec<String>,
}
