use crate::models::deployment::{
    HttpProbeConfig, LogProbeConfig, PortProbeConfig, ProcessProbeConfig, ProbeStatus,
    StartupProbeConfig,
};
use crate::services::ssh_transport_service::SshConnection;
use chrono::Utc;
use std::time::{Duration, Instant};
use std::thread;

pub struct ProbeResult {
    pub success: bool,
    pub reason: String,
    pub pid: Option<String>,
    pub log_path: Option<String>,
    pub probe_statuses: Vec<ProbeStatus>,
}

pub fn run_startup_probe(
    conn: &mut SshConnection,
    config: &StartupProbeConfig,
    context: &ProbeContext,
    is_cancelled: &dyn Fn() -> bool,
    on_status: &dyn Fn(&[ProbeStatus]),
    on_log: &dyn Fn(&str),
) -> Result<ProbeResult, String> {
    let deadline = Instant::now() + Duration::from_secs(config.timeout_seconds.max(1));
    let interval = Duration::from_secs(config.interval_seconds.max(1).min(30));

    let mut http_success_count: u32 = 0;
    let mut port_success_count: u32 = 0;
    let mut log_success_matched = false;
    let mut detected_pid: Option<String> = None;
    let mut detected_log_path: Option<String> = None;
    let mut attempts: u32 = 0;

    if let Some(log_probe) = &config.log_probe {
        if log_probe.enabled {
            if let Some(log_path) = &log_probe.log_path {
                detected_log_path = Some(expand_probe_tokens(log_path, context));
            } else {
                detected_log_path = Some(context.deploy_log_path.clone());
            }
        }
    }

    if let Some(process_probe) = &config.process_probe {
        if process_probe.enabled {
            let pid_file = process_probe
                .pid_file
                .as_deref()
                .unwrap_or(&context.default_pid_file);
            let pid_file = expand_probe_tokens(pid_file, context);
            let cmd = format!("cat {} 2>/dev/null", shell_quote(&pid_file));
            if let Ok(result) = conn.execute_with_cancel(&cmd, || is_cancelled()) {
                let pid = result.output.trim().to_string();
                if !pid.is_empty() && pid.chars().all(|c| c.is_ascii_digit()) {
                    detected_pid = Some(pid);
                }
            }
        }
    }

    while Instant::now() < deadline {
        if is_cancelled() {
            return Err("部署已停止。".to_string());
        }

        attempts += 1;
        let mut statuses = Vec::new();

        let process_alive = check_process_probe(conn, config, context, &detected_pid, &mut statuses);
        let port_open = check_port_probe(conn, config, context, &mut statuses);
        let http_ok = check_http_probe(conn, config, context, &mut statuses);
        let log_result = check_log_probe(conn, config, context, &detected_log_path, &mut statuses);

        if let Some(process_probe) = &config.process_probe {
            if process_probe.enabled && !process_alive {
                return Ok(ProbeResult {
                    success: false,
                    reason: "启动失败：进程已退出".to_string(),
                    pid: detected_pid,
                    log_path: detected_log_path,
                    probe_statuses: statuses,
                });
            }
        }

        if log_result.failure_matched {
            return Ok(ProbeResult {
                success: false,
                reason: format!("启动失败：日志命中强失败关键字：{}", log_result.failure_keyword),
                pid: detected_pid,
                log_path: detected_log_path,
                probe_statuses: statuses,
            });
        }

        if http_ok {
            http_success_count += 1;
        } else {
            http_success_count = 0;
        }

        if port_open {
            port_success_count += 1;
        } else {
            port_success_count = 0;
        }

        if log_result.success_matched {
            log_success_matched = true;
        }

        if let Some(log_path) = &detected_log_path {
            let tail_cmd = format!(
                "tail -n 50 {} 2>/dev/null || true",
                shell_quote(log_path)
            );
            if let Ok(result) = conn.execute_with_cancel(&tail_cmd, || is_cancelled()) {
                for line in result.output.lines() {
                    on_log(line);
                }
            }
        }

        let success = evaluate_success(
            config,
            process_alive,
            port_success_count,
            http_success_count,
            log_success_matched,
        );

        if let Some(reason) = success {
            return Ok(ProbeResult {
                success: true,
                reason,
                pid: detected_pid,
                log_path: detected_log_path,
                probe_statuses: statuses,
            });
        }

        on_status(&statuses);

        let sleep_deadline = Instant::now() + interval;
        while Instant::now() < sleep_deadline {
            if is_cancelled() {
                return Err("部署已停止。".to_string());
            }
            thread::sleep(Duration::from_millis(250));
        }
    }

    let mut final_statuses = Vec::new();
    final_statuses.push(ProbeStatus {
        probe_type: "timeout".to_string(),
        status: "failed".to_string(),
        message: Some(format!(
            "启动探针检测超时（{}秒）",
            config.timeout_seconds
        )),
        check_count: Some(attempts),
        last_check_at: Some(Utc::now().to_rfc3339()),
    });

    Ok(ProbeResult {
        success: false,
        reason: format!("启动探针检测超时（{}秒）", config.timeout_seconds),
        pid: detected_pid,
        log_path: detected_log_path,
        probe_statuses: final_statuses,
    })
}

pub struct ProbeContext {
    pub remote_deploy_path: String,
    pub artifact_name: String,
    pub default_pid_file: String,
    pub deploy_log_path: String,
}

impl ProbeContext {
    pub fn new(remote_deploy_path: &str, artifact_name: &str) -> Self {
        let base_name = artifact_name
            .rsplit_once('.')
            .map(|(name, _)| name)
            .unwrap_or(artifact_name);
        Self {
            remote_deploy_path: remote_deploy_path.to_string(),
            artifact_name: artifact_name.to_string(),
            default_pid_file: format!("{}/{}.pid", remote_deploy_path, base_name),
            deploy_log_path: format!(
                "{}/logs/{}-{}.log",
                remote_deploy_path,
                base_name,
                chrono::Local::now().format("%Y%m%d%H%M%S")
            ),
        }
    }
}

fn check_process_probe(
    conn: &mut SshConnection,
    config: &StartupProbeConfig,
    context: &ProbeContext,
    detected_pid: &Option<String>,
    statuses: &mut Vec<ProbeStatus>,
) -> bool {
    let process_probe = match &config.process_probe {
        Some(p) if p.enabled => p,
        _ => return true,
    };

    let pid = match detected_pid {
        Some(p) if !p.is_empty() => p.clone(),
        _ => {
            let pid_file = process_probe
                .pid_file
                .as_deref()
                .unwrap_or(&context.default_pid_file);
            let pid_file = expand_probe_tokens(pid_file, context);
            let cmd = format!("cat {} 2>/dev/null", shell_quote(&pid_file));
            match conn.execute_with_cancel(&cmd, || false) {
                Ok(result) => result.output.trim().to_string(),
                Err(_) => {
                    statuses.push(ProbeStatus {
                        probe_type: "process".to_string(),
                        status: "unknown".to_string(),
                        message: Some("无法读取 PID 文件".to_string()),
                        check_count: None,
                        last_check_at: Some(Utc::now().to_rfc3339()),
                    });
                    return false;
                }
            }
        }
    };

    if pid.is_empty() {
        statuses.push(ProbeStatus {
            probe_type: "process".to_string(),
            status: "unknown".to_string(),
            message: Some("PID 文件为空".to_string()),
            check_count: None,
            last_check_at: Some(Utc::now().to_rfc3339()),
        });
        return false;
    }

    let cmd = format!("kill -0 {} 2>/dev/null", shell_quote(&pid));
    let alive = conn.execute_with_cancel(&cmd, || false).is_ok();

    statuses.push(ProbeStatus {
        probe_type: "process".to_string(),
        status: if alive { "alive" } else { "dead" }.to_string(),
        message: Some(if alive {
            format!("PID {} 存活", pid)
        } else {
            format!("PID {} 已退出", pid)
        }),
        check_count: None,
        last_check_at: Some(Utc::now().to_rfc3339()),
    });

    alive
}

fn check_port_probe(
    conn: &mut SshConnection,
    config: &StartupProbeConfig,
    context: &ProbeContext,
    statuses: &mut Vec<ProbeStatus>,
) -> bool {
    let port_probe = match &config.port_probe {
        Some(p) if p.enabled => p,
        _ => return false,
    };

    let host = expand_probe_tokens(&port_probe.host, context);
    let cmd = format!(
        "if command -v nc >/dev/null 2>&1; then nc -z -w 3 {host} {port}; else timeout 3 bash -lc {target}; fi",
        host = shell_quote(&host),
        port = port_probe.port,
        target = shell_quote(&format!("cat < /dev/null > /dev/tcp/{}/{}", host, port_probe.port)),
    );

    let open = conn.execute_with_cancel(&cmd, || false).is_ok();

    statuses.push(ProbeStatus {
        probe_type: "port".to_string(),
        status: if open { "open" } else { "closed" }.to_string(),
        message: Some(if open {
            format!("{}:{} 已监听", host, port_probe.port)
        } else {
            format!("{}:{} 未监听", host, port_probe.port)
        }),
        check_count: None,
        last_check_at: Some(Utc::now().to_rfc3339()),
    });

    open
}

fn check_http_probe(
    conn: &mut SshConnection,
    config: &StartupProbeConfig,
    context: &ProbeContext,
    statuses: &mut Vec<ProbeStatus>,
) -> bool {
    let http_probe = match &config.http_probe {
        Some(p) if p.enabled => p,
        _ => return false,
    };

    let url = match &http_probe.url {
        Some(u) => expand_probe_tokens(u, context),
        None => return false,
    };

    let method = if http_probe.method.is_empty() {
        "GET"
    } else {
        &http_probe.method
    };

    let cmd = format!(
        "curl -sS -L -X {} -w '\\n__HTTP_STATUS__:%{{http_code}}' --max-time 15 {}",
        shell_quote(method),
        shell_quote(&url),
    );

    let expected_codes = http_probe
        .expected_status_codes
        .as_deref()
        .unwrap_or(&[200]);
    let expected_body = http_probe.expected_body_contains.as_deref();

    match conn.execute_with_cancel(&cmd, || false) {
        Ok(result) => {
            let marker = "__HTTP_STATUS__:";
            if let Some(marker_index) = result.output.rfind(marker) {
                let body = result.output[..marker_index].trim_end().to_string();
                let status_str = result.output[marker_index + marker.len()..].trim();
                if let Ok(status_code) = status_str.parse::<u16>() {
                    let status_matched = expected_codes.contains(&status_code);
                    let body_matched = expected_body
                        .map(|keyword| body.contains(keyword))
                        .unwrap_or(true);
                    let ok = status_matched && body_matched;

                    statuses.push(ProbeStatus {
                        probe_type: "http".to_string(),
                        status: if ok { "success" } else { "failed" }.to_string(),
                        message: Some(if ok {
                            format!("HTTP {} {}", status_code, url)
                        } else {
                            format!(
                                "HTTP {} 不满足条件（期望状态码 {:?}{}）",
                                status_code,
                                expected_codes,
                                expected_body
                                    .map(|k| format!("，响应需包含 {}", k))
                                    .unwrap_or_default()
                            )
                        }),
                        check_count: None,
                        last_check_at: Some(Utc::now().to_rfc3339()),
                    });
                    return ok;
                }
            }
            statuses.push(ProbeStatus {
                probe_type: "http".to_string(),
                status: "failed".to_string(),
                message: Some("HTTP 检查未返回有效状态码".to_string()),
                check_count: None,
                last_check_at: Some(Utc::now().to_rfc3339()),
            });
            false
        }
        Err(_) => {
            statuses.push(ProbeStatus {
                probe_type: "http".to_string(),
                status: "failed".to_string(),
                message: Some(format!("HTTP 请求失败：{}", url)),
                check_count: None,
                last_check_at: Some(Utc::now().to_rfc3339()),
            });
            false
        }
    }
}

struct LogCheckResult {
    success_matched: bool,
    failure_matched: bool,
    failure_keyword: String,
}

fn check_log_probe(
    conn: &mut SshConnection,
    config: &StartupProbeConfig,
    context: &ProbeContext,
    detected_log_path: &Option<String>,
    statuses: &mut Vec<ProbeStatus>,
) -> LogCheckResult {
    let log_probe = match &config.log_probe {
        Some(p) if p.enabled => p,
        _ => {
            return LogCheckResult {
                success_matched: false,
                failure_matched: false,
                failure_keyword: String::new(),
            }
        }
    };

    let log_path = match detected_log_path {
        Some(p) => p.clone(),
        None => match &log_probe.log_path {
            Some(p) => expand_probe_tokens(p, context),
            None => context.deploy_log_path.clone(),
        },
    };

    let cmd = format!("tail -n 500 {} 2>/dev/null || true", shell_quote(&log_path));
    let content = match conn.execute_with_cancel(&cmd, || false) {
        Ok(result) => result.output,
        Err(_) => {
            statuses.push(ProbeStatus {
                probe_type: "log".to_string(),
                status: "unknown".to_string(),
                message: Some("无法读取日志文件".to_string()),
                check_count: None,
                last_check_at: Some(Utc::now().to_rfc3339()),
            });
            return LogCheckResult {
                success_matched: false,
                failure_matched: false,
                failure_keyword: String::new(),
            };
        }
    };

    let mut failure_keyword = String::new();
    let mut failure_matched = false;
    for pattern in &log_probe.failure_patterns {
        let matched = if log_probe.use_regex {
            regex_match(pattern, &content)
        } else {
            content.contains(pattern.as_str())
        };
        if matched {
            failure_matched = true;
            failure_keyword = pattern.clone();
            break;
        }
    }

    let mut success_matched = false;
    for pattern in &log_probe.success_patterns {
        let matched = if log_probe.use_regex {
            regex_match(pattern, &content)
        } else {
            content.contains(pattern.as_str())
        };
        if matched {
            success_matched = true;
            break;
        }
    }

    let mut warning_matched = false;
    let mut warning_keyword = String::new();
    for pattern in &log_probe.warning_patterns {
        let matched = if log_probe.use_regex {
            regex_match(pattern, &content)
        } else {
            content.contains(pattern.as_str())
        };
        if matched {
            warning_matched = true;
            warning_keyword = pattern.clone();
            break;
        }
    }

    let status = if failure_matched {
        "failed"
    } else if success_matched {
        "success"
    } else if warning_matched {
        "warning"
    } else {
        "checking"
    };

    let message = if failure_matched {
        format!("日志命中强失败关键字：{}", failure_keyword)
    } else if success_matched {
        "日志命中成功关键字".to_string()
    } else if warning_matched {
        format!("日志命中告警关键字：{}（不直接判失败）", warning_keyword)
    } else {
        "已发现启动日志，未发现失败关键字".to_string()
    };

    statuses.push(ProbeStatus {
        probe_type: "log".to_string(),
        status: status.to_string(),
        message: Some(message),
        check_count: None,
        last_check_at: Some(Utc::now().to_rfc3339()),
    });

    LogCheckResult {
        success_matched,
        failure_matched,
        failure_keyword,
    }
}

fn evaluate_success(
    config: &StartupProbeConfig,
    process_alive: bool,
    port_success_count: u32,
    http_success_count: u32,
    log_success_matched: bool,
) -> Option<String> {
    let has_http = config
        .http_probe
        .as_ref()
        .map(|p| p.enabled && p.url.is_some())
        .unwrap_or(false);
    let has_port = config
        .port_probe
        .as_ref()
        .map(|p| p.enabled)
        .unwrap_or(false);
    let has_log = config
        .log_probe
        .as_ref()
        .map(|p| p.enabled)
        .unwrap_or(false);

    if has_http {
        let required = config
            .http_probe
            .as_ref()
            .map(|p| p.consecutive_successes)
            .unwrap_or(2);
        if process_alive && http_success_count >= required {
            return Some(format!(
                "HTTP 健康检查连续成功 {} 次",
                http_success_count
            ));
        }
    }

    if has_http && has_log {
        let required = config
            .http_probe
            .as_ref()
            .map(|p| p.consecutive_successes)
            .unwrap_or(2);
        if process_alive && http_success_count >= required && log_success_matched {
            return Some(format!(
                "HTTP 健康检查成功且日志出现启动成功关键字"
            ));
        }
    }

    if has_port && has_log {
        let required = config
            .port_probe
            .as_ref()
            .map(|p| p.consecutive_successes)
            .unwrap_or(2);
        if process_alive && port_success_count >= required && log_success_matched {
            return Some("端口已监听且日志出现启动成功关键字".to_string());
        }
    }

    if has_port && !has_log {
        let required = config
            .port_probe
            .as_ref()
            .map(|p| p.consecutive_successes)
            .unwrap_or(2);
        if process_alive && port_success_count >= required {
            return Some(format!(
                "端口已监听，连续成功 {} 次",
                port_success_count
            ));
        }
    }

    if has_log && !has_http && !has_port {
        if process_alive && log_success_matched {
            return Some("日志出现启动成功关键字".to_string());
        }
    }

    None
}

fn expand_probe_tokens(value: &str, context: &ProbeContext) -> String {
    let today = chrono::Local::now().format("%Y%m%d").to_string();
    value
        .replace("${remoteDeployPath}", &context.remote_deploy_path)
        .replace("${artifactName}", &context.artifact_name)
        .replace("${date}", &today)
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn regex_match(pattern: &str, content: &str) -> bool {
    regex::Regex::new(pattern)
        .map(|re| re.is_match(content))
        .unwrap_or(false)
}

pub fn create_default_startup_probe() -> StartupProbeConfig {
    StartupProbeConfig {
        enabled: true,
        timeout_seconds: 120,
        interval_seconds: 3,
        process_probe: Some(ProcessProbeConfig {
            enabled: true,
            pid_file: None,
        }),
        port_probe: Some(PortProbeConfig {
            enabled: true,
            host: "127.0.0.1".to_string(),
            port: 8080,
            consecutive_successes: 2,
        }),
        http_probe: Some(HttpProbeConfig {
            enabled: false,
            url: Some("http://127.0.0.1:8080/actuator/health".to_string()),
            method: "GET".to_string(),
            expected_status_codes: Some(vec![200]),
            expected_body_contains: Some("UP".to_string()),
            consecutive_successes: 2,
        }),
        log_probe: Some(LogProbeConfig {
            enabled: true,
            log_path: None,
            success_patterns: vec!["Started".to_string()],
            failure_patterns: vec![
                "APPLICATION FAILED TO START".to_string(),
                "Application run failed".to_string(),
                "Port already in use".to_string(),
                "Address already in use".to_string(),
                "BindException".to_string(),
                "OutOfMemoryError".to_string(),
            ],
            warning_patterns: vec![
                "Exception".to_string(),
                "ERROR".to_string(),
                "WARN".to_string(),
            ],
            use_regex: false,
            only_current_deploy_log: true,
        }),
        success_policy: "health_first".to_string(),
    }
}
